import httpx
from fastapi import HTTPException
from typing import Dict, Any, List
from collections import defaultdict

GITHUB_API_BASE = "https://api.github.com"

async def scrape_github(github_url: str) -> Dict[str, Any]:
    """
    Extract GitHub user and repository data from GitHub REST API.
    Handles rate-limits gracefully by returning partial data if blocked.
    """
    # Extract username from URL
    if "github.com/" in github_url:
        username = github_url.split("github.com/")[-1].strip("/")
    else:
        username = github_url.strip("/")

    async with httpx.AsyncClient() as client:
        # Fetch user
        user_url = f"{GITHUB_API_BASE}/users/{username}"
        user_response = await client.get(user_url, timeout=10.0)
        
        if user_response.status_code == 404:
             raise HTTPException(status_code=404, detail=f"GitHub user '{username}' not found")
        
        # Check rate limit early
        rate_limited = user_response.status_code == 403 and "rate limit" in user_response.text.lower()
        if rate_limited:
            # We can't even get the user, return minimal stub
            return {
                "username": username,
                "repo_count": 0,
                "language_percentages": {},
                "commit_frequency": "Unknown (Rate Limited)",
                "repositories": []
            }
        
        # Fetch user repos
        repos_url = f"{GITHUB_API_BASE}/users/{username}/repos?per_page=100"
        repos_response = await client.get(repos_url, timeout=10.0)
        
        repos_data = []
        if repos_response.status_code == 200:
            repos_data = repos_response.json()
        elif repos_response.status_code == 403:
             # Rate limited on repos fetch, return empty list instead of failure
             pass 
        elif repos_response.status_code >= 400:
            raise HTTPException(status_code=repos_response.status_code, detail=f"GitHub API Error: {repos_response.text}")

        # Process repositories
        processed_repos = []
        language_bytes: Dict[str, int] = defaultdict(int)

        # Batch language requests
        # Note: If there are >100 repos, this only does the first 100 max due to per_page=100
        # To avoid being aggressively rate-limited instantly, we limit the detail fetch
        max_repo_detail_fetch = 30
        
        for i, repo in enumerate(repos_data):
            repo_info = {
                "name": repo.get("name"),
                "description": repo.get("description"),
                "language": repo.get("language"),
                "stars": repo.get("stargazers_count", 0),
                "url": repo.get("html_url")
            }
            processed_repos.append(repo_info)

            # Fallback fast mechanism: primary language counts
            if repo.get("language"):
                language_bytes[repo.get("language")] += 100  # Estimate 100 bytes if API not called
                
            # Attempt detailed language fetch for the largest/most recent repos to get true breakdown
            if i < max_repo_detail_fetch and not rate_limited:
                lang_url = repo.get("languages_url")
                if lang_url:
                    try:
                        lang_response = await client.get(lang_url, timeout=5.0)
                        if lang_response.status_code == 200:
                           # Detailed byte counts replace the estimate above
                           if repo.get("language") and repo.get("language") in language_bytes:
                               language_bytes[repo.get("language")] -= 100 # remove estimate
                           langs = lang_response.json()
                           for lang, bts in langs.items():
                               language_bytes[lang] += bts
                        elif lang_response.status_code == 403:
                            # Rate limited during detailed fetch! Stop fetching details for remaining, but process what we have
                            rate_limited = True
                    except (httpx.RequestError, httpx.TimeoutException):
                        pass

        # Calculate percentages
        total_bytes = sum(language_bytes.values())
        language_percentages = {}
        if total_bytes > 0:
            for lang, bts in language_bytes.items():
                pct = (bts / total_bytes) * 100
                language_percentages[lang] = round(pct, 2)
        
        # Sort percentages highest first
        language_percentages = dict(sorted(language_percentages.items(), key=lambda item: item[1], reverse=True))

        github_data = {
            "username": username,
            "repo_count": len(repos_data),
            "language_percentages": language_percentages,
            "commit_frequency": "Unknown", # Needs event API, can be added later if crucial
            "repositories": processed_repos
        }

        return github_data

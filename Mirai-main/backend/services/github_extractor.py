import httpx
import os
from typing import Optional

GITHUB_API = "https://api.github.com"

async def extract_github_data(
    github_url: str | None = None,
    github_token: str | None = None,
) -> dict:
    """
    Fetches GitHub profile data.
    - If github_token is provided (OAuth users): uses authenticated requests (higher rate limit)
    - If only github_url is provided: uses public API (lower rate limit, public repos only)

    Returns a dict matching the GithubData TypeScript type.
    """
    headers = {"Accept": "application/vnd.github.v3+json"}

    # Try to get the username
    if github_token:
        headers["Authorization"] = f"token {github_token}"
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(f"{GITHUB_API}/user", headers=headers)
            user_resp.raise_for_status()
            user_data = user_resp.json()
            username = user_data["login"]
    elif github_url:
        # Parse username from URL like https://github.com/username
        username = github_url.rstrip("/").split("/")[-1]
        # Add optional personal token from env for higher rate limits
        env_token = os.getenv("GITHUB_TOKEN")
        if env_token:
            headers["Authorization"] = f"token {env_token}"
    else:
        raise ValueError("Either github_url or github_token must be provided")

    async with httpx.AsyncClient() as client:
        # Fetch repos (up to 100)
        repos_resp = await client.get(
            f"{GITHUB_API}/users/{username}/repos",
            headers=headers,
            params={"per_page": 100, "sort": "updated"}
        )
        repos_resp.raise_for_status()
        repos = repos_resp.json()

        # Fetch user info (for account age)
        profile_resp = await client.get(f"{GITHUB_API}/users/{username}", headers=headers)
        profile_resp.raise_for_status()
        profile = profile_resp.json()

    # Calculate language breakdown
    language_counts: dict[str, int] = {}
    for repo in repos:
        lang = repo.get("language")
        if lang:
            language_counts[lang] = language_counts.get(lang, 0) + 1

    total = sum(language_counts.values()) or 1
    top_languages = {
        lang: round((count / total) * 100)
        for lang, count in sorted(language_counts.items(), key=lambda x: -x[1])
    }

    # Account age in years
    from datetime import datetime, timezone
    created = datetime.fromisoformat(profile["created_at"].replace("Z", "+00:00"))
    age_years = (datetime.now(timezone.utc) - created).days / 365

    # Commit frequency heuristic based on repo count and activity
    if len(repos) >= 20:
        commit_freq = "high"
    elif len(repos) >= 8:
        commit_freq = "medium"
    else:
        commit_freq = "low"

    # Top repos (top 5 by stars)
    top_repos = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:5]

    return {
        "username": username,
        "repo_count": len(repos),
        "top_languages": top_languages,
        "commit_frequency": commit_freq,
        "account_age_years": round(age_years, 1),
        "top_repos": [
            {
                "name": r["name"],
                "description": r.get("description"),
                "language": r.get("language"),
                "stars": r.get("stargazers_count", 0),
            }
            for r in top_repos
        ],
    }

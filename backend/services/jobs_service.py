import os
import httpx
import json
from datetime import datetime, timezone, timedelta
from services.supabase_client import get_supabase, get_user_profile

JSEARCH_HOST = "jsearch.p.rapidapi.com"
CACHE_TTL_HOURS = 6


def _calculate_match_pct(job_description: str, skill_scores: dict) -> int:
    """
    Simple match calculation:
    Count how many of the user's top skills appear in the job description.
    Returns a percentage 0–100.
    """
    description_lower = job_description.lower()

    # Map common skill score keys to related keywords
    skill_keywords = {
        "backend": ["backend", "api", "rest", "fastapi", "django", "flask", "node", "express", "python", "java", "go"],
        "frontend": ["frontend", "react", "vue", "angular", "next.js", "css", "html", "javascript", "typescript"],
        "ml": ["machine learning", "ml", "tensorflow", "pytorch", "scikit", "nlp", "deep learning", "model"],
        "devops": ["devops", "docker", "kubernetes", "aws", "gcp", "azure", "ci/cd", "terraform", "linux"],
        "mobile": ["android", "ios", "flutter", "react native", "swift", "kotlin", "mobile"],
    }

    total_weight = 0
    matched_weight = 0

    for skill, score in skill_scores.items():
        keywords = skill_keywords.get(skill.lower(), [skill.lower()])
        weight = score  # Use the skill score as the weight
        total_weight += weight
        if any(kw in description_lower for kw in keywords):
            matched_weight += weight

    if total_weight == 0:
        return 50  # Default if no skill data

    return min(100, int((matched_weight / total_weight) * 100))


async def get_jobs_with_cache(user_id: str) -> dict:
    """
    Fetches jobs for a user based on their stored role and skill_scores.
    Uses Supabase jobs_cache with a 6-hour TTL to preserve JSearch API credits.

    Returns a dict matching the JobsResponse TypeScript type.
    """
    sb = get_supabase()

    # Get user's profile to know their role and skills
    profile = get_user_profile(user_id)
    if not profile or not profile.get("role"):
        return {
            "jobs": [],
            "role_searched": "",
            "cached": False,
            "cache_age_hours": 0,
            "total": 0,
        }

    role = profile["role"]
    skill_scores = profile.get("skill_scores", {})

    # Check cache
    cache_result = (
        sb.table("jobs_cache")
        .select("*")
        .eq("role", role)
        .execute()
    )

    now = datetime.now(timezone.utc)

    if cache_result.data:
        cache_row = cache_result.data[0]
        fetched_at = datetime.fromisoformat(cache_row["fetched_at"].replace("Z", "+00:00"))
        age_hours = (now - fetched_at).total_seconds() / 3600

        if age_hours < CACHE_TTL_HOURS:
            # Cache is fresh — return it
            cached_jobs = cache_row["results"]
            # Recalculate match_pct against current user's skills (skills may have changed)
            for job in cached_jobs:
                job["match_pct"] = _calculate_match_pct(
                    job.get("description_snippet", ""), skill_scores
                )
            # Re-sort by match_pct descending
            cached_jobs.sort(key=lambda j: j["match_pct"], reverse=True)
            return {
                "jobs": cached_jobs,
                "role_searched": role,
                "cached": True,
                "cache_age_hours": round(age_hours, 1),
                "total": len(cached_jobs),
            }

    # Cache is stale or missing — fetch from JSearch
    api_key = os.getenv("JSEARCH_API_KEY")
    if not api_key:
        raise ValueError("JSEARCH_API_KEY is not set in .env")

    # Build search query from role
    # Map role to a search-friendly query
    role_query_map = {
        "Backend Engineer": "backend developer intern",
        "Frontend Developer": "frontend developer intern",
        "Full Stack Developer": "full stack developer intern",
        "ML Engineer": "machine learning intern",
        "Data Analyst": "data analyst intern",
        "DevOps Engineer": "devops engineer intern",
        "Mobile Developer": "mobile developer intern",
    }
    query = role_query_map.get(role, f"{role.lower()} intern")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://{JSEARCH_HOST}/search",
            headers={
                "X-RapidAPI-Key": api_key,
                "X-RapidAPI-Host": JSEARCH_HOST,
            },
            params={
                "query": f"{query} India",
                "page": "1",
                "num_pages": "1",
                "date_posted": "month",
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()

    raw_jobs = data.get("data", [])

    # Normalize JSearch response to our JobListing shape
    jobs = []
    for j in raw_jobs[:20]:  # Limit to 20 results
        description = j.get("job_description", "") or ""
        snippet = description[:200].strip()

        # Extract skills from description (simple keyword matching)
        all_skills = [
            "Python", "JavaScript", "TypeScript", "React", "Node.js", "FastAPI",
            "Django", "Flask", "SQL", "PostgreSQL", "MongoDB", "Docker", "AWS",
            "Machine Learning", "TensorFlow", "PyTorch", "Java", "Go", "Kotlin",
            "Swift", "Flutter", "CSS", "HTML", "Next.js", "Vue", "Angular",
        ]
        required_skills = [s for s in all_skills if s.lower() in description.lower()][:8]

        match_pct = _calculate_match_pct(description, skill_scores)

        jobs.append({
            "job_id": j.get("job_id", ""),
            "title": j.get("job_title", ""),
            "company": j.get("employer_name", ""),
            "location": j.get("job_city", "") + (", " + j.get("job_country", "") if j.get("job_country") else ""),
            "is_remote": j.get("job_is_remote", False),
            "apply_url": j.get("job_apply_link", ""),
            "description_snippet": snippet,
            "required_skills": required_skills,
            "match_pct": match_pct,
            "posted_at": j.get("job_posted_at_datetime_utc", now.isoformat()),
        })

    # Sort by match_pct descending
    jobs.sort(key=lambda j: j["match_pct"], reverse=True)

    # Upsert cache
    sb.table("jobs_cache").upsert(
        {"role": role, "results": jobs, "fetched_at": now.isoformat()},
        on_conflict="role",
    ).execute()

    return {
        "jobs": jobs,
        "role_searched": role,
        "cached": False,
        "cache_age_hours": 0,
        "total": len(jobs),
    }

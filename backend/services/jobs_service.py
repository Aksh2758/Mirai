import os
import re
from datetime import datetime, timezone
from typing import Any

import httpx
from bson import ObjectId

from db.mongo_client import get_projects_collection
from services.supabase_client import get_supabase, get_user_profile

JSEARCH_HOST = "jsearch.p.rapidapi.com"
CACHE_TTL_HOURS = 6
JSEARCH_TIMEOUT_SECONDS = 8.0
MAX_JOBS = 30

SKILL_ALIASES = {
    "javascript": ["javascript", "js", "node.js", "nodejs"],
    "typescript": ["typescript", "ts"],
    "python": ["python", "python3", "py"],
    "machine learning": ["machine learning", "ml", "sklearn", "scikit"],
    "react": ["react", "reactjs", "react.js"],
    "next.js": ["next.js", "nextjs", "next js"],
    "node.js": ["node.js", "nodejs", "node js", "express"],
    "postgresql": ["postgresql", "postgres", "psql"],
    "mongodb": ["mongodb", "mongo"],
    "docker": ["docker", "dockerfile", "container"],
    "kubernetes": ["kubernetes", "k8s"],
    "fastapi": ["fastapi", "fast api"],
    "aws": ["aws", "amazon web services"],
    "sql": ["sql", "mysql", "postgres", "database"],
}

KNOWN_SKILLS = [
    "Python", "JavaScript", "TypeScript", "React", "Node.js", "Express", "FastAPI",
    "Django", "Flask", "SQL", "PostgreSQL", "MongoDB", "Redis", "Docker", "AWS",
    "Kubernetes", "Machine Learning", "TensorFlow", "PyTorch", "Java", "Go", "Kotlin",
    "Swift", "Flutter", "CSS", "HTML", "Next.js", "Vue", "Angular", "Git", "REST API",
    "JWT", "OAuth", "Tailwind", "GraphQL", "Firebase", "Supabase",
]

ROLE_QUERY_MAP = {
    "Backend Engineer": "backend developer intern",
    "Frontend Developer": "frontend developer intern",
    "Full Stack Developer": "full stack developer intern",
    "ML Engineer": "machine learning intern",
    "Data Analyst": "data analyst intern",
    "DevOps Engineer": "devops engineer intern",
    "Mobile Developer": "mobile developer intern",
}


def _variants(skill_name: str) -> list[str]:
    normalized = skill_name.lower().strip()
    return SKILL_ALIASES.get(normalized, [normalized])


def _contains_any(text: str, variants: list[str]) -> bool:
    return any(re.search(rf"(^|[^a-z0-9+#.]){re.escape(value)}([^a-z0-9+#.]|$)", text) for value in variants)


def _profile_skills(skill_scores: dict[str, Any]) -> list[dict[str, Any]]:
    skills: list[dict[str, Any]] = []
    for key, value in (skill_scores or {}).items():
        if isinstance(value, dict):
            label = str(value.get("label") or key).strip()
            score = int(value.get("score") or 50)
            category = str(value.get("category") or "Skill")
        else:
            label = str(key).replace("_", " ").strip()
            score = int(value or 50)
            category = "Skill"
        if label:
            skills.append({"label": label, "score": max(0, min(score, 100)), "category": category})
    return skills


async def _active_project_context(profile: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    active_project_id = profile.get("active_project_id")
    if not active_project_id:
        return None
    try:
        oid = ObjectId(active_project_id)
    except Exception:
        return None
    doc = await get_projects_collection().find_one({"_id": oid, "user_id": user_id})
    if not doc:
        return None
    return {
        "title": doc.get("title", ""),
        "tech_stack": doc.get("tech_stack", []),
        "difficulty": doc.get("difficulty", ""),
    }


def _extract_required_skills(description: str, title: str = "") -> list[str]:
    haystack = f"{title}\n{description}".lower()
    found: list[str] = []
    for skill in KNOWN_SKILLS:
        if _contains_any(haystack, _variants(skill)) and skill not in found:
            found.append(skill)
        if len(found) >= 10:
            break
    return found


def _infer_work_type(job: dict[str, Any], description: str, location: str) -> str:
    text = f"{description} {location} {job.get('job_work_from_home', '')}".lower()
    if job.get("job_is_remote") or "remote" in text or "work from home" in text or "wfh" in text:
        return "remote"
    if "hybrid" in text:
        return "hybrid"
    return "onsite"


def _parse_salary_amount(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).lower().replace(",", "")
    match = re.search(r"(\d+(?:\.\d+)?)\s*(lpa|lakh|k|thousand)?", text)
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2)
    if unit in {"lpa", "lakh"}:
        return int(amount * 100000 / 12)
    if unit in {"k", "thousand"}:
        return int(amount * 1000)
    return int(amount)


def _infer_stipend(job: dict[str, Any], description: str) -> int | None:
    for key in ["job_min_salary", "job_salary", "job_max_salary"]:
        amount = _parse_salary_amount(job.get(key))
        if amount:
            return amount
    stipend_patterns = [
        r"(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.\d+)?)\s*(k|thousand)?\s*(?:/|per)?\s*(?:month|mo|pm)?",
        r"([0-9][0-9,]*(?:\.\d+)?)\s*(k|thousand)\s*(?:/|per)?\s*(?:month|mo|pm)",
    ]
    for pattern in stipend_patterns:
        match = re.search(pattern, description.lower())
        if match:
            amount = float(match.group(1).replace(",", ""))
            unit = match.group(2) if len(match.groups()) >= 2 else None
            return int(amount * 1000) if unit in {"k", "thousand"} else int(amount)
    return None


def _infer_duration_months(description: str) -> int | None:
    text = description.lower()
    match = re.search(r"(\d+)\s*(?:-|to)?\s*(\d+)?\s*months?", text)
    if match:
        if match.group(2):
            return max(int(match.group(1)), int(match.group(2)))
        return int(match.group(1))
    match = re.search(r"(\d+)\s*(?:-|to)?\s*(\d+)?\s*weeks?", text)
    if match:
        weeks = int(match.group(2) or match.group(1))
        return max(1, round(weeks / 4))
    return None


def _score_job_match(
    description: str,
    title: str,
    required_skills: list[str],
    profile: dict[str, Any] | None,
    active_project: dict[str, Any] | None,
) -> dict[str, Any]:
    profile = profile or {}
    text = f"{title}\n{description}".lower()
    user_skills = _profile_skills(profile.get("skill_scores", {}))
    project_stack = [str(item) for item in (active_project or {}).get("tech_stack", [])]
    role = str(profile.get("role") or "").lower()
    level = str(profile.get("level") or "").lower()

    matched_skills: list[str] = []
    missing_skills: list[str] = []
    skill_score = 45 if not user_skills and not required_skills else 0

    if user_skills:
        total_weight = sum(max(20, skill["score"]) for skill in user_skills) or 1
        matched_weight = 0
        for skill in user_skills:
            label = skill["label"]
            if _contains_any(text, _variants(label)):
                matched_weight += max(20, skill["score"])
                matched_skills.append(label)
        skill_score = round((matched_weight / total_weight) * 55)

    for req in required_skills:
        if req not in matched_skills and _contains_any(" ".join([skill["label"].lower() for skill in user_skills]), _variants(req)):
            matched_skills.append(req)
        elif req not in matched_skills:
            missing_skills.append(req)

    role_score = 0
    role_tokens = [token for token in re.split(r"\W+", role) if len(token) > 2 and token not in {"developer", "engineer"}]
    if role and (role in text or any(token in text for token in role_tokens)):
        role_score = 15
    elif "intern" in text or "internship" in text:
        role_score = 8

    project_score = 0
    project_matches: list[str] = []
    for tech in project_stack:
        if _contains_any(text, _variants(tech)):
            project_matches.append(tech)
    if project_stack:
        project_score = round((len(project_matches) / max(1, len(project_stack))) * 15)

    level_score = 8
    if "intern" in text or "fresher" in text or "entry level" in text:
        level_score += 2
    if level == "beginner" and any(term in text for term in ["senior", "3+ years", "5+ years"]):
        level_score -= 5

    context_score = 5 if any(term in text for term in ["project", "api", "build", "deploy", "github"]) else 2
    match_pct = max(35, min(99, skill_score + role_score + project_score + level_score + context_score))

    reasons: list[str] = []
    if matched_skills:
        reasons.append(f"Matches {', '.join(matched_skills[:4])}")
    if project_matches:
        reasons.append(f"Uses your project stack: {', '.join(project_matches[:3])}")
    if role_score >= 10:
        reasons.append("Aligned with your scanner role")
    if not reasons:
        reasons.append("General internship fit based on your profile")

    return {
        "match_pct": int(match_pct),
        "matched_skills": matched_skills[:8],
        "missing_skills": missing_skills[:6],
        "match_reasons": reasons[:4],
    }


def _calculate_match_pct(job_description: str, skill_scores: dict) -> int:
    """Backward-compatible dashboard helper."""
    profile = {"skill_scores": skill_scores}
    return _score_job_match(job_description, "", _extract_required_skills(job_description), profile, None)["match_pct"]


def _normalize_job(raw: dict[str, Any], profile: dict[str, Any], active_project: dict[str, Any] | None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    description = raw.get("job_description", "") or ""
    title = raw.get("job_title", "") or "Untitled internship"
    city = raw.get("job_city") or ""
    country = raw.get("job_country") or ""
    location = city + (", " + country if country and city else country)
    if not location:
        location = "Remote" if raw.get("job_is_remote") else "Location not specified"

    required_skills = _extract_required_skills(description, title)
    match = _score_job_match(description, title, required_skills, profile, active_project)
    stipend = _infer_stipend(raw, description)
    duration = _infer_duration_months(description)
    work_type = _infer_work_type(raw, description, location)

    return {
        "job_id": raw.get("job_id", raw.get("job_apply_link", title)),
        "title": title,
        "company": raw.get("employer_name", "Unknown company"),
        "location": location,
        "is_remote": work_type == "remote",
        "work_type": work_type,
        "apply_url": raw.get("job_apply_link", ""),
        "description_snippet": description[:280].strip(),
        "required_skills": required_skills,
        "matched_skills": match["matched_skills"],
        "missing_skills": match["missing_skills"],
        "match_reasons": match["match_reasons"],
        "match_pct": match["match_pct"],
        "stipend_min": stipend,
        "duration_months": duration,
        "posted_at": raw.get("job_posted_at_datetime_utc", now.isoformat()),
        "source": "JSearch/RapidAPI",
    }


async def _fetch_jsearch_jobs(query: str) -> list[dict[str, Any]]:
    api_key = os.getenv("JSEARCH_API_KEY")
    if not api_key:
        raise ValueError("JSEARCH_API_KEY is not set in .env")

    async with httpx.AsyncClient(timeout=JSEARCH_TIMEOUT_SECONDS) as client:
        response = await client.get(
            f"https://{JSEARCH_HOST}/search",
            headers={
                "X-RapidAPI-Key": api_key,
                "X-RapidAPI-Host": JSEARCH_HOST,
            },
            params={
                "query": f"{query} India stipend internship",
                "page": "1",
                "num_pages": "1",
                "date_posted": "month",
            },
        )
        response.raise_for_status()
        data = response.json()
    return data.get("data", []) if isinstance(data, dict) else []


async def get_jobs_with_cache(user_id: str) -> dict:
    """Fetch JSearch internships and rank them against stored scanner/profile/project data."""
    sb = get_supabase()
    profile = get_user_profile(user_id)
    if not profile or not profile.get("role"):
        return {"jobs": [], "role_searched": "", "cached": False, "cache_age_hours": 0, "total": 0}

    role = profile["role"]
    query = ROLE_QUERY_MAP.get(role, f"{role.lower()} intern")
    active_project = await _active_project_context(profile, user_id)
    now = datetime.now(timezone.utc)

    cache_result = sb.table("jobs_cache").select("*").eq("role", role).execute()
    if cache_result.data:
        cache_row = cache_result.data[0]
        fetched_at = datetime.fromisoformat(cache_row["fetched_at"].replace("Z", "+00:00"))
        age_hours = (now - fetched_at).total_seconds() / 3600
        if age_hours < CACHE_TTL_HOURS:
            cached_jobs = cache_row["results"]
            normalized_jobs = []
            for job in cached_jobs:
                if "raw" in job:
                    normalized_jobs.append(_normalize_job(job["raw"], profile, active_project))
                else:
                    description = job.get("description_snippet", "")
                    title = job.get("title", "")
                    required_skills = job.get("required_skills", []) or _extract_required_skills(description, title)
                    match = _score_job_match(description, title, required_skills, profile, active_project)
                    work_type = job.get("work_type") or ("remote" if job.get("is_remote") else "onsite")
                    normalized_jobs.append({
                        **job,
                        **match,
                        "work_type": work_type,
                        "is_remote": work_type == "remote",
                        "required_skills": required_skills,
                        "stipend_min": job.get("stipend_min"),
                        "duration_months": job.get("duration_months"),
                        "source": job.get("source") or "JSearch/RapidAPI",
                    })
            normalized_jobs.sort(key=lambda j: j["match_pct"], reverse=True)
            return {
                "jobs": normalized_jobs,
                "role_searched": role,
                "cached": True,
                "cache_age_hours": round(age_hours, 1),
                "total": len(normalized_jobs),
            }

    raw_jobs = await _fetch_jsearch_jobs(query)
    jobs = [_normalize_job(raw, profile, active_project) for raw in raw_jobs[:MAX_JOBS]]
    jobs.sort(key=lambda j: j["match_pct"], reverse=True)

    cache_payload = [{**job, "raw": raw_jobs[index]} for index, job in enumerate(jobs[:MAX_JOBS])]
    sb.table("jobs_cache").upsert(
        {"role": role, "results": cache_payload, "fetched_at": now.isoformat()},
        on_conflict="role",
    ).execute()

    return {
        "jobs": jobs,
        "role_searched": role,
        "cached": False,
        "cache_age_hours": 0,
        "total": len(jobs),
    }

import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from bson import ObjectId

from db.mongo_client import get_projects_collection
from services.supabase_client import get_supabase, get_user_profile

logger = logging.getLogger(__name__)

JSEARCH_HOST = "jsearch.p.rapidapi.com"
CACHE_TTL_HOURS = 6
JSEARCH_TIMEOUT_SECONDS = 8.0
ADZUNA_TIMEOUT_SECONDS = 8.0
UNSTOP_TIMEOUT_SECONDS = 8.0
UNSTOP_URL = "https://unstop.com/api/public/opportunity/search-result"
MAX_JOBS = 30
MAX_POST_AGE_DAYS = 45          # postings older than this are hidden

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

# Titles containing these are almost never relevant to an engineering student, even
# when the description happens to mention Python/SQL. Used to down-rank and hide them.
NON_TECH_TITLE_RE = re.compile(
    r"\b(?:writer|writing|content (?:writer|creator|marketing|strategist)|copywrit\w*|marketing|sales|"
    r"telecaller|tele caller|telesales|business development|bdm|hr|human resources|recruit\w*|"
    r"graphic designer|video editor|seo|social media|customer (?:support|care|service)|"
    r"accountant|accounts|teacher|tutor|counsell\w*|receptionist)\b",
    re.IGNORECASE,
)


def _query_for_role(role: str) -> str:
    """Search text for a role. The Scanner can now return free-form titles such as
    'Backend Developer (Go/Rust)', so strip brackets/symbols before searching."""
    if role in ROLE_QUERY_MAP:
        return ROLE_QUERY_MAP[role]
    cleaned = re.sub(r"\([^)]*\)", " ", role)
    cleaned = re.sub(r"[^A-Za-z0-9+#. ]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().lower()
    if not cleaned:
        return "software developer intern"
    return cleaned if "intern" in cleaned else f"{cleaned} intern"


def looks_non_tech(title: str, role: str = "") -> bool:
    """True when the title is clearly a non-engineering job (writer, sales, HR ...), unless the
    user's own role contains the same word."""
    role_l = role.lower()
    return any(m.group(0).lower() not in role_l for m in NON_TECH_TITLE_RE.finditer(title or ""))


_DEADLINE_RE = re.compile(
    r"(?:deadline|last date|apply by|apply before)[^0-9]{0,25}(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{4})",
    re.IGNORECASE,
)


def _parse_dt(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _deadline_passed(text: str, now: datetime) -> bool:
    match = _DEADLINE_RE.search(text or "")
    if not match:
        return False
    day, month, year = match.groups()
    for fmt in ("%d %B %Y", "%d %b %Y"):
        try:
            deadline = datetime.strptime(f"{day} {month} {year}", fmt).replace(tzinfo=timezone.utc)
            return deadline + timedelta(days=1) < now
        except ValueError:
            continue
    return False


def is_job_fresh(job: dict, now: datetime | None = None) -> bool:
    """False for postings that are too old or whose stated application deadline has passed."""
    now = now or datetime.now(timezone.utc)
    posted = _parse_dt(job.get("posted_at") or (job.get("raw") or {}).get("job_posted_at_datetime_utc"))
    if posted and now - posted > timedelta(days=MAX_POST_AGE_DAYS):
        return False
    raw = job.get("raw") if isinstance(job.get("raw"), dict) else {}
    deadline = _parse_dt(raw.get("_deadline"))
    if deadline and deadline + timedelta(days=1) < now:
        return False
    text = raw.get("job_description") or job.get("description_snippet") or ""
    return not _deadline_passed(text, now)


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
    raw_total = skill_score + role_score + project_score + level_score + context_score
    if looks_non_tech(title, role):
        raw_total -= 30
    match_pct = max(10 if looks_non_tech(title, role) else 35, min(99, raw_total))

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
        "source": raw.get("_source") or "JSearch/RapidAPI",
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


def _adzuna_to_raw(item: dict[str, Any]) -> dict[str, Any]:
    """Map an Adzuna result onto the JSearch-style raw dict that _normalize_job understands."""
    company = (item.get("company") or {}).get("display_name") or "Unknown company"
    location = (item.get("location") or {}).get("display_name") or ""
    description = item.get("description") or ""
    text = f"{item.get('title', '')} {description} {location}".lower()
    predicted = str(item.get("salary_is_predicted", "0")) == "1"
    return {
        "job_id": f"adzuna-{item.get('id')}",
        "job_title": item.get("title") or "Untitled internship",
        "employer_name": company,
        "job_description": description,
        "job_city": location,
        "job_country": "IN",
        "job_is_remote": "remote" in text or "work from home" in text,
        "job_apply_link": item.get("redirect_url") or "",
        "job_posted_at_datetime_utc": item.get("created"),
        "job_min_salary": None if predicted else item.get("salary_min"),
        "_source": "Adzuna",
    }


async def _fetch_adzuna_jobs(query: str) -> list[dict[str, Any]]:
    """Optional second source. Needs free keys from developer.adzuna.com:
    ADZUNA_APP_ID and ADZUNA_APP_KEY. Without them this source is simply skipped."""
    app_id, app_key = os.getenv("ADZUNA_APP_ID"), os.getenv("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        return []
    async with httpx.AsyncClient(timeout=ADZUNA_TIMEOUT_SECONDS) as client:
        response = await client.get(
            "https://api.adzuna.com/v1/api/jobs/in/search/1",
            params={
                "app_id": app_id,
                "app_key": app_key,
                "what": query,
                "results_per_page": 20,
                "max_days_old": 30,
                "sort_by": "date",
            },
        )
        response.raise_for_status()
        data = response.json()
    results = data.get("results", []) if isinstance(data, dict) else []
    return [_adzuna_to_raw(item) for item in results if isinstance(item, dict)]


def _html_to_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(value or ""))).strip()


def _unstop_to_raw(item: dict[str, Any]) -> dict[str, Any] | None:
    """Map an Unstop internship onto the JSearch-style raw dict. Defensive: Unstop's JSON is
    undocumented, so every field is optional and anything unusable is skipped."""
    title = str(item.get("title") or "").strip()
    link = str(item.get("seo_url") or item.get("short_url") or "").strip()
    if not link and item.get("public_url"):
        link = f"https://unstop.com/{str(item['public_url']).lstrip('/')}"
    if not title or not link:
        return None
    org = item.get("organisation") if isinstance(item.get("organisation"), dict) else {}
    skills = item.get("required_skills") or []
    skill_names = [str(x.get("skill_name") or x.get("name") or "") if isinstance(x, dict) else str(x) for x in skills]
    description = _html_to_text(item.get("details"))
    if skill_names:
        description = f"{description} Skills: {', '.join(n for n in skill_names if n)}".strip()
    is_online = str(item.get("region") or "").lower() == "online"
    address = item.get("address_with_country_logo") if isinstance(item.get("address_with_country_logo"), dict) else {}
    city = ", ".join(str(p) for p in [address.get("city"), address.get("state")] if p)
    detail = item.get("jobDetail") if isinstance(item.get("jobDetail"), dict) else {}
    stipend = detail.get("min_salary") or detail.get("max_salary")
    stipend = stipend if isinstance(stipend, (int, float)) and 0 < stipend < 500000 else None
    return {
        "job_id": f"unstop-{item.get('id') or title}",
        "job_title": title,
        "employer_name": org.get("name") or "Unstop",
        "job_description": description,
        "job_city": city or ("Remote" if is_online else "India"),
        "job_country": "IN",
        "job_is_remote": is_online or "work from home" in description.lower(),
        "job_apply_link": link,
        "job_posted_at_datetime_utc": item.get("approved_date") or item.get("updated_at") or item.get("start_date"),
        "job_min_salary": stipend,
        "_deadline": item.get("end_date"),
        "_source": "Unstop",
    }


async def _unstop_page(client: httpx.AsyncClient, params: dict[str, Any]) -> list[dict[str, Any]]:
    response = await client.get(UNSTOP_URL, params=params)
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, dict):
        items = data.get("data") or []
    elif isinstance(data, list):
        items = data
    else:
        items = []
    return [i for i in items if isinstance(i, dict)]


async def _fetch_unstop_jobs(query: str) -> list[dict[str, Any]]:
    """India-first internships from Unstop's public search API (no key needed).
    Strategy: ask Unstop for the user's role first; if that returns little, also pull the latest
    open internships without a keyword and keep the tech-looking ones. Unstop already searches
    server-side, so we do NOT drop results just because the title lacks the role word."""
    term = re.sub(r"\bintern(ship)?s?\b", "", query, flags=re.IGNORECASE).strip()
    headers = {"User-Agent": "Mozilla/5.0 (Nirmaan)", "Accept": "application/json"}
    base = {"opportunity": "internships", "oppstatus": "open", "per_page": 30}
    items: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=UNSTOP_TIMEOUT_SECONDS, headers=headers, follow_redirects=True) as client:
        if term:
            try:
                items = await _unstop_page(client, {**base, "searchTerm": term, "page": 1})
            except httpx.HTTPError as exc:
                logger.warning("Unstop keyword search failed: %s", exc)
        if len(items) < 8:
            for page in (1, 2):
                try:
                    items += await _unstop_page(client, {**base, "page": page})
                except httpx.HTTPError as exc:
                    logger.warning("Unstop page %s failed: %s", page, exc)
                    break
    jobs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        raw = _unstop_to_raw(item)
        if not raw or raw["job_id"] in seen:
            continue
        seen.add(raw["job_id"])
        if looks_non_tech(raw["job_title"]):
            continue
        haystack = f"{raw['job_title']} {raw['job_description']}"
        if _extract_required_skills(haystack, raw["job_title"]) or TECH_TITLE_RE.search(raw["job_title"]):
            jobs.append(raw)
    return jobs


TECH_TITLE_RE = re.compile(
    r"\b(?:developer|engineer|engineering|software|web|app|android|ios|backend|frontend|full[- ]?stack|"
    r"data|analyst|analytics|ml|ai|machine learning|devops|cloud|cyber|security|qa|test|python|java|"
    r"react|node|programmer|sde|technology|tech|it)\b",
    re.IGNORECASE,
)
ENTRY_LEVEL_RE = re.compile(r"\b(?:intern|internship|trainee|fresher|graduate|junior|entry[- ]level|apprentice)\b", re.IGNORECASE)
REMOTE_OK_LOCATION_RE = re.compile(r"worldwide|anywhere|global|india|asia|apac|remote", re.IGNORECASE)


def _remote_to_raw(source: str, job_id: Any, title: str, company: str, description: str, link: str,
                   posted: Any, location: str) -> dict[str, Any]:
    return {
        "job_id": f"{source.lower()}-{job_id}",
        "job_title": title,
        "employer_name": company or source,
        "job_description": _html_to_text(description)[:3000],
        "job_city": location or "Remote",
        "job_country": "",
        "job_is_remote": True,
        "job_apply_link": link,
        "job_posted_at_datetime_utc": posted,
        "job_min_salary": None,
        "_source": source,
    }


def _keep_remote(title: str, location: str, query: str) -> bool:
    if not title or looks_non_tech(title) or not ENTRY_LEVEL_RE.search(title):
        return False
    if location and not REMOTE_OK_LOCATION_RE.search(location):
        return False  # e.g. "USA only"
    return True


async def _fetch_remotive_jobs(query: str) -> list[dict[str, Any]]:
    """Remotive: free, keyless remote-jobs API. Entry-level/intern titles that accept India/worldwide."""
    async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "Nirmaan/1.0"}, follow_redirects=True) as client:
        response = await client.get("https://remotive.com/api/remote-jobs", params={"category": "software-dev", "limit": 100})
        response.raise_for_status()
        data = response.json()
    out = []
    for j in (data.get("jobs") or []) if isinstance(data, dict) else []:
        loc = str(j.get("candidate_required_location") or "")
        title = str(j.get("title") or "")
        if _keep_remote(title, loc, query):
            out.append(_remote_to_raw("Remotive", j.get("id"), title, j.get("company_name"), j.get("description"),
                                      j.get("url"), j.get("publication_date"), loc or "Remote"))
    return out


async def _fetch_jobicy_jobs(query: str) -> list[dict[str, Any]]:
    """Jobicy: free, keyless remote-jobs API."""
    async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "Nirmaan/1.0"}, follow_redirects=True) as client:
        response = await client.get("https://jobicy.com/api/v2/remote-jobs", params={"count": 50, "tag": "intern"})
        response.raise_for_status()
        data = response.json()
    out = []
    for j in (data.get("jobs") or []) if isinstance(data, dict) else []:
        loc = str(j.get("jobGeo") or "")
        title = str(j.get("jobTitle") or "")
        if _keep_remote(title, loc, query):
            out.append(_remote_to_raw("Jobicy", j.get("id"), title, j.get("companyName"),
                                      j.get("jobDescription") or j.get("jobExcerpt"), j.get("url"),
                                      j.get("pubDate"), loc or "Remote"))
    return out


async def _fetch_remoteok_jobs(query: str) -> list[dict[str, Any]]:
    """RemoteOK: free, keyless JSON feed (first element is a legal notice)."""
    async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "Mozilla/5.0 Nirmaan/1.0"}, follow_redirects=True) as client:
        response = await client.get("https://remoteok.com/api")
        response.raise_for_status()
        data = response.json()
    out = []
    for j in data if isinstance(data, list) else []:
        if not isinstance(j, dict) or not j.get("position"):
            continue
        loc = str(j.get("location") or "")
        title = str(j.get("position") or "")
        if _keep_remote(title, loc, query):
            out.append(_remote_to_raw("RemoteOK", j.get("id"), title, j.get("company"), j.get("description"),
                                      j.get("url") or j.get("apply_url"), j.get("date"), loc or "Remote"))
    return out


def _dedupe_key(raw: dict[str, Any]) -> str:
    title = re.sub(r"[^a-z0-9]+", "", str(raw.get("job_title", "")).lower())
    company = re.sub(r"[^a-z0-9]+", "", str(raw.get("employer_name", "")).lower())
    return f"{title}|{company}"


def _source_fetchers(query: str) -> list[tuple[str, Any]]:
    return [
        ("JSearch", _fetch_jsearch_jobs(query)),
        ("Unstop", _fetch_unstop_jobs(query)),
        ("Adzuna", _fetch_adzuna_jobs(query)),
        ("Remotive", _fetch_remotive_jobs(query)),
        ("Jobicy", _fetch_jobicy_jobs(query)),
        ("RemoteOK", _fetch_remoteok_jobs(query)),
    ]


async def _fetch_all_sources(query: str, report: list[dict] | None = None) -> list[dict[str, Any]]:
    """Query every source in parallel. One slow or failing source never blocks the others.
    Raises only when every source failed. `report` (optional) receives per-source status."""
    named = _source_fetchers(query)
    results = await asyncio.gather(*(coro for _, coro in named), return_exceptions=True)
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    errors: list[Exception] = []
    for (name, _), result in zip(named, results):
        if isinstance(result, Exception):
            logger.warning("Job source %s failed: %r", name, result)
            errors.append(result)
            if report is not None:
                report.append({"source": name, "ok": False, "count": 0, "error": repr(result)[:300]})
            continue
        if report is not None:
            report.append({"source": name, "ok": True, "count": len(result), "error": None})
        logger.info("Job source %s returned %d postings", name, len(result))
        for raw in result:
            key = _dedupe_key(raw)
            if key in seen:
                continue
            seen.add(key)
            merged.append(raw)
    if not merged and errors:
        raise errors[0]
    return merged


async def diagnose_sources(role: str) -> dict[str, Any]:
    """Run every source once and report what each returned. Used by GET /jobs/diagnose."""
    query = _query_for_role(role)
    report: list[dict] = []
    try:
        merged = await _fetch_all_sources(query, report)
    except Exception as exc:
        merged = []
        report.append({"source": "ALL", "ok": False, "count": 0, "error": repr(exc)[:300]})
    return {"query": query, "total_unique": len(merged), "sources": report}


def _build_jobs(raws: list[dict[str, Any]], profile: dict, active_project: dict | None) -> list[dict[str, Any]]:
    """Normalise + score, hide expired/non-tech postings, keep each raw paired with its job."""
    now = datetime.now(timezone.utc)
    role = str(profile.get("role") or "")
    pairs: list[tuple[dict, dict]] = []
    for raw in raws:
        job = _normalize_job(raw, profile, active_project)
        if not is_job_fresh({**job, "raw": raw}, now):
            continue
        if looks_non_tech(job["title"], role):
            continue
        pairs.append((raw, job))
    pairs.sort(key=lambda pair: pair[1]["match_pct"], reverse=True)
    return [{**job, "raw": raw} for raw, job in pairs[:MAX_JOBS]]


CACHE_VERSION = "v2"   # bump to ignore every older cache row (e.g. JSearch-only results)


def _cache_key(role: str) -> str:
    return f"{role}::{CACHE_VERSION}"


def _read_cache(role: str) -> dict | None:
    rows = get_supabase().table("jobs_cache").select("*").eq("role", _cache_key(role)).execute().data
    return rows[0] if rows else None


def _write_cache(role: str, payload: list[dict], now: datetime) -> None:
    get_supabase().table("jobs_cache").upsert(
        {"role": _cache_key(role), "results": payload, "fetched_at": now.isoformat()},
        on_conflict="role",
    ).execute()


_refreshing: set[str] = set()


async def _refresh_cache(role: str, query: str, profile: dict, active_project: dict | None) -> list[dict]:
    """Fetch every source and store the result. Used inline on first load and as a background task."""
    raws = await _fetch_all_sources(query)
    payload = _build_jobs(raws, profile, active_project)
    if payload:
        await asyncio.to_thread(_write_cache, role, payload, datetime.now(timezone.utc))
    return payload


async def _background_refresh(role: str, query: str, profile: dict, active_project: dict | None) -> None:
    if role in _refreshing:
        return
    _refreshing.add(role)
    try:
        await _refresh_cache(role, query, profile, active_project)
    except Exception as e:  # never let a background refresh crash the app
        logger.warning("Background job refresh failed for %s: %s", role, e)
    finally:
        _refreshing.discard(role)


def _rank_cached(cached_jobs: list[dict], profile: dict, active_project: dict | None) -> list[dict]:
    now = datetime.now(timezone.utc)
    role = str(profile.get("role") or "")
    ranked: list[dict] = []
    for job in cached_jobs:
        if not is_job_fresh(job, now) or looks_non_tech(job.get("title", ""), role):
            continue
        if "raw" in job and isinstance(job["raw"], dict):
            item = _normalize_job(job["raw"], profile, active_project)
        else:
            description = job.get("description_snippet", "")
            title = job.get("title", "")
            required_skills = job.get("required_skills", []) or _extract_required_skills(description, title)
            match = _score_job_match(description, title, required_skills, profile, active_project)
            work_type = job.get("work_type") or ("remote" if job.get("is_remote") else "onsite")
            item = {
                **job,
                **match,
                "work_type": work_type,
                "is_remote": work_type == "remote",
                "required_skills": required_skills,
                "stipend_min": job.get("stipend_min"),
                "duration_months": job.get("duration_months"),
                "source": job.get("source") or "JSearch/RapidAPI",
            }
        ranked.append(item)
    ranked.sort(key=lambda j: j["match_pct"], reverse=True)
    return ranked


async def get_jobs_with_cache(user_id: str, allow_fetch: bool = True, force_refresh: bool = False) -> dict:
    """Internships ranked against the user's profile.

    Speed: cached results are returned immediately. When the cache is older than
    CACHE_TTL_HOURS it is still served (flagged stale=True) while a background task
    refreshes it, so the page never waits on the external APIs after the first load.
    allow_fetch=False (used by the dashboard) never calls external APIs at all.
    """
    profile = get_user_profile(user_id)
    empty = {"jobs": [], "role_searched": "", "cached": False, "stale": False, "cache_age_hours": 0, "total": 0}
    if not profile or not profile.get("role"):
        return empty

    role = profile["role"]
    query = _query_for_role(role)
    active_project = await _active_project_context(profile, user_id)
    now = datetime.now(timezone.utc)

    cache_row = None if force_refresh else await asyncio.to_thread(_read_cache, role)
    if cache_row:
        fetched_at = _parse_dt(cache_row.get("fetched_at")) or now
        age_hours = (now - fetched_at).total_seconds() / 3600
        stale = age_hours >= CACHE_TTL_HOURS
        if stale and allow_fetch:
            asyncio.create_task(_background_refresh(role, query, profile, active_project))
        jobs = _rank_cached(cache_row.get("results") or [], profile, active_project)
        if jobs or not allow_fetch:
            return {
                "jobs": jobs,
                "role_searched": role,
                "cached": True,
                "stale": stale,
                "cache_age_hours": round(age_hours, 1),
                "total": len(jobs),
            }
        # cache existed but every posting expired -> fall through to a live fetch

    if not allow_fetch:
        return {**empty, "role_searched": role}

    payload = await _refresh_cache(role, query, profile, active_project)
    jobs = [_normalize_job(item["raw"], profile, active_project) for item in payload]
    jobs.sort(key=lambda j: j["match_pct"], reverse=True)
    return {
        "jobs": jobs,
        "role_searched": role,
        "cached": False,
        "stale": False,
        "cache_age_hours": 0,
        "total": len(jobs),
    }
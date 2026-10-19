import json
import logging
import re
import time
from collections import Counter

from services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

TABLE = "jobs_cache"
RESULTS_COLUMN = "results"
MAX_ROWS = 200                  # most recent cached searches to scan
CACHE_TTL_SECONDS = 3600        # recompute at most once an hour

_cache: dict = {"ts": 0.0, "data": []}

# Keyword vocabulary scanned for inside the cached job data. Extend this list
# freely — it's just a lookup table, no code changes needed elsewhere.
SKILL_VOCABULARY = [
    # languages
    "python", "javascript", "typescript", "java", "kotlin", "go", "golang", "rust",
    "c++", "c#", "swift", "php", "ruby", "scala", "r",
    # web frameworks
    "react", "next.js", "nextjs", "vue", "angular", "svelte", "django", "flask",
    "fastapi", "express", "node.js", "nodejs", "spring boot", "spring", "laravel",
    "rails", "graphql", "rest api",
    # data / ml
    "pandas", "numpy", "scikit-learn", "sklearn", "tensorflow", "pytorch", "keras",
    "machine learning", "deep learning", "nlp", "computer vision", "llm",
    "transformers", "huggingface", "data science", "spark", "airflow", "dbt",
    "snowflake", "bigquery", "databricks", "etl",
    # infra / cloud
    "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions",
    "ci/cd", "aws", "gcp", "azure", "linux", "nginx", "helm", "devops",
    # mobile
    "flutter", "react native", "android", "ios", "swiftui", "jetpack compose",
    # databases
    "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
    # other
    "microservices", "agile", "git", "testing", "security", "blockchain",
]

_VOCAB_RE = re.compile(
    r"(?<![a-z0-9])(?:" + "|".join(re.escape(s) for s in sorted(SKILL_VOCABULARY, key=len, reverse=True)) + r")(?![a-z0-9])"
)

# Display casing for the terms above (lowercase key -> nice label)
_DISPLAY = {
    "javascript": "JavaScript", "typescript": "TypeScript", "python": "Python",
    "java": "Java", "kotlin": "Kotlin", "go": "Go", "golang": "Go", "rust": "Rust",
    "c++": "C++", "c#": "C#", "swift": "Swift", "php": "PHP", "ruby": "Ruby",
    "scala": "Scala", "r": "R", "react": "React", "next.js": "Next.js",
    "nextjs": "Next.js", "vue": "Vue", "angular": "Angular", "svelte": "Svelte",
    "django": "Django", "flask": "Flask", "fastapi": "FastAPI", "express": "Express",
    "node.js": "Node.js", "nodejs": "Node.js", "spring boot": "Spring Boot",
    "spring": "Spring", "laravel": "Laravel", "rails": "Rails", "graphql": "GraphQL",
    "rest api": "REST API", "pandas": "Pandas", "numpy": "NumPy",
    "scikit-learn": "scikit-learn", "sklearn": "scikit-learn", "tensorflow": "TensorFlow",
    "pytorch": "PyTorch", "keras": "Keras", "machine learning": "Machine Learning",
    "deep learning": "Deep Learning", "nlp": "NLP", "computer vision": "Computer Vision",
    "llm": "LLM", "transformers": "Transformers", "huggingface": "HuggingFace",
    "data science": "Data Science", "spark": "Spark", "airflow": "Airflow",
    "dbt": "dbt", "snowflake": "Snowflake", "bigquery": "BigQuery",
    "databricks": "Databricks", "etl": "ETL", "docker": "Docker",
    "kubernetes": "Kubernetes", "terraform": "Terraform", "ansible": "Ansible",
    "jenkins": "Jenkins", "github actions": "GitHub Actions", "ci/cd": "CI/CD",
    "aws": "AWS", "gcp": "GCP", "azure": "Azure", "linux": "Linux", "nginx": "Nginx",
    "helm": "Helm", "devops": "DevOps", "flutter": "Flutter",
    "react native": "React Native", "android": "Android", "ios": "iOS",
    "swiftui": "SwiftUI", "jetpack compose": "Jetpack Compose", "sql": "SQL",
    "postgresql": "PostgreSQL", "mysql": "MySQL", "mongodb": "MongoDB",
    "redis": "Redis", "elasticsearch": "Elasticsearch", "microservices": "Microservices",
    "agile": "Agile", "git": "Git", "testing": "Testing", "security": "Security",
    "blockchain": "Blockchain",
}


def _extract_job_list(value) -> list:
    """results may be a list, a JSON string, or a wrapper {"data"/"jobs"/"results": [...]}."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except Exception:
            return []
    if isinstance(value, dict):
        for key in ("data", "jobs", "results"):
            if isinstance(value.get(key), list):
                return value[key]
        return []
    return value if isinstance(value, list) else []


def _fallback_text_mine(job: dict) -> list[str]:
    raw = job.get("raw") if isinstance(job.get("raw"), dict) else {}
    parts = [job.get("title"), job.get("description_snippet"), raw.get("job_description")]
    text = " ".join(p for p in parts if isinstance(p, str)).lower()
    return [_DISPLAY.get(m, m.title()) for m in set(_VOCAB_RE.findall(text))]


def _skills_for_job(job) -> list[str]:
    if not isinstance(job, dict):
        return []
    req = job.get("required_skills")
    if isinstance(req, list):
        skills = [s.strip() for s in req if isinstance(s, str) and s.strip()]
        if skills:
            return skills
    return _fallback_text_mine(job)


def get_trending_skills(limit: int = 12) -> list[dict]:
    """Returns [{"skill": "Docker", "count": 14}, ...] -- number of cached
    postings requiring each skill, most-demanded first. [] if unavailable."""
    now = time.time()
    if _cache["data"] and now - _cache["ts"] < CACHE_TTL_SECONDS:
        return _cache["data"][:limit]

    try:
        rows = (
            get_supabase()
            .table(TABLE)
            .select(f"{RESULTS_COLUMN}, fetched_at")
            .order("fetched_at", desc=True)
            .limit(MAX_ROWS)
            .execute()
            .data
        ) or []
    except Exception as e:
        logger.warning("Market signal unavailable (%s). Continuing without it.", e)
        return []

    counts: Counter = Counter()
    display: dict = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        for job in _extract_job_list(row.get(RESULTS_COLUMN)):
            for skill in set(_skills_for_job(job)):
                key = skill.lower()
                display.setdefault(key, skill)
                counts[key] += 1

    result = [{"skill": display[k], "count": c} for k, c in counts.most_common()]
    if result:
        _cache["ts"] = now
        _cache["data"] = result
    return result[:limit]

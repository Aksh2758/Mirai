"""
services/role_classifier.py

Random Forest ROLE-FAMILY classifier for the Scanner pipeline.

Pipeline position:
    extractors (github / pdf / manual)
        -> build_role_features()      maps extractor output onto the 15 model features
        -> predict_role_family()      Random Forest -> stable role FAMILY + probabilities
        -> groq_service.analyze_skill_dna()   LLM turns the family into a specific,
                                              current job title + market-aware projects

The classifier predicts a broad, stable FAMILY (e.g. "Backend Development"), not a
volatile job title. Specific titles are Groq's job, informed by live market signals.

If the model files are missing or anything fails here, every public function
returns None and the caller falls back to the original Groq-only behaviour, so
the Scanner never breaks because of this module.
"""

import logging
import os
import re
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MODEL_DIR = os.getenv(
    "ROLE_MODEL_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ml_models"),
)
MODEL_FILE = "role_classifier.joblib"
ENCODER_FILE = "role_label_encoder.joblib"

# Must match FEATURE_NAMES in ml/train_role_classifier.py (same names, same order).
FEATURE_NAMES = [
    "pct_python", "pct_js_ts", "pct_java_kotlin", "pct_cpp_c", "pct_go_rust", "pct_sql",
    "framework_diversity", "project_complexity", "activity_recency", "doc_quality",
    "has_ml_libraries", "has_web_framework", "has_infra_tools",
    "has_mobile_framework", "has_data_pipeline_tools",
]

LOW_CONFIDENCE_THRESHOLD = 0.5

# ─────────────────────────────────────────────────────────────────────────────
# Role family -> domain (used by groq_service to pick the project rules)
# ─────────────────────────────────────────────────────────────────────────────

FAMILY_TO_DOMAIN = {
    "Backend Development": "Backend",
    "Frontend Development": "Frontend",
    "Full-Stack Development": "Full Stack",
    "ML / AI Engineering": "ML/AI",
    "Data Engineering": "Data Engineering",
    "DevOps / Cloud Infrastructure": "DevOps",
    "Mobile Development": "Mobile",
    "Security Engineering": "Security",
}


def domain_for_family(family: str, level: str | None = None) -> str:
    """Maps a role family to a project-rule domain. A Beginner in ML/AI gets the
    gentler 'Data/ML' project rules (pandas, sklearn, Streamlit) instead of
    deep-learning projects."""
    domain = FAMILY_TO_DOMAIN.get(family, "Full Stack")
    if domain == "ML/AI" and level == "Beginner":
        return "Data/ML"
    return domain


# ─────────────────────────────────────────────────────────────────────────────
# Keyword tables used to turn extractor output into model features
# ─────────────────────────────────────────────────────────────────────────────

# language name (lowercase) -> percentage bucket
LANGUAGE_BUCKETS = {
    "pct_python": {"python", "jupyter notebook", "jupyter"},
    "pct_js_ts": {"javascript", "typescript", "html", "css", "scss", "sass",
                  "vue", "svelte", "js", "ts"},
    "pct_java_kotlin": {"java", "kotlin", "c#", "scala"},
    "pct_cpp_c": {"c", "c++", "cpp"},
    "pct_go_rust": {"go", "golang", "rust"},
    "pct_sql": {"sql", "plpgsql", "tsql", "plsql", "pl/sql"},
}

# frameworks/tools that imply a language when a resume or quiz lists no explicit language
FRAMEWORK_TO_BUCKET = {
    "react": "pct_js_ts", "next.js": "pct_js_ts", "nextjs": "pct_js_ts",
    "vue": "pct_js_ts", "angular": "pct_js_ts", "svelte": "pct_js_ts",
    "node.js": "pct_js_ts", "nodejs": "pct_js_ts", "express.js": "pct_js_ts",
    "tailwind": "pct_js_ts",
    "django": "pct_python", "flask": "pct_python", "fastapi": "pct_python",
    "pandas": "pct_python", "numpy": "pct_python", "scikit-learn": "pct_python",
    "sklearn": "pct_python", "tensorflow": "pct_python", "pytorch": "pct_python",
    "keras": "pct_python",
    "spring boot": "pct_java_kotlin", "spring": "pct_java_kotlin",
}

ML_KEYWORDS = [
    "pandas", "numpy", "scikit-learn", "sklearn", "tensorflow", "pytorch", "keras",
    "machine learning", "deep learning", "neural network", "nlp", "computer vision",
    "llm", "transformers", "hugging face", "huggingface", "jupyter", "matplotlib",
    "seaborn", "xgboost", "opencv", "data science", "langchain",
]
WEB_KEYWORDS = [
    "react", "next.js", "nextjs", "vue", "angular", "svelte", "django", "flask",
    "fastapi", "express.js", "expressjs", "node.js", "nodejs", "spring boot",
    "tailwind", "rest api", "graphql", "laravel", "rails",
]
INFRA_KEYWORDS = [
    "docker", "dockerfile", "kubernetes", "k8s", "terraform", "hcl", "ansible",
    "jenkins", "github actions", "ci/cd", "cicd", "aws", "gcp", "azure", "linux",
    "nginx", "helm", "prometheus", "grafana", "devops", "cloudformation",
]
MOBILE_KEYWORDS = [
    "flutter", "react native", "swift", "swiftui", "android", "ios",
    "jetpack compose", "xamarin", "dart", "kotlin android",
]
# Only tools that unambiguously indicate data engineering. Kafka is deliberately
# excluded: backend engineers use it constantly, and the model treats this flag as
# strong evidence of Data Engineering.
DATA_PIPE_KEYWORDS = [
    "spark", "pyspark", "airflow", "dbt", "hadoop", "etl", "data pipeline",
    "snowflake", "bigquery", "databricks", "redshift", "flink",
]


def _compile(keywords: list[str]) -> re.Pattern:
    parts = "|".join(re.escape(k) for k in sorted(keywords, key=len, reverse=True))
    return re.compile(rf"(?<![a-z0-9])(?:{parts})(?![a-z0-9])")


_ML_RE = _compile(ML_KEYWORDS)
_WEB_RE = _compile(WEB_KEYWORDS)
_INFRA_RE = _compile(INFRA_KEYWORDS)
_MOBILE_RE = _compile(MOBILE_KEYWORDS)
_DATA_RE = _compile(DATA_PIPE_KEYWORDS)

_COMMIT_FREQ_SCORE = {"high": 0.9, "medium": 0.6, "low": 0.3}


# ─────────────────────────────────────────────────────────────────────────────
# Feature building: extractor output -> the 15 model features
# ─────────────────────────────────────────────────────────────────────────────

def _norm(s) -> str:
    return str(s).strip().lower()


def _collect_entries(github_data, pdf_data, manual_data) -> list[str]:
    """Short structured strings only (skills, technologies, titles, repo names and
    descriptions). Free-form resume prose is deliberately NOT included, which keeps
    keyword false-positives low."""
    entries: list[str] = []
    if github_data:
        entries += [_norm(k) for k in (github_data.get("top_languages") or {}).keys()]
        for r in github_data.get("top_repos") or []:
            for key in ("name", "description", "language"):
                if r.get(key):
                    entries.append(_norm(r[key]))
    for src in (pdf_data, manual_data):
        if not src:
            continue
        for key in ("detected_skills", "detected_technologies", "detected_job_titles"):
            entries += [_norm(x) for x in (src.get(key) or [])]
    return [e for e in entries if e]


def _language_bucket(name: str) -> str | None:
    for bucket, names in LANGUAGE_BUCKETS.items():
        if name in names:
            return bucket
    return None


def _github_language_pcts(github_data) -> dict | None:
    pcts = {b: 0.0 for b in LANGUAGE_BUCKETS}
    for lang, pct in (github_data.get("top_languages") or {}).items():
        bucket = _language_bucket(_norm(lang))
        if bucket:
            pcts[bucket] += float(pct)
    return pcts if sum(pcts.values()) > 0 else None


def _skill_language_pcts(pdf_data, manual_data) -> dict | None:
    """Resume/quiz have no percentages, so each detected language or framework counts
    once toward its bucket and the counts are normalised to 100. Approximate by design."""
    seen: dict[str, set] = {b: set() for b in LANGUAGE_BUCKETS}
    for src in (pdf_data, manual_data):
        if not src:
            continue
        for item in (src.get("detected_skills") or []) + (src.get("detected_technologies") or []):
            n = _norm(item)
            bucket = _language_bucket(n) or FRAMEWORK_TO_BUCKET.get(n)
            if bucket:
                seen[bucket].add(n)
    total = sum(len(v) for v in seen.values())
    if total == 0:
        return None
    return {b: 100.0 * len(v) / total for b, v in seen.items()}


def build_role_features(github_data=None, pdf_data=None, manual_data=None) -> dict:
    """Builds the 15-feature vector from whatever scanner sources were provided.

    Language percentages come straight from GitHub when available (60/40 blend with
    resume/quiz evidence if both exist). Keyword flags scan every source. Complexity,
    recency and doc quality are PROXIES computed from what the current extractors
    return (see comments), because the extractors don't parse dependency files,
    tests or READMEs yet.
    """
    entries = _collect_entries(github_data, pdf_data, manual_data)
    blob = " | ".join(entries)

    # --- language percentages
    gh = _github_language_pcts(github_data) if github_data else None
    sk = _skill_language_pcts(pdf_data, manual_data)
    if gh and sk:
        pcts = {b: 0.6 * gh[b] + 0.4 * sk[b] for b in LANGUAGE_BUCKETS}
    else:
        pcts = gh or sk or {b: 0.0 for b in LANGUAGE_BUCKETS}

    # --- keyword flags
    has_ml = int(bool(_ML_RE.search(blob)))
    has_web = int(bool(_WEB_RE.search(blob)))
    has_infra = int(bool(_INFRA_RE.search(blob)))
    has_mobile = int(bool(_MOBILE_RE.search(blob)))
    has_data = int(bool(_DATA_RE.search(blob)))

    # --- framework diversity: distinct known tools matched + distinct listed technologies
    matched = set()
    for rx in (_ML_RE, _WEB_RE, _INFRA_RE, _MOBILE_RE, _DATA_RE):
        matched.update(rx.findall(blob))
    listed_tech = set()
    for src in (pdf_data, manual_data):
        if src:
            listed_tech.update(_norm(t) for t in (src.get("detected_technologies") or []))
    framework_diversity = min(len(matched | listed_tech) / 10.0, 1.0)

    # --- project complexity proxy: repo count + stars (GitHub) and years of experience
    components = []
    if github_data:
        repo_component = min(float(github_data.get("repo_count", 0)) / 25.0, 1.0)
        stars = sum(int(r.get("stars", 0) or 0) for r in github_data.get("top_repos") or [])
        star_component = min(stars / 50.0, 1.0)
        components.append(0.6 * repo_component + 0.4 * star_component)
    years = None
    for src in (pdf_data, manual_data):
        if src and src.get("detected_experience_years") is not None:
            years = max(years or 0, float(src["detected_experience_years"]))
    if years is None and github_data:
        years = float(github_data.get("account_age_years", 0)) * 0.5
    if years is not None:
        components.append(min(years / 4.0, 1.0))
    project_complexity = sum(components) / len(components) if components else 0.3

    # --- activity recency proxy: GitHub commit_frequency label (neutral 0.5 without GitHub)
    if github_data:
        activity_recency = _COMMIT_FREQ_SCORE.get(github_data.get("commit_frequency"), 0.5)
    else:
        activity_recency = 0.5

    # --- doc quality proxy: share of top repos that have a description (neutral 0.4 otherwise)
    top_repos = (github_data or {}).get("top_repos") or []
    if top_repos:
        doc_quality = sum(1 for r in top_repos if r.get("description")) / len(top_repos)
    else:
        doc_quality = 0.4

    features = {
        **{b: round(pcts[b], 1) for b in LANGUAGE_BUCKETS},
        "framework_diversity": round(framework_diversity, 2),
        "project_complexity": round(project_complexity, 2),
        "activity_recency": round(activity_recency, 2),
        "doc_quality": round(doc_quality, 2),
        "has_ml_libraries": has_ml,
        "has_web_framework": has_web,
        "has_infra_tools": has_infra,
        "has_mobile_framework": has_mobile,
        "has_data_pipeline_tools": has_data,
    }
    return {name: features[name] for name in FEATURE_NAMES}


# ─────────────────────────────────────────────────────────────────────────────
# Model loading + prediction
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_model():
    """Loads the model once per process. Returns None if files are missing or
    incompatible (restart the server after adding or retraining the files)."""
    try:
        clf = joblib.load(os.path.join(MODEL_DIR, MODEL_FILE))
        le = joblib.load(os.path.join(MODEL_DIR, ENCODER_FILE))
        return clf, le
    except Exception as e:
        logger.warning("Role classifier unavailable (%s). Falling back to LLM-only role detection.", e)
        return None


def predict_role_family(features: dict) -> dict | None:
    """Returns the classifier verdict, or None if the model isn't available."""
    loaded = _load_model()
    if loaded is None:
        return None
    clf, le = loaded
    try:
        X = pd.DataFrame([[features[f] for f in FEATURE_NAMES]], columns=FEATURE_NAMES)
        probs = clf.predict_proba(X)[0]
    except Exception as e:
        logger.warning("Role prediction failed (%s). Falling back to LLM-only role detection.", e)
        return None

    order = np.argsort(probs)[::-1]
    top = int(order[0])
    return {
        "method": "random_forest",
        "family": str(le.classes_[top]),
        "confidence": round(float(probs[top]), 3),
        "low_confidence": bool(probs[top] < LOW_CONFIDENCE_THRESHOLD),
        "top_3": [
            {"family": str(le.classes_[i]), "probability": round(float(probs[i]), 3)}
            for i in order[:3]
        ],
        "all_probabilities": {
            str(le.classes_[i]): round(float(p), 3) for i, p in enumerate(probs)
        },
        "features_used": features,
    }


def classify_from_sources(github_data=None, pdf_data=None, manual_data=None) -> dict | None:
    """One-call helper used by groq_service: extractor output in, verdict (or None) out."""
    try:
        features = build_role_features(github_data, pdf_data, manual_data)
    except Exception as e:
        logger.warning("Feature building failed (%s). Falling back to LLM-only role detection.", e)
        return None
    return predict_role_family(features)

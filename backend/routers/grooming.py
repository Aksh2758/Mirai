from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db.mongo_client import get_mongo_db, get_projects_collection
from services.supabase_client import get_current_user_id, get_user_profile

router = APIRouter()

LabKey = Literal["resume", "mock", "aptitude", "interview"]

LABS = [
    {"key": "resume", "title": "Resume Builder", "subtitle": "Convert projects into recruiter-ready impact bullets.", "metric": "JD fit"},
    {"key": "mock", "title": "Mock Interview", "subtitle": "Practice behavioral and project deep-dive questions.", "metric": "AI panel"},
    {"key": "aptitude", "title": "Aptitude Prep", "subtitle": "Timed quantitative, logic, and verbal practice paths.", "metric": "20 min"},
    {"key": "interview", "title": "Interview Prep", "subtitle": "DSA, system design basics, HR, and follow-up plans.", "metric": "Roadmap"},
]

BASE_PREP_PATHS = {
    "resume": [
        {"title": "Profile headline", "detail": "Write a target-role headline using your scanner role and strongest skills.", "time": "5 min"},
        {"title": "Project impact bullets", "detail": "Turn your Studio project into measurable STAR bullets.", "time": "15 min"},
        {"title": "JD keyword match", "detail": "Compare resume language with one job description before applying.", "time": "10 min"},
    ],
    "mock": [
        {"title": "Project walkthrough", "detail": "Explain problem, architecture, tradeoffs, PSI improvements, and deployment.", "time": "12 min"},
        {"title": "Behavioral round", "detail": "Practice teamwork, ownership, failure, and learning velocity stories.", "time": "15 min"},
        {"title": "Feedback loop", "detail": "Receive scorecard and repeat weak question categories.", "time": "8 min"},
    ],
    "aptitude": [
        {"title": "Quant basics", "detail": "Percentages, ratios, time-work, profit-loss, and speed-distance drills.", "time": "20 min"},
        {"title": "Logic sets", "detail": "Arrangements, syllogisms, directions, series, and data interpretation.", "time": "20 min"},
        {"title": "Verbal practice", "detail": "Reading comprehension, grammar, sentence correction, and para jumbles.", "time": "15 min"},
    ],
    "interview": [
        {"title": "Technical recap", "detail": "Revise core stack concepts based on your active project tech stack.", "time": "25 min"},
        {"title": "DSA warm-up", "detail": "Arrays, strings, hash maps, stacks, queues, and two-pointer patterns.", "time": "30 min"},
        {"title": "HR readiness", "detail": "Prepare intro, strengths, weakness, relocation, salary, and closing questions.", "time": "20 min"},
    ],
}


class ResumeBulletsRequest(BaseModel):
    target_role: str = Field(min_length=2, max_length=80)
    project_name: str = Field(min_length=2, max_length=120)
    tech_stack: list[str] = Field(default_factory=list, max_length=8)


class ReadinessPlanRequest(BaseModel):
    target_role: str = Field(min_length=2, max_length=80)
    project_name: str = Field(min_length=2, max_length=120)
    focus_area: LabKey
    notes: str | None = Field(default=None, max_length=1000)
    generated_bullets: list[str] = Field(default_factory=list, max_length=8)


def _plans_collection():
    return get_mongo_db()["grooming_readiness_plans"]


def _serialize_plan(doc: dict | None) -> dict | None:
    if not doc:
        return None
    return {
        "id": str(doc["_id"]),
        "target_role": doc.get("target_role", ""),
        "project_name": doc.get("project_name", ""),
        "focus_area": doc.get("focus_area", "resume"),
        "notes": doc.get("notes"),
        "generated_bullets": doc.get("generated_bullets", []),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
        "updated_at": doc.get("updated_at", datetime.now(timezone.utc)).isoformat(),
    }


def _normalize_stack(stack: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in stack:
        value = item.strip()[:30]
        if value and value.lower() not in [existing.lower() for existing in cleaned]:
            cleaned.append(value)
        if len(cleaned) >= 8:
            break
    return cleaned


def _build_resume_bullets(target_role: str, project_name: str, tech_stack: list[str]) -> list[str]:
    role = target_role.strip() or "Software Engineer"
    project = project_name.strip() or "Nirmaan project"
    stack = _normalize_stack(tech_stack)
    stack_text = ", ".join(stack[:4]) if stack else "production-ready engineering practices"
    return [
        f"Built {project} for a {role} learning path using {stack_text}, with a focus on clean architecture and practical user workflows.",
        "Improved production readiness through structured code reviews, PSI quality checks, security fixes, and deployment-focused documentation.",
        "Demonstrated ownership by breaking the project into roadmap milestones, validating each step, and preparing interview-ready explanations of tradeoffs.",
    ]


async def _get_active_project(profile: dict, user_id: str) -> dict | None:
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
        "id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "tech_stack": doc.get("tech_stack", []),
        "difficulty": doc.get("difficulty", ""),
    }


def _readiness_score(profile: dict, active_project: dict | None, saved_plan: dict | None) -> int:
    score = 35
    if profile.get("role"):
        score += 10
    if profile.get("level"):
        score += 8
    if active_project:
        score += 14
    if saved_plan:
        score += 15
    if profile.get("xp_score", 0) > 0:
        score += min(18, int(profile.get("xp_score", 0) / 100))
    return max(0, min(score, 100))


def _personalize_paths(paths: dict, role: str, project_title: str) -> dict:
    personalized = {key: [dict(item) for item in value] for key, value in paths.items()}
    personalized["resume"][0]["detail"] = f"Write a {role} headline using your strongest scanner skills."
    personalized["resume"][1]["detail"] = f"Turn {project_title} into measurable STAR bullets."
    personalized["interview"][0]["detail"] = f"Revise the stack and tradeoffs behind {project_title} for {role} interviews."
    return personalized


@router.get("/lab")
async def get_grooming_lab(user_id: str = Depends(get_current_user_id)):
    """Return personalized Grooming Lab dashboard data."""
    profile = get_user_profile(user_id) or {}
    active_project = await _get_active_project(profile, user_id)
    saved_plan = await _plans_collection().find_one({"user_id": user_id}, sort=[("updated_at", -1)])

    target_role = profile.get("role") or "Software Engineer"
    project_title = active_project.get("title") if active_project else "your Nirmaan project"
    tech_stack = active_project.get("tech_stack", []) if active_project else []

    return {
        "target_role": target_role,
        "active_project": active_project,
        "readiness_score": _readiness_score(profile, active_project, saved_plan),
        "labs": LABS,
        "prep_paths": _personalize_paths(BASE_PREP_PATHS, target_role, project_title),
        "resume_bullets": _build_resume_bullets(target_role, project_title, tech_stack),
        "saved_plan": _serialize_plan(saved_plan),
    }


@router.post("/resume-bullets")
async def generate_resume_bullets(
    request: ResumeBulletsRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate deterministic resume bullets on the backend."""
    return {
        "bullets": _build_resume_bullets(
            request.target_role,
            request.project_name,
            request.tech_stack,
        )
    }


@router.post("/readiness-plan")
async def save_readiness_plan(
    request: ReadinessPlanRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Persist the user's current Grooming Lab plan."""
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "target_role": request.target_role.strip(),
        "project_name": request.project_name.strip(),
        "focus_area": request.focus_area,
        "notes": (request.notes or "").strip(),
        "generated_bullets": [bullet.strip() for bullet in request.generated_bullets if bullet.strip()][:8],
        "updated_at": now,
    }
    result = await _plans_collection().update_one(
        {"user_id": user_id, "focus_area": request.focus_area},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    plan = await _plans_collection().find_one({"_id": result.upserted_id}) if result.upserted_id else await _plans_collection().find_one({"user_id": user_id, "focus_area": request.focus_area})
    if not plan:
        raise HTTPException(status_code=500, detail="Could not save readiness plan")
    return {"ok": True, "plan": _serialize_plan(plan)}

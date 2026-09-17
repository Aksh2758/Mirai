from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from services.supabase_client import get_current_user_id, get_user_profile, get_supabase
from db.mongo_client import get_projects_collection

router = APIRouter()


def _extract_todo_bullets(instructions: str, max_items: int = 3) -> list[str]:
    """
    Pulls the first `max_items` numbered list items or bullet points
    from a markdown instructions string.
    Used to show the user a quick "what to do next" preview on the dashboard.
    """
    bullets = []
    for line in instructions.split('\n'):
        line = line.strip()
        # Match "1. something" or "- something" or "* something"
        if line and (
            (line[0].isdigit() and '. ' in line) or
            line.startswith('- ') or
            line.startswith('* ')
        ):
            # Strip the prefix
            if line[0].isdigit():
                text = line.split('. ', 1)[-1].strip()
            else:
                text = line[2:].strip()
            # Strip markdown bold markers
            text = text.replace('**', '')
            if text:
                bullets.append(text)
            if len(bullets) >= max_items:
                break
    return bullets


@router.get("/summary")
async def get_dashboard_summary(
    user_id: str = Depends(get_current_user_id),
):
    """
    Returns everything the dashboard needs in a single request.
    Fetches from Supabase (user profile) and MongoDB (project) in parallel.
    Reuses the jobs_cache for internship matches — does NOT call JSearch here.
    Falls back gracefully if any data source is missing.
    """
    # ── 1. Fetch user profile from Supabase ──────────────────────────────────
    profile = get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found. Complete the scanner first.")

    # Get email from Supabase auth (profile doesn't store it)
    sb = get_supabase()
    # auth.admin requires service role key which we have in backend
    try:
        auth_user = sb.auth.admin.get_user_by_id(user_id)
        email = auth_user.user.email if auth_user and auth_user.user else ""
    except Exception:
        email = ""

    user_data = {
        "full_name": profile.get("full_name"),
        "email": email,
        "role": profile.get("role"),
        "level": profile.get("level"),
        "xp": profile.get("xp_score", 0),
        "skill_scores": profile.get("skill_scores", {}),
        "pace_factor": profile.get("pace_factor"),
    }

    # ── 2. Fetch active project from MongoDB ─────────────────────────────────
    active_project = None
    active_project_id = profile.get("active_project_id")

    if active_project_id:
        col = get_projects_collection()
        try:
            doc = await col.find_one({
                "_id": ObjectId(active_project_id),
                "user_id": user_id,
            })
            if doc:
                steps = doc.get("steps", [])
                steps_done = sum(1 for s in steps if s.get("status") == "done")
                steps_total = len(steps)
                progress_pct = round((steps_done / steps_total) * 100) if steps_total > 0 else 0

                # Find the active step
                active_step = next(
                    (s for s in steps if s.get("status") == "active"),
                    steps[steps_done] if steps_done < steps_total else None
                )

                current_step_title = active_step.get("title", "") if active_step else ""
                current_step_todo = (
                    _extract_todo_bullets(active_step.get("instructions", ""))
                    if active_step else []
                )

                active_project = {
                    "id": str(doc["_id"]),
                    "title": doc.get("title", ""),
                    "tech_stack": doc.get("tech_stack", []),
                    "progress_pct": progress_pct,
                    "current_step_title": current_step_title,
                    "steps_done": steps_done,
                    "steps_total": steps_total,
                    "current_step_todo": current_step_todo,
                }
        except Exception:
            # If MongoDB fetch fails, dashboard still loads — just no project
            active_project = None

    # ── 3. Fetch top internship matches from jobs_cache ───────────────────────
    # We read from cache only — never call JSearch here (costs API credits)
    top_internships = []
    role = profile.get("role")
    skill_scores = profile.get("skill_scores", {})

    if role:
        try:
            cache = (
                sb.table("jobs_cache")
                .select("results")
                .eq("role", role)
                .execute()
            )
            if cache.data:
                all_jobs = cache.data[0].get("results", [])
                # Recalculate match_pct against current skills then take top 3
                from services.jobs_service import _calculate_match_pct
                for job in all_jobs:
                    job["match_pct"] = _calculate_match_pct(
                        job.get("description_snippet", ""), skill_scores
                    )
                all_jobs.sort(key=lambda j: j["match_pct"], reverse=True)
                top_internships = [
                    {
                        "job_id": j.get("job_id", ""),
                        "title": j.get("title", ""),
                        "company": j.get("company", ""),
                        "location": j.get("location", ""),
                        "is_remote": j.get("is_remote", False),
                        "match_pct": j.get("match_pct", 0),
                        "apply_url": j.get("apply_url", ""),
                    }
                    for j in all_jobs[:3]
                ]
        except Exception:
            # Jobs cache fetch failing should never break the dashboard
            top_internships = []

    return {
        "user": user_data,
        "active_project": active_project,
        "top_internships": top_internships,
        "scanner_completed": profile.get("scanner_completed", False),
    }

from fastapi import APIRouter, Depends, HTTPException, Query
from services.supabase_client import get_current_user_id
from services.jobs_service import diagnose_sources, get_jobs_with_cache
from services.supabase_client import get_user_profile

router = APIRouter()


@router.get("/search")
async def search_jobs(
    refresh: bool = Query(default=False),
    user_id: str = Depends(get_current_user_id),
):
    """
    Returns job listings matched to the user's stored role and skill_scores.
    Does NOT accept role/skills as query params — reads from Supabase profile.
    Uses 6-hour cache to preserve JSearch API credits.
    """
    try:
        result = await get_jobs_with_cache(user_id, force_refresh=refresh)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Job fetch failed: {str(e)}")

    return result


@router.get("/diagnose")
async def diagnose(user_id: str = Depends(get_current_user_id)):
    """Shows how many postings each source (JSearch, Unstop, Remotive ...) returned right now,
    and the exact error for any that failed. Open it in the browser while logged in."""
    profile = get_user_profile(user_id) or {}
    return await diagnose_sources(profile.get("role") or "Software Developer")
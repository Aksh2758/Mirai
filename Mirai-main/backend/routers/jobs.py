from fastapi import APIRouter, Depends, HTTPException
from services.supabase_client import get_current_user_id
from services.jobs_service import get_jobs_with_cache

router = APIRouter()


@router.get("/search")
async def search_jobs(
    user_id: str = Depends(get_current_user_id),
):
    """
    Returns job listings matched to the user's stored role and skill_scores.
    Does NOT accept role/skills as query params — reads from Supabase profile.
    Uses 6-hour cache to preserve JSearch API credits.
    """
    try:
        result = await get_jobs_with_cache(user_id)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Job fetch failed: {str(e)}")

    return result

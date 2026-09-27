from fastapi import APIRouter, Depends, Query

from services.discovery_service import get_discovery_hub, get_hackathons
from services.supabase_client import get_current_user_id

router = APIRouter()


@router.get("/hub")
async def discovery_hub(
    refresh: bool = Query(default=False),
    user_id: str = Depends(get_current_user_id),
):
    """
    Fetch internet-backed opportunities for the Discovery Hub.

    Internships come from the existing JSearch/RapidAPI integration through
    get_jobs_with_cache. Hackathons come from India-oriented Devfolio/Unstop sources plus
    India-filtered Hack Club events and are cached in MongoDB.
    """
    return await get_discovery_hub(user_id=user_id, force_refresh=refresh)


@router.get("/hackathons")
async def discovery_hackathons(
    refresh: bool = Query(default=False),
    mode: str | None = Query(default=None, pattern="^(online|offline)$"),
    location: str | None = Query(default=None, max_length=80),
    max_duration_days: int | None = Query(default=None, ge=1, le=120),
    min_team_size: int | None = Query(default=None, ge=1, le=20),
    user_id: str = Depends(get_current_user_id),
):
    """Fetch India-first hackathons from multiple sources with backend-side filters."""
    _ = user_id
    return await get_hackathons(
        force_refresh=refresh,
        mode=mode,
        location=location,
        max_duration_days=max_duration_days,
        min_team_size=min_team_size,
    )

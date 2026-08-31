from fastapi import APIRouter, Depends, Query

from services.discovery_service import get_discovery_hub
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
    get_jobs_with_cache. Hackathons come from Hack Club's public upcoming
    hackathon feed and are cached in MongoDB.
    """
    return await get_discovery_hub(user_id=user_id, force_refresh=refresh)

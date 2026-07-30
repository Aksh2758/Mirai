"""
Auth Router — Handles post-OAuth profile setup.
Currently: saves GitHub token + username after GitHub OAuth login.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.supabase_client import get_current_user_id, upsert_user_profile

router = APIRouter()


class SaveGithubTokenRequest(BaseModel):
    github_token: str | None = None
    github_username: str | None = None


class SaveVercelTokenRequest(BaseModel):
    vercel_token: str


@router.post("/save-github-token")
async def save_github_token(
    request: SaveGithubTokenRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Called after GitHub OAuth login to save the provider token and username.
    The GitHub token is used for:
    - Higher rate limits on GitHub API (scanner)
    - Creating repos and pushing code (deploy)
    """
    if not request.github_token and not request.github_username:
        raise HTTPException(status_code=400, detail="At least one field required")

    update_data = {}
    if request.github_token:
        update_data["github_token"] = request.github_token
    if request.github_username:
        update_data["github_username"] = request.github_username

    upsert_user_profile(user_id, update_data)
    return {"ok": True, "saved": list(update_data.keys())}


@router.post("/save-vercel-token")
async def save_vercel_token(
    request: SaveVercelTokenRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Saves the user's Vercel personal access token.
    This enables real Vercel deployment after GitHub push.
    Token is stored in the user's profile in Supabase.
    """
    if not request.vercel_token or len(request.vercel_token) < 10:
        raise HTTPException(status_code=400, detail="Invalid Vercel token")

    upsert_user_profile(user_id, {"vercel_token": request.vercel_token})
    return {"ok": True, "message": "Vercel token saved. Real deployment is now enabled."}


@router.delete("/vercel-token")
async def remove_vercel_token(
    user_id: str = Depends(get_current_user_id),
):
    """Removes the user's stored Vercel token."""
    upsert_user_profile(user_id, {"vercel_token": None})
    return {"ok": True}

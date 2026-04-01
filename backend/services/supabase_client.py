import os
from supabase import create_client, Client
from dotenv import load_dotenv
from fastapi import Header, HTTPException

load_dotenv()

_client: Client | None = None

def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        _client = create_client(url, key)
    return _client


def get_user_profile(user_id: str) -> dict | None:
    """Fetch a user's profile row from user_profiles table."""
    sb = get_supabase()
    result = sb.table("user_profiles").select("*").eq("id", user_id).maybe_single().execute()
    return result.data


def upsert_user_profile(user_id: str, data: dict) -> dict:
    """
    Update fields in user_profiles for a given user_id.
    data = dict of columns to update, e.g. {"role": "Backend Engineer", "level": "Intermediate"}
    Always adds updated_at automatically.
    """
    from datetime import datetime, timezone
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    result = (
        sb.table("user_profiles")
        .upsert({"id": user_id, **data}, on_conflict="id")
        .execute()
    )
    return result.data


def verify_jwt(token: str) -> str:
    """
    Verify a Supabase JWT from the Authorization header.
    Returns the user_id (UUID string) if valid, else raises 401.
    """
    try:
        sb = get_supabase()
        # The supabase-py library doesn't have a direct 'verify' but get_user(token) 
        # will only work if the token is valid for that project.
        user_data = sb.auth.get_user(token)
        if user_data and user_data.user:
            return user_data.user.id
    except Exception as e:
        print(f"Auth error: {str(e)}")
        pass
    
    raise HTTPException(status_code=401, detail="Invalid or expired authentication token")


async def get_current_user_id(authorization: str = Header(None)) -> str:
    """
    FastAPI dependency to get the current user_id.
    Strictly requires a Bearer token.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    return verify_jwt(token)

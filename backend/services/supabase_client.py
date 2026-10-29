import os
import base64
import hashlib
import json
import time
from collections import OrderedDict
from threading import RLock
from supabase import create_client, Client
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from starlette.concurrency import run_in_threadpool

load_dotenv()

_client: Client | None = None
_verified_tokens: OrderedDict[str, tuple[str, float]] = OrderedDict()
_verified_tokens_lock = RLock()
_VERIFIED_TOKEN_CACHE_LIMIT = 4096

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
    # Supabase's user lookup is a network round-trip. Cache a successfully
    # verified token only until its JWT expiry so normal API navigation does
    # not validate the same bearer token remotely on every request.
    token_key = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with _verified_tokens_lock:
        cached = _verified_tokens.get(token_key)
    if cached:
        user_id, expires_at = cached
        if expires_at > time.time():
            with _verified_tokens_lock:
                _verified_tokens.move_to_end(token_key)
            return user_id
        with _verified_tokens_lock:
            _verified_tokens.pop(token_key, None)

    try:
        sb = get_supabase()
        # The supabase-py library doesn't have a direct 'verify' but get_user(token) 
        # will only work if the token is valid for that project.
        user_data = sb.auth.get_user(token)
        if user_data and user_data.user:
            user_id = user_data.user.id
            # Decode only to determine the cache lifetime. Signature and
            # claims are still validated by Supabase before anything is cached.
            payload_part = token.split(".")[1]
            payload_part += "=" * (-len(payload_part) % 4)
            exp = json.loads(base64.urlsafe_b64decode(payload_part)).get("exp")
            if isinstance(exp, (int, float)):
                expires_at = min(float(exp) - 5, time.time() + 3600)
                if expires_at > time.time():
                    with _verified_tokens_lock:
                        _verified_tokens[token_key] = (user_id, expires_at)
                        _verified_tokens.move_to_end(token_key)
                        while len(_verified_tokens) > _VERIFIED_TOKEN_CACHE_LIMIT:
                            _verified_tokens.popitem(last=False)
            return user_id
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
    return await run_in_threadpool(verify_jwt, token)

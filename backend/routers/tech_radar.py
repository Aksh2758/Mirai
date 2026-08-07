from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db.mongo_client import get_mongo_db
from services.supabase_client import get_current_user_id, get_user_profile

router = APIRouter()

RadarMode = Literal["buddy", "team", "doubt"]


class TechRadarPostCreate(BaseModel):
    mode: RadarMode
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(min_length=10, max_length=1200)
    tags: list[str] = Field(default_factory=list, max_length=8)


class TechRadarConnectRequest(BaseModel):
    message: str | None = Field(default=None, max_length=500)


def _posts_collection():
    return get_mongo_db()["tech_radar_posts"]


def _connections_collection():
    return get_mongo_db()["tech_radar_connections"]


def _clean_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    for tag in tags:
        normalized = tag.strip().strip("#")[:28]
        if normalized and normalized.lower() not in [item.lower() for item in cleaned]:
            cleaned.append(normalized)
        if len(cleaned) >= 8:
            break
    return cleaned


def _serialize_post(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "mode": doc.get("mode", "buddy"),
        "title": doc.get("title", ""),
        "body": doc.get("body", ""),
        "tags": doc.get("tags", []),
        "author_name": doc.get("author_name", "Nirmaan learner"),
        "author_role": doc.get("author_role", "Project builder"),
        "connections_count": doc.get("connections_count", 0),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)).isoformat(),
    }


def _display_name(user_id: str, profile: dict | None) -> str:
    if profile and profile.get("full_name"):
        return profile["full_name"]
    return f"Learner {user_id[:6]}"


@router.get("/posts")
async def list_posts(
    mode: RadarMode | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
):
    """Return Tech Radar networking posts from MongoDB."""
    query: dict = {"status": "active"}
    if mode:
        query["mode"] = mode

    cursor = _posts_collection().find(query).sort("created_at", -1).limit(60)
    posts = [_serialize_post(doc) async for doc in cursor]

    counts = {"buddy": 0, "team": 0, "doubt": 0}
    async for row in _posts_collection().aggregate([
        {"$match": {"status": "active"}},
        {"$group": {"_id": "$mode", "count": {"$sum": 1}}},
    ]):
        if row.get("_id") in counts:
            counts[row["_id"]] = row.get("count", 0)

    return {"posts": posts, "counts": counts}


@router.post("/posts")
async def create_post(
    request: TechRadarPostCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Create a learner networking post."""
    profile = get_user_profile(user_id) or {}
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "mode": request.mode,
        "title": request.title.strip(),
        "body": request.body.strip(),
        "tags": _clean_tags(request.tags),
        "author_name": _display_name(user_id, profile),
        "author_role": profile.get("role") or "Project builder",
        "connections_count": 0,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    result = await _posts_collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_post(doc)


@router.post("/posts/{post_id}/connect")
async def connect_to_post(
    post_id: str,
    request: TechRadarConnectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Record that the current learner wants to connect with a post author."""
    try:
        oid = ObjectId(post_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post ID")

    post = await _posts_collection().find_one({"_id": oid, "status": "active"})
    if not post:
        raise HTTPException(status_code=404, detail="Tech Radar post not found")

    if post.get("user_id") == user_id:
        raise HTTPException(status_code=400, detail="You cannot connect to your own post")

    now = datetime.now(timezone.utc)
    connection = {
        "post_id": post_id,
        "post_owner_id": post.get("user_id"),
        "requester_id": user_id,
        "message": (request.message or "").strip(),
        "status": "requested",
        "created_at": now,
    }

    result = await _connections_collection().update_one(
        {"post_id": post_id, "requester_id": user_id},
        {"$setOnInsert": connection},
        upsert=True,
    )
    if result.upserted_id:
        await _posts_collection().update_one(
            {"_id": oid},
            {"$inc": {"connections_count": 1}, "$set": {"updated_at": now}},
        )

    return {"ok": True, "status": "requested"}

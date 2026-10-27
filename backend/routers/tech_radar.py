import re
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db.mongo_client import get_mongo_db
from services.radar_ranker import learner_document, rank_posts
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


class TechRadarReplyCreate(BaseModel):
    body: str = Field(min_length=1, max_length=800)


def _posts_collection():
    return get_mongo_db()["tech_radar_posts"]


def _connections_collection():
    return get_mongo_db()["tech_radar_connections"]


def _replies_collection():
    return get_mongo_db()["tech_radar_replies"]


def _clean_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    for tag in tags:
        normalized = tag.strip().strip("#")[:28]
        if normalized and normalized.lower() not in [item.lower() for item in cleaned]:
            cleaned.append(normalized)
        if len(cleaned) >= 8:
            break
    return cleaned


def _iso(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return datetime.now(timezone.utc).isoformat()


def _serialize_post(doc: dict, viewer_id: str | None = None) -> dict:
    return {
        "id": str(doc["_id"]),
        "mode": doc.get("mode", "buddy"),
        "title": doc.get("title", ""),
        "body": doc.get("body", ""),
        "tags": doc.get("tags", []),
        "author_name": doc.get("author_name", "Nirmaan learner"),
        "author_role": doc.get("author_role", "Project builder"),
        "connections_count": doc.get("connections_count", 0),
        "replies_count": doc.get("replies_count", 0),
        "is_mine": bool(viewer_id) and doc.get("user_id") == viewer_id,
        "created_at": _iso(doc.get("created_at")),
    }


def _serialize_reply(doc: dict, viewer_id: str | None = None, post_owner_id: str | None = None) -> dict:
    return {
        "id": str(doc["_id"]),
        "post_id": doc.get("post_id", ""),
        "body": doc.get("body", ""),
        "author_name": doc.get("author_name", "Nirmaan learner"),
        "author_role": doc.get("author_role", "Project builder"),
        "is_mine": bool(viewer_id) and doc.get("user_id") == viewer_id,
        "is_post_author": bool(post_owner_id) and doc.get("user_id") == post_owner_id,
        "created_at": _iso(doc.get("created_at")),
    }


def _display_name(user_id: str, profile: dict | None) -> str:
    if profile and profile.get("full_name"):
        return profile["full_name"]
    return f"Learner {user_id[:6]}"


def _search_filter(q: str | None) -> dict:
    """Case-insensitive match against title, body and tags. The input is escaped, so it is never a regex."""
    text = (q or "").strip()[:80]
    if not text:
        return {}
    pattern = re.escape(text)
    rx = {"$regex": pattern, "$options": "i"}
    return {"$or": [{"title": rx}, {"body": rx}, {"tags": rx}, {"author_name": rx}]}


def _object_id(post_id: str) -> ObjectId:
    try:
        return ObjectId(post_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post ID")


@router.get("/posts")
async def list_posts(
    mode: RadarMode | None = Query(default=None),
    q: str | None = Query(default=None, max_length=80),
    mine: bool = Query(default=False),
    sort: Literal["new", "for_you"] = Query(default="new"),
    limit: int = Query(default=60, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(get_current_user_id),
):
    """Active Tech Radar posts from all users, newest first. Optional category, text search and 'my posts' filters."""
    base: dict = {"status": "active", **_search_filter(q)}
    if mine:
        base["user_id"] = user_id
    query = {**base, "mode": mode} if mode else base

    if sort == "for_you":
        # AI ranking: TF-IDF cosine between the learner's profile and each post (see services/radar_ranker.py)
        profile = get_user_profile(user_id) or {}
        own_tags: list[str] = []
        async for mine_doc in _posts_collection().find({"user_id": user_id, "status": "active"}, {"tags": 1}).limit(20):
            own_tags.extend(mine_doc.get("tags", []))
        pool = [_serialize_post(doc, user_id) async for doc in _posts_collection().find(query).sort("created_at", -1).limit(300)]
        ranked = rank_posts(pool, learner_document(profile, own_tags), str(profile.get("role") or ""))
        total = len(ranked)
        posts = ranked[offset: offset + limit]
    else:
        cursor = _posts_collection().find(query).sort("created_at", -1).skip(offset).limit(limit)
        posts = [_serialize_post(doc, user_id) async for doc in cursor]
        total = await _posts_collection().count_documents(query)

    # counts follow the search text so each category card shows how many matches it has
    counts = {"buddy": 0, "team": 0, "doubt": 0}
    async for row in _posts_collection().aggregate([
        {"$match": base},
        {"$group": {"_id": "$mode", "count": {"$sum": 1}}},
    ]):
        if row.get("_id") in counts:
            counts[row["_id"]] = row.get("count", 0)

    return {"posts": posts, "counts": counts, "total": total, "has_more": offset + len(posts) < total}


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
        "replies_count": 0,
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    result = await _posts_collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_post(doc, user_id)


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, user_id: str = Depends(get_current_user_id)):
    """Authors can remove their own post (soft delete, replies are kept but hidden with it)."""
    oid = _object_id(post_id)
    result = await _posts_collection().update_one(
        {"_id": oid, "user_id": user_id, "status": "active"},
        {"$set": {"status": "removed", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Post not found or not yours")
    return {"ok": True}


@router.get("/posts/{post_id}/replies")
async def list_replies(
    post_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
):
    """Replies to a post, oldest first so the thread reads top to bottom."""
    oid = _object_id(post_id)
    post = await _posts_collection().find_one({"_id": oid, "status": "active"})
    if not post:
        raise HTTPException(status_code=404, detail="Tech Radar post not found")

    cursor = _replies_collection().find({"post_id": post_id}).sort("created_at", 1).limit(limit)
    replies = [_serialize_reply(doc, user_id, post.get("user_id")) async for doc in cursor]
    return {"replies": replies}


@router.post("/posts/{post_id}/replies")
async def create_reply(
    post_id: str,
    request: TechRadarReplyCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Reply to a post. Anyone signed in can reply, including the post author."""
    oid = _object_id(post_id)
    post = await _posts_collection().find_one({"_id": oid, "status": "active"})
    if not post:
        raise HTTPException(status_code=404, detail="Tech Radar post not found")

    body = request.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Reply cannot be empty")

    profile = get_user_profile(user_id) or {}
    now = datetime.now(timezone.utc)
    doc = {
        "post_id": post_id,
        "user_id": user_id,
        "body": body,
        "author_name": _display_name(user_id, profile),
        "author_role": profile.get("role") or "Project builder",
        "created_at": now,
    }
    result = await _replies_collection().insert_one(doc)
    doc["_id"] = result.inserted_id
    await _posts_collection().update_one(
        {"_id": oid},
        {"$inc": {"replies_count": 1}, "$set": {"updated_at": now}},
    )
    return _serialize_reply(doc, user_id, post.get("user_id"))


@router.delete("/posts/{post_id}/replies/{reply_id}")
async def delete_reply(post_id: str, reply_id: str, user_id: str = Depends(get_current_user_id)):
    """Authors can delete their own reply."""
    oid = _object_id(post_id)
    rid = _object_id(reply_id)
    result = await _replies_collection().delete_one({"_id": rid, "post_id": post_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reply not found or not yours")
    await _posts_collection().update_one({"_id": oid, "replies_count": {"$gt": 0}}, {"$inc": {"replies_count": -1}})
    return {"ok": True}


@router.post("/posts/{post_id}/connect")
async def connect_to_post(
    post_id: str,
    request: TechRadarConnectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Record that the current learner wants to connect with a post author."""
    oid = _object_id(post_id)

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
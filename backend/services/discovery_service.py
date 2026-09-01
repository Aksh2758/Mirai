import os
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

from db.mongo_client import get_mongo_db
from services.jobs_service import get_jobs_with_cache

HACK_CLUB_EVENTS_URL = "https://hackathons.hackclub.com/api/events/upcoming"
HACKATHON_CACHE_TTL_HOURS = 6


def _hackathons_collection():
    return get_mongo_db()["hackathons_cache"]


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _format_location(event: dict[str, Any]) -> tuple[str, bool]:
    virtual = bool(event.get("virtual") or event.get("online") or event.get("isOnline"))
    raw_location = event.get("location") or event.get("address") or event.get("city") or ""
    if isinstance(raw_location, dict):
        city = raw_location.get("city") or ""
        state = raw_location.get("state") or raw_location.get("region") or ""
        country = raw_location.get("country") or ""
        location = ", ".join(part for part in [city, state, country] if part)
    else:
        location = str(raw_location).strip()

    if not location:
        location = "Online" if virtual else "Location TBA"
    return location, virtual or location.lower() == "online"


def _normalize_hackathon(event: dict[str, Any]) -> dict[str, Any] | None:
    event_id = str(event.get("id") or event.get("slug") or event.get("name") or "").strip()
    name = str(event.get("name") or event.get("title") or "").strip()
    website = str(event.get("website") or event.get("url") or event.get("eventUrl") or "").strip()
    if not name or not website:
        return None

    start_dt = _parse_date(event.get("start") or event.get("startDate"))
    end_dt = _parse_date(event.get("end") or event.get("endDate"))
    location, is_online = _format_location(event)
    now = datetime.now(timezone.utc)

    status = "upcoming"
    if start_dt and start_dt <= now and (not end_dt or end_dt >= now):
        status = "open"

    return {
        "id": event_id or name.lower().replace(" ", "-"),
        "title": name,
        "organizer": str(event.get("organizer") or "Hack Club"),
        "location": location,
        "is_online": is_online,
        "start_date": start_dt.isoformat() if start_dt else "",
        "end_date": end_dt.isoformat() if end_dt else "",
        "url": website,
        "source": "Hack Club Hackathons",
        "status": status,
        "themes": ["Student", "Build", "Hackathon"],
    }


async def fetch_hackathons_from_internet(limit: int = 24, force_refresh: bool = False) -> dict[str, Any]:
    """Fetch upcoming hackathons from a public internet source and cache normalized results in MongoDB."""
    cache_col = _hackathons_collection()
    now = datetime.now(timezone.utc)

    if not force_refresh:
        cached = await cache_col.find_one({"source": "hackclub_upcoming"})
        if cached:
            fetched_at = cached.get("fetched_at")
            if isinstance(fetched_at, datetime):
                age_hours = (now - fetched_at).total_seconds() / 3600
                if age_hours < HACKATHON_CACHE_TTL_HOURS:
                    return {
                        "hackathons": cached.get("results", [])[:limit],
                        "cached": True,
                        "cache_age_hours": round(age_hours, 1),
                        "source": HACK_CLUB_EVENTS_URL,
                    }

    async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
        response = await client.get(
            HACK_CLUB_EVENTS_URL,
            headers={"User-Agent": "Nirmaan Discovery Hub/1.0"},
        )
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, list):
        raise ValueError("Hackathon source returned an unexpected response")

    normalized = []
    for event in payload:
        if isinstance(event, dict):
            item = _normalize_hackathon(event)
            if item:
                normalized.append(item)

    normalized.sort(key=lambda event: event.get("start_date") or "9999")
    normalized = normalized[:limit]

    await cache_col.update_one(
        {"source": "hackclub_upcoming"},
        {"$set": {"source": "hackclub_upcoming", "results": normalized, "fetched_at": now}},
        upsert=True,
    )

    return {
        "hackathons": normalized,
        "cached": False,
        "cache_age_hours": 0,
        "source": HACK_CLUB_EVENTS_URL,
    }


async def get_discovery_hub(user_id: str, force_refresh: bool = False) -> dict[str, Any]:
    """Fetch internet-backed internships and hackathons for the Discovery Hub."""
    internships = []
    internship_meta = {"role_searched": "", "cached": False, "cache_age_hours": 0, "total": 0}
    internships_error = None

    try:
        jobs_result = await get_jobs_with_cache(user_id)
        internships = jobs_result.get("jobs", [])
        internship_meta = {
            "role_searched": jobs_result.get("role_searched", ""),
            "cached": jobs_result.get("cached", False),
            "cache_age_hours": jobs_result.get("cache_age_hours", 0),
            "total": jobs_result.get("total", len(internships)),
        }
    except Exception as exc:
        internships_error = str(exc)

    hackathon_result = {"hackathons": [], "cached": False, "cache_age_hours": 0, "source": HACK_CLUB_EVENTS_URL}
    hackathons_error = None
    try:
        hackathon_result = await fetch_hackathons_from_internet(force_refresh=force_refresh)
    except Exception as exc:
        hackathons_error = str(exc)

    return {
        "internships": internships,
        "internship_meta": internship_meta,
        "internships_error": internships_error,
        "hackathons": hackathon_result.get("hackathons", []),
        "hackathon_meta": {
            "source": hackathon_result.get("source", HACK_CLUB_EVENTS_URL),
            "cached": hackathon_result.get("cached", False),
            "cache_age_hours": hackathon_result.get("cache_age_hours", 0),
            "total": len(hackathon_result.get("hackathons", [])),
        },
        "hackathons_error": hackathons_error,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

from datetime import datetime, timezone
from math import ceil
from typing import Any

import httpx

from db.mongo_client import get_mongo_db
from services.jobs_service import get_jobs_with_cache

HACK_CLUB_EVENTS_URL = "https://hackathons.hackclub.com/api/events/upcoming"
HACKATHON_CACHE_TTL_HOURS = 6
HACKATHON_TIMEOUT_SECONDS = 10.0


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


def _event_text(event: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ["name", "title", "description", "summary", "rules", "prize", "team", "teamSize", "maxTeamSize"]:
        value = event.get(key)
        if isinstance(value, (str, int, float)):
            parts.append(str(value))
    return " ".join(parts).lower()


def _duration(start_dt: datetime | None, end_dt: datetime | None) -> tuple[int | None, int | None]:
    if not start_dt or not end_dt:
        return None, None
    hours = max(1, ceil((end_dt - start_dt).total_seconds() / 3600))
    return hours, max(1, ceil(hours / 24))


def _first_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    import re

    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else None


def _team_size(event: dict[str, Any]) -> tuple[int | None, int | None]:
    min_candidates = ["minTeamSize", "min_team_size", "minimumTeamSize", "team_size_min"]
    max_candidates = ["maxTeamSize", "max_team_size", "maximumTeamSize", "team_size", "teamSize", "team_size_max"]
    team_min = next((value for key in min_candidates if (value := _first_int(event.get(key))) is not None), None)
    team_max = next((value for key in max_candidates if (value := _first_int(event.get(key))) is not None), None)

    import re

    text = _event_text(event)
    range_match = re.search(r"(?:teams?|groups?)\s*(?:of|size)?\s*(\d+)\s*(?:-|to)\s*(\d+)", text)
    up_to_match = re.search(r"(?:teams?|groups?)\s*(?:of|up to|upto|maximum|max)?\s*(\d+)", text)
    if range_match:
        team_min = team_min or int(range_match.group(1))
        team_max = team_max or int(range_match.group(2))
    elif up_to_match:
        team_max = team_max or int(up_to_match.group(1))

    if team_min and team_max and team_min > team_max:
        team_min, team_max = team_max, team_min
    return team_min, team_max


def _themes(event: dict[str, Any], is_online: bool) -> list[str]:
    raw_tags = event.get("tags") or event.get("themes") or event.get("categories") or []
    themes: list[str] = []
    if isinstance(raw_tags, list):
        themes = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
    themes.extend(["Online" if is_online else "Offline", "Student", "Build"])
    deduped: list[str] = []
    for theme in themes:
        if theme not in deduped:
            deduped.append(theme)
    return deduped[:6]


def _teammate_prefill(title: str, location: str, start_date: str, url: str, team_max: int | None, themes: list[str]) -> dict[str, Any] | None:
    if not team_max or team_max <= 2:
        return None
    tags = ["Hackathon", "Team"] + themes[:4]
    return {
        "title": f"Need teammates for {title}",
        "body": (
            f"I want to join {title}. It starts on {start_date or 'TBA'} and is listed for {location}. "
            f"Team size supports up to {team_max} members, so I am looking for teammates from Nirmaan. "
            f"Hackathon link: {url}"
        ),
        "tags": list(dict.fromkeys(tags))[:8],
    }


def _normalize_hackathon(event: dict[str, Any]) -> dict[str, Any] | None:
    event_id = str(event.get("id") or event.get("slug") or event.get("name") or "").strip()
    name = str(event.get("name") or event.get("title") or "").strip()
    website = str(event.get("website") or event.get("url") or event.get("eventUrl") or "").strip()
    if not name or not website:
        return None

    start_dt = _parse_date(event.get("start") or event.get("startDate"))
    end_dt = _parse_date(event.get("end") or event.get("endDate"))
    duration_hours, duration_days = _duration(start_dt, end_dt)
    location, is_online = _format_location(event)
    team_min, team_max = _team_size(event)
    now = datetime.now(timezone.utc)

    status = "upcoming"
    if start_dt and start_dt <= now and (not end_dt or end_dt >= now):
        status = "open"

    themes = _themes(event, is_online)
    start_date = start_dt.isoformat() if start_dt else ""

    return {
        "id": event_id or name.lower().replace(" ", "-"),
        "title": name,
        "organizer": str(event.get("organizer") or event.get("club") or "Hack Club"),
        "location": location,
        "is_online": is_online,
        "start_date": start_date,
        "end_date": end_dt.isoformat() if end_dt else "",
        "duration_hours": duration_hours,
        "duration_days": duration_days,
        "team_size_min": team_min,
        "team_size_max": team_max,
        "team_required": bool(team_max and team_max > 1),
        "teammate_prefill": _teammate_prefill(name, location, start_date, website, team_max, themes),
        "url": website,
        "source": "Hack Club Hackathons",
        "status": status,
        "themes": themes,
        "logo_url": event.get("logo") or "",
        "banner_url": event.get("banner") or "",
    }


async def fetch_hackathons_from_internet(limit: int = 24, force_refresh: bool = False) -> dict[str, Any]:
    """Fetch upcoming hackathons from Hack Club and cache normalized results in MongoDB."""
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

    async with httpx.AsyncClient(timeout=HACKATHON_TIMEOUT_SECONDS, follow_redirects=True) as client:
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


def _matches_hackathon_filters(
    hackathon: dict[str, Any],
    mode: str | None,
    location: str | None,
    max_duration_days: int | None,
    min_team_size: int | None,
) -> bool:
    if mode == "online" and not hackathon.get("is_online"):
        return False
    if mode == "offline" and hackathon.get("is_online"):
        return False
    if location and location.lower() not in str(hackathon.get("location", "")).lower():
        return False
    if max_duration_days and (hackathon.get("duration_days") or 10**6) > max_duration_days:
        return False
    if min_team_size and (hackathon.get("team_size_max") or 0) < min_team_size:
        return False
    return True


async def get_hackathons(
    force_refresh: bool = False,
    mode: str | None = None,
    location: str | None = None,
    max_duration_days: int | None = None,
    min_team_size: int | None = None,
) -> dict[str, Any]:
    result = await fetch_hackathons_from_internet(force_refresh=force_refresh)
    hackathons = [
        hackathon for hackathon in result.get("hackathons", [])
        if _matches_hackathon_filters(hackathon, mode, location, max_duration_days, min_team_size)
    ]
    return {
        "hackathons": hackathons,
        "meta": {
            "source": result.get("source", HACK_CLUB_EVENTS_URL),
            "cached": result.get("cached", False),
            "cache_age_hours": result.get("cache_age_hours", 0),
            "total": len(hackathons),
        },
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

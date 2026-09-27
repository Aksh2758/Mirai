import asyncio
import re
from datetime import datetime, timezone
from html import unescape
from math import ceil
from typing import Any

import httpx

from db.mongo_client import get_mongo_db
from services.jobs_service import get_jobs_with_cache

HACK_CLUB_EVENTS_URL = "https://hackathons.hackclub.com/api/events/upcoming"
DEVFOLIO_HACKATHONS_URL = "https://api.devfolio.co/api/hackathons"
UNSTOP_HACKATHONS_URL = "https://unstop.com/api/public/opportunity/search-result"
HACKATHON_SOURCE_LABEL = "Devfolio + Unstop + Hack Club India"
HACKATHON_CACHE_KEY = "india_multi_source_v1"
HACKATHON_CACHE_TTL_HOURS = 6
HACKATHON_TIMEOUT_SECONDS = 10.0
INDIA_HINTS = {
    "india", "in", "ind", "bharat", "mumbai", "delhi", "bengaluru", "bangalore",
    "hyderabad", "pune", "chennai", "kolkata", "ahmedabad", "jaipur", "navi mumbai",
    "noida", "gurugram", "gurgaon", "maharashtra", "karnataka", "tamil nadu", "telangana",
    "uttar pradesh", "gujarat", "rajasthan", "kerala", "punjab", "haryana",
}


def _hackathons_collection():
    return get_mongo_db()["hackathons_cache"]


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _india_text_match(*values: Any) -> bool:
    text = " ".join(str(value or "") for value in values).lower()
    return any(hint in text for hint in INDIA_HINTS)


def _format_location(event: dict[str, Any]) -> tuple[str, bool]:
    virtual = bool(event.get("virtual") or event.get("online") or event.get("isOnline") or event.get("is_online"))
    raw_location = event.get("location") or event.get("address") or event.get("city") or ""
    if isinstance(raw_location, dict):
        city = raw_location.get("city") or ""
        state = raw_location.get("state") or raw_location.get("region") or ""
        country = raw_location.get("country") or ""
        if isinstance(country, dict):
            country = country.get("name") or country.get("iso") or ""
        location = ", ".join(part for part in [city, state, country] if part)
    else:
        location = str(raw_location).strip()

    if not location:
        location = "Online" if virtual else "Location TBA"
    return location, virtual or location.lower() == "online"


def _event_text(event: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in [
        "name", "title", "description", "details", "desc", "summary", "tagline", "rules",
        "prize", "team", "teamSize", "team_size", "maxTeamSize", "max_team_size",
    ]:
        value = event.get(key)
        if isinstance(value, (str, int, float)):
            parts.append(_strip_html(str(value)))
    return " ".join(parts).lower()


def _duration(start_dt: datetime | None, end_dt: datetime | None) -> tuple[int | None, int | None]:
    if not start_dt or not end_dt:
        return None, None
    hours = max(1, ceil((end_dt - start_dt).total_seconds() / 3600))
    return hours, max(1, ceil(hours / 24))


def _duration_from_text(text: str) -> tuple[int | None, int | None]:
    normalized = text.lower()
    day_match = re.search(r"(?:no\.\s*of\s*days|duration)\s*:?\s*(\d+)\s*days?", normalized)
    if not day_match:
        day_match = re.search(r"(\d+)\s*(?:-|to)?\s*(\d+)?\s*days?", normalized)
    if day_match:
        days = int(day_match.group(2) or day_match.group(1)) if day_match.lastindex and day_match.lastindex >= 2 else int(day_match.group(1))
        return days * 24, days
    hour_match = re.search(r"(\d+)\s*(?:-|to)?\s*(\d+)?\s*(?:hours?|hrs?)", normalized)
    if hour_match:
        hours = int(hour_match.group(2) or hour_match.group(1))
        return hours, max(1, ceil(hours / 24))
    return None, None


def _first_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    match = re.search(r"\d+", str(value))
    return int(match.group(0)) if match else None


def _team_size(event: dict[str, Any]) -> tuple[int | None, int | None]:
    min_candidates = ["minTeamSize", "min_team_size", "minimumTeamSize", "team_min", "team_size_min"]
    max_candidates = ["maxTeamSize", "max_team_size", "maximumTeamSize", "team_size", "teamSize", "team_size_max"]
    team_min = next((value for key in min_candidates if (value := _first_int(event.get(key))) is not None), None)
    team_max = next((value for key in max_candidates if (value := _first_int(event.get(key))) is not None), None)

    text = _event_text(event)
    range_match = re.search(r"(?:members?\s*count|teams?|groups?)\s*(?:of|size|count)?\s*:?\s*(\d+)\s*(?:-|–|to)\s*(\d+)", text)
    up_to_match = re.search(r"(?:teams?|groups?)\s*(?:of|up to|upto|maximum|max)?\s*(\d+)", text)
    if range_match:
        team_min = team_min or int(range_match.group(1))
        team_max = team_max or int(range_match.group(2))
    elif up_to_match:
        team_max = team_max or int(up_to_match.group(1))

    if team_min and team_max and team_min > team_max:
        team_min, team_max = team_max, team_min
    return team_min, team_max


def _theme_labels(raw_tags: Any) -> list[str]:
    labels: list[str] = []
    if isinstance(raw_tags, list):
        for tag in raw_tags:
            if isinstance(tag, dict):
                label = tag.get("name") or tag.get("title") or tag.get("label") or tag.get("file_name")
            else:
                label = tag
            if label and str(label).strip():
                labels.append(str(label).strip())
    return labels


def _themes(event: dict[str, Any], is_online: bool, source_tag: str = "") -> list[str]:
    themes = _theme_labels(event.get("tags")) + _theme_labels(event.get("themes")) + _theme_labels(event.get("categories"))
    if source_tag:
        themes.append(source_tag)
    themes.extend(["India", "Online" if is_online else "Offline", "Student", "Build"])
    deduped: list[str] = []
    for theme in themes:
        if theme and theme not in deduped:
            deduped.append(theme)
    return deduped[:6]


def _teammate_prefill(title: str, location: str, start_date: str, url: str, team_max: int | None, themes: list[str]) -> dict[str, Any] | None:
    if not team_max or team_max <= 2:
        return None
    tags = ["Hackathon", "Team", "India"] + themes[:4]
    return {
        "title": f"Need teammates for {title}",
        "body": (
            f"I want to join {title}. It starts on {start_date or 'TBA'} and is listed for {location}. "
            f"Team size supports up to {team_max} members, so I am looking for teammates from Nirmaan. "
            f"Hackathon link: {url}"
        ),
        "tags": list(dict.fromkeys(tags))[:8],
    }


def _status(start_dt: datetime | None, end_dt: datetime | None, fallback_open: bool = False) -> str:
    now = datetime.now(timezone.utc)
    if start_dt and start_dt <= now and (not end_dt or end_dt >= now):
        return "open"
    return "open" if fallback_open else "upcoming"


def _normalize_hackclub_hackathon(event: dict[str, Any]) -> dict[str, Any] | None:
    country = event.get("country") or event.get("countryCode") or ""
    location_probe = " ".join(str(event.get(key) or "") for key in ["city", "state", "country", "countryCode", "location"])
    if not _india_text_match(country, location_probe):
        return None

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
    themes = _themes(event, is_online, "Hack Club")
    start_date = start_dt.isoformat() if start_dt else ""

    return {
        "id": f"hackclub-{event_id or name.lower().replace(' ', '-')}",
        "title": name,
        "organizer": str(event.get("organizer") or "Hack Club"),
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
        "source": "Hack Club India",
        "status": _status(start_dt, end_dt),
        "themes": themes,
        "logo_url": event.get("logo") or "",
        "banner_url": event.get("banner") or "",
    }


def _normalize_devfolio_hackathon(event: dict[str, Any]) -> dict[str, Any] | None:
    event_id = str(event.get("uuid") or event.get("slug") or "").strip()
    name = str(event.get("name") or "").strip()
    slug = str(event.get("slug") or "").strip()
    website = str(event.get("uri") or "").strip() or (f"https://{slug}.devfolio.co" if slug else "")
    if not name or not website:
        return None

    start_dt = _parse_date(event.get("starts_at"))
    end_dt = _parse_date(event.get("ends_at"))
    duration_hours, duration_days = _duration(start_dt, end_dt)
    is_online = bool(event.get("is_online") or event.get("apply_mode") == "online")
    city = event.get("city") or ""
    state = event.get("state") or ""
    country = event.get("country") or ""
    location = ", ".join(str(part) for part in [city, state, country] if part) or ("Online" if is_online else "India")
    team_min, team_max = _team_size(event)
    themes = _themes(event, is_online, "Devfolio")
    start_date = start_dt.isoformat() if start_dt else ""

    return {
        "id": f"devfolio-{event_id or slug}",
        "title": name,
        "organizer": "Devfolio",
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
        "source": "Devfolio",
        "status": _status(start_dt, end_dt, fallback_open=event.get("status") == "publish"),
        "themes": themes,
        "logo_url": event.get("favicon") or "",
        "banner_url": event.get("cover_img") or "",
    }


def _unstop_location(event: dict[str, Any], is_online: bool) -> str:
    address = event.get("address_with_country_logo") or {}
    if isinstance(address, dict):
        country = address.get("country") or {}
        country_name = country.get("name") if isinstance(country, dict) else country
        location = ", ".join(str(part) for part in [address.get("city"), address.get("state"), country_name] if part)
        if location:
            return location
    locations = event.get("locations") or []
    if isinstance(locations, list) and locations:
        labels = []
        for location in locations[:2]:
            if isinstance(location, dict):
                labels.append(str(location.get("name") or location.get("city") or location.get("address") or "").strip())
            else:
                labels.append(str(location).strip())
        joined = ", ".join(label for label in labels if label)
        if joined:
            return joined
    return "Online" if is_online else "India"


def _normalize_unstop_hackathon(event: dict[str, Any]) -> dict[str, Any] | None:
    event_id = str(event.get("id") or event.get("short_id") or "").strip()
    name = str(event.get("title") or "").strip()
    url = str(event.get("seo_url") or event.get("short_url") or "").strip()
    if not url and event.get("public_url"):
        url = f"https://unstop.com/{str(event['public_url']).lstrip('/')}"
    if not name or not url:
        return None

    details_text = _strip_html(event.get("details") or "")
    req = event.get("regnRequirements") or {}
    start_dt = _parse_date(req.get("start_regn_dt") or event.get("approved_date") or event.get("updated_at"))
    end_dt = _parse_date(event.get("end_date") or req.get("end_regn_dt"))
    duration_hours, duration_days = _duration_from_text(details_text)
    if duration_hours is None:
        duration_hours, duration_days = _duration(start_dt, end_dt)
    is_online = str(event.get("region") or "").lower() == "online"
    location = _unstop_location(event, is_online)
    team_min = _first_int(req.get("min_team_size"))
    team_max = _first_int(req.get("max_team_size"))
    fallback_min, fallback_max = _team_size({**event, "details": details_text})
    team_min = team_min or fallback_min
    team_max = team_max or fallback_max
    themes = _themes({"tags": (event.get("tags") or []) + (event.get("filters") or []) + (event.get("required_skills") or [])}, is_online, "Unstop")
    start_date = start_dt.isoformat() if start_dt else ""

    return {
        "id": f"unstop-{event_id or name.lower().replace(' ', '-')}",
        "title": name,
        "organizer": (event.get("organisation") or {}).get("name") if isinstance(event.get("organisation"), dict) else "Unstop",
        "location": location,
        "is_online": is_online,
        "start_date": start_date,
        "end_date": end_dt.isoformat() if end_dt else "",
        "duration_hours": duration_hours,
        "duration_days": duration_days,
        "team_size_min": team_min,
        "team_size_max": team_max,
        "team_required": bool(team_max and team_max > 1),
        "teammate_prefill": _teammate_prefill(name, location, start_date, url, team_max, themes),
        "url": url,
        "source": "Unstop India",
        "status": _status(start_dt, end_dt, fallback_open=bool(event.get("regn_open"))),
        "themes": themes,
        "logo_url": event.get("logoUrl2") or "",
        "banner_url": event.get("thumb") or "",
    }


async def _fetch_hackclub(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await client.get(HACK_CLUB_EVENTS_URL, headers={"User-Agent": "Nirmaan Discovery Hub/1.0"})
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return []
    return [item for event in payload if isinstance(event, dict) and (item := _normalize_hackclub_hackathon(event))]


async def _fetch_devfolio(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for filter_name in ["live", "application_open", "upcoming", "all"]:
        response = await client.get(DEVFOLIO_HACKATHONS_URL, params={"page": 1, "filter": filter_name})
        if response.status_code >= 400:
            continue
        payload = response.json()
        events = payload.get("result", []) if isinstance(payload, dict) else []
        for event in events:
            if not isinstance(event, dict):
                continue
            normalized = _normalize_devfolio_hackathon(event)
            if normalized and normalized["id"] not in seen:
                seen.add(normalized["id"])
                items.append(normalized)
    return items


async def _fetch_unstop(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await client.get(
        UNSTOP_HACKATHONS_URL,
        params={"opportunity": "hackathons", "location": "india", "page": 1, "per_page": 30},
    )
    response.raise_for_status()
    payload = response.json()
    events = ((payload.get("data") or {}).get("data") or []) if isinstance(payload, dict) else []
    return [item for event in events if isinstance(event, dict) and (item := _normalize_unstop_hackathon(event))]


def _dedupe_hackathons(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        key = "|".join([
            str(item.get("title", "")).lower().strip(),
            str(item.get("start_date", ""))[:10],
            str(item.get("location", "")).lower().strip(),
        ])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


async def fetch_hackathons_from_internet(limit: int = 36, force_refresh: bool = False) -> dict[str, Any]:
    """Fetch India-first hackathons from Devfolio, Unstop and India-filtered Hack Club, then cache them."""
    cache_col = _hackathons_collection()
    now = datetime.now(timezone.utc)

    if not force_refresh:
        cached = await cache_col.find_one({"source": HACKATHON_CACHE_KEY})
        if cached:
            fetched_at = cached.get("fetched_at")
            if isinstance(fetched_at, datetime):
                age_hours = (now - fetched_at).total_seconds() / 3600
                if age_hours < HACKATHON_CACHE_TTL_HOURS:
                    return {
                        "hackathons": cached.get("results", [])[:limit],
                        "cached": True,
                        "cache_age_hours": round(age_hours, 1),
                        "source": HACKATHON_SOURCE_LABEL,
                    }

    async with httpx.AsyncClient(
        timeout=HACKATHON_TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 Nirmaan Discovery Hub", "Accept": "application/json"},
    ) as client:
        source_results = await asyncio.gather(
            _fetch_devfolio(client),
            _fetch_unstop(client),
            _fetch_hackclub(client),
            return_exceptions=True,
        )

    normalized: list[dict[str, Any]] = []
    source_errors: list[str] = []
    for result in source_results:
        if isinstance(result, Exception):
            source_errors.append(str(result))
        else:
            normalized.extend(result)

    normalized = _dedupe_hackathons(normalized)
    normalized.sort(key=lambda event: event.get("start_date") or event.get("end_date") or "9999")
    normalized = normalized[:limit]

    await cache_col.update_one(
        {"source": HACKATHON_CACHE_KEY},
        {"$set": {"source": HACKATHON_CACHE_KEY, "results": normalized, "source_errors": source_errors, "fetched_at": now}},
        upsert=True,
    )

    return {
        "hackathons": normalized,
        "cached": False,
        "cache_age_hours": 0,
        "source": HACKATHON_SOURCE_LABEL,
        "source_errors": source_errors,
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
            "source": result.get("source", HACKATHON_SOURCE_LABEL),
            "cached": result.get("cached", False),
            "cache_age_hours": result.get("cache_age_hours", 0),
            "total": len(hackathons),
        },
    }


async def get_discovery_hub(user_id: str, force_refresh: bool = False) -> dict[str, Any]:
    """Fetch internet-backed internships and India-first hackathons for the Discovery Hub."""
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

    hackathon_result = {"hackathons": [], "cached": False, "cache_age_hours": 0, "source": HACKATHON_SOURCE_LABEL}
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
            "source": hackathon_result.get("source", HACKATHON_SOURCE_LABEL),
            "cached": hackathon_result.get("cached", False),
            "cache_age_hours": hackathon_result.get("cache_age_hours", 0),
            "total": len(hackathon_result.get("hackathons", [])),
        },
        "hackathons_error": hackathons_error,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

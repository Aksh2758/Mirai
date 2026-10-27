import asyncio
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from math import ceil
from typing import Any

import httpx

from db.mongo_client import get_mongo_db
from services.jobs_service import get_jobs_with_cache

HACK_CLUB_EVENTS_URL = "https://hackathons.hackclub.com/api/events/upcoming"
DEVFOLIO_HACKATHONS_URL = "https://api.devfolio.co/api/hackathons"
UNSTOP_HACKATHONS_URL = "https://unstop.com/api/public/opportunity/search-result"
DEVPOST_URL = "https://devpost.com/api/hackathons"
HACKEREARTH_URL = "https://www.hackerearth.com/chrome-extension/events/"
HACKATHON_SOURCE_LABEL = "Devfolio + Unstop + Devpost + HackerEarth + Hack Club"
HACKATHON_CACHE_KEY = "india_multi_source_v2"   # new key: old cache (full of past events) is ignored
MAX_HACKATHONS = 60
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
    # word-boundary match: plain substring made "in" match "Berlin"/"Singapore"
    return any(re.search(r"(?<![a-z])" + re.escape(hint) + r"(?![a-z])", text) for hint in INDIA_HINTS)


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
    if end_dt and end_dt < now:
        return "ended"
    if start_dt and start_dt <= now and (not end_dt or end_dt >= now):
        return "open"
    return "open" if fallback_open else "upcoming"


def is_hackathon_current(item: dict[str, Any], now: datetime | None = None) -> bool:
    """True only for events that have not finished. Used both when fetching and when reading the
    cache, so a past event can never be shown even if it was cached earlier."""
    now = now or datetime.now(timezone.utc)
    if item.get("status") == "ended":
        return False
    end_dt = _parse_date(item.get("end_date"))
    if end_dt:
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=timezone.utc)
        return end_dt >= now
    start_dt = _parse_date(item.get("start_date"))
    if start_dt:
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        return start_dt >= now - timedelta(days=3)
    return True  # no dates at all: keep (the source said it is live)


def _sort_key(item: dict[str, Any]) -> tuple:
    """Ongoing first, then soonest upcoming."""
    start = item.get("start_date") or item.get("end_date") or "9999"
    return (0 if item.get("status") == "open" else 1, start)


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
    start_dt = _parse_date(event.get("start_date") or req.get("start_regn_dt") or event.get("approved_date"))
    end_dt = _parse_date(event.get("end_date") or req.get("end_regn_dt"))
    regn_end = _parse_date(req.get("end_regn_dt"))
    if regn_end and not event.get("end_date") and regn_end < datetime.now(timezone.utc):
        end_dt = regn_end   # registration closed and no event end known: treat as finished
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
    # "all" is deliberately NOT used: it returns years of finished events.
    for filter_name in ["live", "application_open", "upcoming"]:
        for page in (1, 2, 3):
            response = await client.get(DEVFOLIO_HACKATHONS_URL, params={"page": page, "filter": filter_name})
            if response.status_code >= 400:
                break
            payload = response.json()
            events = payload.get("result", []) if isinstance(payload, dict) else []
            if not events:
                break
            for event in events:
                if not isinstance(event, dict):
                    continue
                normalized = _normalize_devfolio_hackathon(event)
                if normalized and normalized["id"] not in seen:
                    seen.add(normalized["id"])
                    items.append(normalized)
    return items


async def _fetch_unstop(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for page in (1, 2, 3):
        response = await client.get(
            UNSTOP_HACKATHONS_URL,
            params={"opportunity": "hackathons", "oppstatus": "open", "page": page, "per_page": 30},
        )
        response.raise_for_status()
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        events = (data.get("data") if isinstance(data, dict) else data) or []
        if not events:
            break
        out += [item for event in events if isinstance(event, dict) and (item := _normalize_unstop_hackathon(event))]
    return out


_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _parse_devpost_range(text: str) -> tuple[datetime | None, datetime | None]:
    """Devpost gives dates as text: 'Oct 01 - Dec 15, 2026', 'Oct 20 - 22, 2026', 'Dec 30, 2026 - Jan 02, 2027'."""
    t = (text or "").replace(",", " ")
    tokens = re.findall(r"[A-Za-z]{3,9}|\d{1,4}", t)
    # walk tokens building (month, day, year?) triples
    dates: list[list[int | None]] = []
    month = None
    for tok in tokens:
        if tok[:3].lower() in _MONTHS and not tok.isdigit():
            month = _MONTHS[tok[:3].lower()]
            dates.append([month, None, None])
        elif tok.isdigit():
            n = int(tok)
            if n > 1900 and dates:
                dates[-1][2] = n
            elif dates and dates[-1][1] is None:
                dates[-1][1] = n
            elif month is not None:  # second day in "Oct 20 - 22"
                dates.append([month, n, None])
    dates = [d for d in dates if d[1]]
    if not dates:
        return None, None
    year = next((d[2] for d in reversed(dates) if d[2]), datetime.now(timezone.utc).year)
    for d in dates:
        d[2] = d[2] or year
    try:
        start = datetime(dates[0][2], dates[0][0], dates[0][1], tzinfo=timezone.utc)
        last = dates[-1]
        end = datetime(last[2], last[0], last[1], 23, 59, tzinfo=timezone.utc)
    except ValueError:
        return None, None
    if end < start:   # "Dec 30 - Jan 02, 2027": start belongs to the previous year
        start = start.replace(year=start.year - 1)
    return start, end


def _normalize_devpost(event: dict[str, Any]) -> dict[str, Any] | None:
    title = str(event.get("title") or "").strip()
    url = str(event.get("url") or "").strip()
    if not title or not url:
        return None
    loc_obj = event.get("displayed_location") or {}
    location_text = str(loc_obj.get("location") if isinstance(loc_obj, dict) else loc_obj or "").strip()
    is_online = "online" in location_text.lower()
    if not is_online and not _india_text_match(location_text):
        return None   # offline abroad: not useful for Indian students
    start_dt, end_dt = _parse_devpost_range(str(event.get("submission_period_dates") or ""))
    themes = _themes({"themes": event.get("themes")}, is_online, "Devpost")
    hours, days = _duration(start_dt, end_dt)
    start_date = start_dt.isoformat() if start_dt else ""
    thumb = str(event.get("thumbnail_url") or "")
    if thumb.startswith("//"):
        thumb = "https:" + thumb
    return {
        "id": f"devpost-{event.get('id') or title.lower().replace(' ', '-')}",
        "title": title,
        "organizer": str(event.get("organization_name") or "Devpost"),
        "location": "Online" if is_online else location_text,
        "is_online": is_online,
        "start_date": start_date,
        "end_date": end_dt.isoformat() if end_dt else "",
        "duration_hours": hours,
        "duration_days": days,
        "team_size_min": None,
        "team_size_max": None,
        "team_required": False,
        "teammate_prefill": None,
        "url": url,
        "source": "Devpost",
        "status": _status(start_dt, end_dt, fallback_open=event.get("open_state") == "open"),
        "themes": themes,
        "logo_url": "",
        "banner_url": thumb,
    }


async def _fetch_devpost(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for page in (1, 2, 3):
        response = await client.get(
            DEVPOST_URL,
            params=[("status[]", "open"), ("status[]", "upcoming"), ("order_by", "deadline"), ("page", page)],
        )
        response.raise_for_status()
        payload = response.json()
        events = payload.get("hackathons", []) if isinstance(payload, dict) else []
        if not events:
            break
        out += [item for event in events if isinstance(event, dict) and (item := _normalize_devpost(event))]
    return out


def _normalize_hackerearth(event: dict[str, Any]) -> dict[str, Any] | None:
    if str(event.get("challenge_type") or "").lower() not in {"hackathon", "hackathons"}:
        return None
    title = str(event.get("title") or "").strip()
    url = str(event.get("url") or "").strip()
    if not title or not url:
        return None
    start_dt = _parse_date(event.get("start_utc_tz") or event.get("start_timestamp"))
    end_dt = _parse_date(event.get("end_utc_tz") or event.get("end_timestamp"))
    hours, days = _duration(start_dt, end_dt)
    start_date = start_dt.isoformat() if start_dt else ""
    return {
        "id": f"hackerearth-{event.get('id') or title.lower().replace(' ', '-')}",
        "title": title,
        "organizer": str(event.get("college") or "HackerEarth"),
        "location": "Online",
        "is_online": True,
        "start_date": start_date,
        "end_date": end_dt.isoformat() if end_dt else "",
        "duration_hours": hours,
        "duration_days": days,
        "team_size_min": None,
        "team_size_max": None,
        "team_required": False,
        "teammate_prefill": None,
        "url": url,
        "source": "HackerEarth",
        "status": _status(start_dt, end_dt),
        "themes": _themes({}, True, "HackerEarth"),
        "logo_url": "",
        "banner_url": str(event.get("cover_image") or event.get("banner") or ""),
    }


async def _fetch_hackerearth(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    response = await client.get(HACKEREARTH_URL)
    response.raise_for_status()
    payload = response.json()
    events = payload.get("response", []) if isinstance(payload, dict) else []
    return [item for event in events if isinstance(event, dict) and (item := _normalize_hackerearth(event))]


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


_SOURCE_NAMES = ["Devfolio", "Unstop", "Devpost", "HackerEarth", "Hack Club"]


async def fetch_hackathons_from_internet(limit: int = MAX_HACKATHONS, force_refresh: bool = False) -> dict[str, Any]:
    """Fetch hackathons from five sources, drop finished ones, cache them in MongoDB.
    Past events are filtered again on every read, so they cannot appear even from an old cache."""
    cache_col = _hackathons_collection()
    now = datetime.now(timezone.utc)

    if not force_refresh:
        cached = await cache_col.find_one({"source": HACKATHON_CACHE_KEY})
        if cached:
            fetched_at = cached.get("fetched_at")
            if isinstance(fetched_at, datetime):
                if fetched_at.tzinfo is None:
                    fetched_at = fetched_at.replace(tzinfo=timezone.utc)
                age_hours = (now - fetched_at).total_seconds() / 3600
                live = [h for h in cached.get("results", []) if is_hackathon_current(h, now)]
                if age_hours < HACKATHON_CACHE_TTL_HOURS and live:
                    return {
                        "hackathons": live[:limit],
                        "cached": True,
                        "cache_age_hours": round(age_hours, 1),
                        "source": HACKATHON_SOURCE_LABEL,
                        "source_report": cached.get("source_report", []),
                    }

    async with httpx.AsyncClient(
        timeout=HACKATHON_TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 Nirmaan Discovery Hub", "Accept": "application/json"},
    ) as client:
        source_results = await asyncio.gather(
            _fetch_devfolio(client),
            _fetch_unstop(client),
            _fetch_devpost(client),
            _fetch_hackerearth(client),
            _fetch_hackclub(client),
            return_exceptions=True,
        )

    normalized: list[dict[str, Any]] = []
    source_errors: list[str] = []
    source_report: list[dict[str, Any]] = []
    for name, result in zip(_SOURCE_NAMES, source_results):
        if isinstance(result, Exception):
            source_errors.append(f"{name}: {result!r}")
            source_report.append({"source": name, "ok": False, "fetched": 0, "upcoming_or_live": 0, "error": repr(result)[:300]})
            continue
        current = [h for h in result if is_hackathon_current(h, now)]
        source_report.append({"source": name, "ok": True, "fetched": len(result), "upcoming_or_live": len(current), "error": None})
        normalized.extend(current)

    normalized = _dedupe_hackathons(normalized)
    normalized.sort(key=_sort_key)
    normalized = normalized[:MAX_HACKATHONS]

    if normalized or not force_refresh:
        await cache_col.update_one(
            {"source": HACKATHON_CACHE_KEY},
            {"$set": {"source": HACKATHON_CACHE_KEY, "results": normalized, "source_errors": source_errors,
                      "source_report": source_report, "fetched_at": now}},
            upsert=True,
        )

    return {
        "hackathons": normalized[:limit],
        "cached": False,
        "cache_age_hours": 0,
        "source": HACKATHON_SOURCE_LABEL,
        "source_errors": source_errors,
        "source_report": source_report,
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
            "source_report": result.get("source_report", []),
        },
    }


async def get_discovery_hub(user_id: str, force_refresh: bool = False) -> dict[str, Any]:
    """Fetch internet-backed internships and India-first hackathons for the Discovery Hub."""
    internships = []
    internship_meta = {"role_searched": "", "cached": False, "cache_age_hours": 0, "total": 0}
    internships_error = None

    try:
        jobs_result = await get_jobs_with_cache(user_id, force_refresh=force_refresh)
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
            "source_report": hackathon_result.get("source_report", []),
        },
        "hackathons_error": hackathons_error,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
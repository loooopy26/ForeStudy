"""Google Routes API client for public-transit routes.

The endpoint is intentionally server-side only: Google Maps API keys must not
be exposed to the browser.  It returns the same route shape used by the
location router so TMAP walk/car routes and Google transit routes can coexist.
"""

import logging
import re

import httpx

from config import settings

logger = logging.getLogger(__name__)

_COMPUTE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
_TIMEOUT = httpx.Timeout(20.0, connect=5.0)
_FIELD_MASK = ",".join(
    [
        "routes.duration",
        "routes.distanceMeters",
        "routes.legs.steps.travelMode",
        "routes.legs.steps.staticDuration",
        "routes.legs.steps.transitDetails",
    ]
)


class GoogleRoutesError(Exception):
    """Google Routes API could not provide a usable transit route."""


def _duration_seconds(value: str | None) -> float | None:
    """Convert Google protobuf JSON durations such as ``\"123.4s\"``."""
    if not value or not isinstance(value, str):
        return None
    match = re.fullmatch(r"(-?\d+(?:\.\d+)?)s", value)
    return float(match.group(1)) if match else None


def _location(latitude: float, longitude: float) -> dict:
    return {"location": {"latLng": {"latitude": latitude, "longitude": longitude}}}


async def get_transit_route(origin: dict, destination: dict) -> dict:
    """Return the recommended Google public-transit route for two WGS84 points."""
    if not settings.google_maps_api_key:
        raise GoogleRoutesError("GOOGLE_MAPS_API_KEY is not configured")

    payload = {
        "origin": _location(origin["latitude"], origin["longitude"]),
        "destination": _location(destination["latitude"], destination["longitude"]),
        "travelMode": "TRANSIT",
        "languageCode": "ko",
        "units": "METRIC",
        "computeAlternativeRoutes": False,
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_maps_api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(_COMPUTE_ROUTES_URL, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise GoogleRoutesError("Google Routes API timed out") from exc
    except httpx.HTTPError as exc:
        raise GoogleRoutesError(f"Google Routes API request failed: {exc}") from exc

    if response.status_code >= 400:
        logger.error("Google Routes API error %s: %s", response.status_code, response.text[:500])
        raise GoogleRoutesError(f"Google Routes API returned HTTP {response.status_code}")

    try:
        data = response.json()
    except ValueError as exc:
        raise GoogleRoutesError("Google Routes API returned invalid JSON") from exc

    routes = data.get("routes") or []
    if not routes:
        raise GoogleRoutesError("Google Routes API found no public-transit route")

    route = routes[0]
    seconds = _duration_seconds(route.get("duration"))
    if seconds is None:
        raise GoogleRoutesError("Google Routes API route did not include a duration")

    distance = route.get("distanceMeters")
    return {
        "distance_meters": int(round(distance)) if distance is not None else None,
        "duration_minutes": round(seconds / 60, 1),
        "raw": data,
        "provider": "google_routes",
    }

"""TMAP API 클라이언트 (POI 검색 / Geocoding / 경로 안내).

- POI 검색:    GET  {base}/tmap/pois
- Geocoding:   GET  {base}/tmap/geo/fullAddrGeo
- 자동차 경로:  POST {base}/tmap/routes
- 보행자 경로:  POST {base}/tmap/routes/pedestrian
- 대중교통 경로: POST {base}/transit/routes  (다른 API들과 달리 /tmap 프리픽스가 없다)

TMAP_APP_KEY가 없으면 TmapConfigError를 던진다 — routers/location.py에서 503으로 변환한다.
"""

import asyncio
import logging
import math

import httpx

from config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_WGS84 = "WGS84GEO"

# TMAP 게이트웨이는 앱 키당 동시/초당 호출 수를 제한한다. 주변 학습장소 추천처럼 한 요청
# 안에서 장소마다 여러 번(모드별) 호출을 한꺼번에 쏘면(실측: 20곳 x 3모드 = 60건 동시 호출
# 시 응답이 30초 넘게 지연) 게이트웨이가 요청을 붙들었다가 한꺼번에 풀어주는 현상이 생긴다.
# 모든 TMAP 호출이 공유하는 세마포어로 실제 동시 호출 수를 낮게 유지한다.
_REQUEST_SEMAPHORE = asyncio.Semaphore(3)


class TmapConfigError(Exception):
    """TMAP_APP_KEY가 설정되지 않았을 때."""


class TmapTimeoutError(Exception):
    """TMAP API 호출이 타임아웃되었을 때."""


class TmapRequestError(Exception):
    """TMAP API가 에러를 응답했거나 예상한 형식이 아닐 때."""


def _require_app_key() -> str:
    if not settings.tmap_app_key:
        raise TmapConfigError(
            "TMAP_APP_KEY가 설정되지 않았습니다. backend/.env에 값을 넣어주세요 (.env.example 참고)."
        )
    return settings.tmap_app_key


def _headers() -> dict:
    return {"appKey": _require_app_key(), "Accept": "application/json"}


def _to_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def _request(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> dict:
    try:
        async with _REQUEST_SEMAPHORE:
            resp = await client.request(method, url, **kwargs)
    except httpx.TimeoutException as exc:
        raise TmapTimeoutError(f"TMAP API 응답 시간 초과: {url}") from exc
    except httpx.HTTPError as exc:
        logger.exception("TMAP API 호출 실패: %s", url)
        raise TmapRequestError(f"TMAP API 호출 실패: {exc}") from exc

    if resp.status_code >= 400:
        logger.error("TMAP API 오류 응답 %s %s: %s", resp.status_code, url, resp.text[:500])
        raise TmapRequestError(
            f"TMAP API가 {resp.status_code} 응답을 반환했습니다: {resp.text[:300]}"
        )
    try:
        return resp.json()
    except ValueError as exc:
        raise TmapRequestError(f"TMAP API 응답을 JSON으로 해석하지 못했습니다: {url}") from exc


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 좌표 사이의 직선 거리(m). TMAP 경로 API가 실패했을 때의 정렬/근사용."""
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


async def search_pois(
    keyword: str, latitude: float, longitude: float, radius_meters: int, *, count: int = 20
) -> list[dict]:
    """키워드로 장소를 검색한다. 표준 형태 리스트를 반환한다:
    [{id, name, category, address, latitude, longitude}]"""
    radius_km = max(1, min(20, round(radius_meters / 1000)))
    params = {
        "version": "1",
        "searchKeyword": keyword,
        "resCoordType": _WGS84,
        "reqCoordType": _WGS84,
        "count": count,
        "centerLon": longitude,
        "centerLat": latitude,
        "radius": radius_km,
        "page": 1,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _request(
            client, "GET", f"{settings.tmap_base_url}/tmap/pois", headers=_headers(), params=params
        )

    poi_list = (((data.get("searchPoiInfo") or {}).get("pois") or {}).get("poi")) or []
    if isinstance(poi_list, dict):
        poi_list = [poi_list]

    results = []
    for poi in poi_list:
        lat = _to_float(poi.get("frontLat") or poi.get("noorLat"))
        lon = _to_float(poi.get("frontLon") or poi.get("noorLon"))
        if lat is None or lon is None:
            continue
        address = " ".join(
            part
            for part in (
                poi.get("upperAddrName"),
                poi.get("middleAddrName"),
                poi.get("lowerAddrName"),
                poi.get("detailAddrName"),
            )
            if part
        ).strip()
        category = poi.get("lowerBizName") or poi.get("middleBizName") or poi.get("upperBizName") or keyword
        name = poi.get("name") or "이름 미상"
        results.append(
            {
                "id": str(poi.get("id") or f"{name}-{lat:.6f}-{lon:.6f}"),
                "name": name,
                "category": category,
                "address": address or None,
                "latitude": lat,
                "longitude": lon,
            }
        )
    return results


async def geocode_address(address: str) -> dict:
    """주소를 좌표로 변환한다. 응답은 coordinateInfo.coordinate[0]에 좌표가 들어있고,
    도로명 주소로 매칭되면 newLat/newLon에, 지번 주소로 매칭되면 lat/lon에 값이 채워진다
    (실제 응답으로 확인함 — 문서상 필드명과 실제 위치가 달랐다).
    반환: {latitude, longitude}. 매칭 실패 시 TmapRequestError."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _request(
            client,
            "GET",
            f"{settings.tmap_base_url}/tmap/geo/fullAddrGeo",
            headers=_headers(),
            params={"version": "1", "fullAddr": address, "coordType": _WGS84, "addressFlag": "F00"},
        )

    coordinates = ((data.get("coordinateInfo") or {}).get("coordinate")) or []
    if isinstance(coordinates, dict):
        coordinates = [coordinates]
    for entry in coordinates:
        lat = _to_float(entry.get("newLat") or entry.get("lat"))
        lon = _to_float(entry.get("newLon") or entry.get("lon"))
        if lat is not None and lon is not None:
            return {"latitude": lat, "longitude": lon}

    raise TmapRequestError(f"주소를 좌표로 변환하지 못했습니다: {address}")


def _first_route_properties(data: dict) -> dict:
    for feature in data.get("features") or []:
        props = feature.get("properties") or {}
        if props.get("totalDistance") is not None or props.get("totalTime") is not None:
            return props
    return {}


def _standard_route(distance_meters, duration_seconds, raw: dict) -> dict:
    return {
        "distance_meters": int(round(distance_meters)) if distance_meters is not None else None,
        "duration_minutes": round(duration_seconds / 60, 1) if duration_seconds is not None else None,
        "raw": raw,
    }


async def get_car_route(origin: dict, destination: dict) -> dict:
    body = {
        "startX": origin["longitude"],
        "startY": origin["latitude"],
        "endX": destination["longitude"],
        "endY": destination["latitude"],
        "reqCoordType": _WGS84,
        "resCoordType": _WGS84,
        "startName": "출발지",
        "endName": "도착지",
        "searchOption": "0",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _request(
            client,
            "POST",
            f"{settings.tmap_base_url}/tmap/routes",
            headers={**_headers(), "Content-Type": "application/json"},
            params={"version": "1"},
            json=body,
        )
    props = _first_route_properties(data)
    if not props:
        raise TmapRequestError("자동차 경로를 찾지 못했습니다.")
    return _standard_route(props.get("totalDistance"), props.get("totalTime"), data)


async def get_walk_route(origin: dict, destination: dict) -> dict:
    body = {
        "startX": origin["longitude"],
        "startY": origin["latitude"],
        "endX": destination["longitude"],
        "endY": destination["latitude"],
        "startName": "출발지",
        "endName": "도착지",
        "reqCoordType": _WGS84,
        "resCoordType": _WGS84,
        "searchOption": "0",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _request(
            client,
            "POST",
            f"{settings.tmap_base_url}/tmap/routes/pedestrian",
            headers={**_headers(), "Content-Type": "application/json"},
            params={"version": "1"},
            json=body,
        )
    props = _first_route_properties(data)
    if not props:
        raise TmapRequestError("보행자 경로를 찾지 못했습니다.")
    return _standard_route(props.get("totalDistance"), props.get("totalTime"), data)


async def get_transit_route(origin: dict, destination: dict) -> dict:
    body = {
        "startX": str(origin["longitude"]),
        "startY": str(origin["latitude"]),
        "endX": str(destination["longitude"]),
        "endY": str(destination["latitude"]),
        "lang": 0,
        "format": "json",
        "count": 1,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _request(
            client,
            "POST",
            f"{settings.tmap_base_url}/transit/routes",
            headers={**_headers(), "Content-Type": "application/json"},
            json=body,
        )
    itineraries = (((data.get("metaData") or {}).get("plan") or {}).get("itineraries")) or []
    if not itineraries:
        raise TmapRequestError("대중교통 경로를 찾지 못했습니다.")
    itinerary = itineraries[0]
    return _standard_route(itinerary.get("totalDistance"), itinerary.get("totalTime"), data)


_MODE_FUNCS = {"walk": get_walk_route, "car": get_car_route, "transit": get_transit_route}


async def get_routes_for_modes(origin: dict, destination: dict, modes: list[str]) -> dict:
    """요청한 이동수단별로 경로를 병렬 조회한다.

    개별 모드가 실패(타임아웃/응답 에러)하면 그 모드만 None으로 채우고 나머지는 정상
    반환한다. TMAP_APP_KEY 자체가 없는 경우는 전체가 동일하게 실패하므로 TmapConfigError를
    그대로 올려 호출자가 한 번에 처리하게 한다."""
    _require_app_key()

    async def _safe(mode: str):
        func = _MODE_FUNCS.get(mode)
        if func is None:
            return mode, None
        try:
            return mode, await func(origin, destination)
        except TmapTimeoutError as exc:
            logger.warning("%s 경로 조회 타임아웃: %s", mode, exc)
            return mode, None
        except TmapRequestError as exc:
            logger.warning("%s 경로 조회 실패: %s", mode, exc)
            return mode, None

    pairs = await asyncio.gather(*[_safe(mode) for mode in modes])
    return dict(pairs)

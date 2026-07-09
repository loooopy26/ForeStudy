"""TMAP 기반 위치 기능: 주변 학습장소 추천 / 시험 당일 어시스턴트.

프론트엔드는 연결하지 않는다 (백엔드 API만). Swagger(/docs)에서 직접 테스트하거나
아래 curl 예시를 사용한다. Q-NET은 사용하지 않으며, 시험장 정보는 요청 body로 임의 입력한다.

curl -X POST http://localhost:8000/api/location/nearby-study-places \
  -H "Content-Type: application/json" \
  -d "{\"latitude\":37.5665,\"longitude\":126.9780,\"radius_meters\":3000}"

curl -X POST http://localhost:8000/api/location/nearby-study-places \
  -H "Content-Type: application/json" \
  -d "{\"latitude\":37.5665,\"longitude\":126.9780,\"query\":\"가까운 공부하기 좋은 카페 알려줘\"}"

curl -X POST http://localhost:8000/api/location/exam-day-assistant \
  -H "Content-Type: application/json" \
  -d "{\"origin\":{\"latitude\":37.5665,\"longitude\":126.9780},\"exam\":{\"certification_name\":\"정보처리기사\",\"exam_site_name\":\"서울국가자격시험장\",\"exam_site_address\":\"서울특별시 중구 세종대로 110\",\"exam_date\":\"2026-07-20\",\"exam_start_time\":\"09:00\"},\"buffer_minutes\":30}"

curl http://localhost:8000/api/location/health
"""

import asyncio
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from config import settings
from schemas import (
    DEFAULT_STUDY_PLACE_KEYWORDS,
    DEFAULT_TRANSPORT_MODES,
    ExamDayAssistantRequest,
    NearbyStudyPlacesRequest,
)
from services import tmap, upstage

router = APIRouter(prefix="/api/location", tags=["location"])
logger = logging.getLogger(__name__)

_MODE_LABELS = {"walk": "도보", "car": "자동차", "transit": "대중교통"}
_NEARBY_EXAM_KEYWORDS = {"cafes": "카페", "restaurants": "식당", "print_shops": "프린트"}
_MAX_ENRICHED_PLACES = 10
_PLACE_CONCURRENCY = 5
_DEFAULT_PREPARATION_ITEMS = ["신분증", "수험표", "필기구", "계산기 허용 여부 확인"]

# LLM이 없거나 실패했을 때 자연어 검색 요청("가까운 공부하기 좋은 카페 알려줘")에서 검색
# 키워드를 뽑아내기 위한 최소한의 규칙 기반 사전. 문자열 포함 여부로만 매칭한다.
_QUERY_KEYWORD_DICTIONARY = {
    "스터디카페": "스터디카페",
    "스터디 카페": "스터디카페",
    "카페": "카페",
    "커피": "카페",
    "대학도서관": "대학 도서관",
    "대학 도서관": "대학 도서관",
    "도서관": "도서관",
    "독서실": "독서실",
    "프린트": "프린트",
    "인쇄": "프린트",
    "출력": "프린트",
}
# upstage.chat 자체 타임아웃(240초)은 문서 요약 등 정확도가 중요한 호출 기준이라 이 기능엔
# 너무 느슨하다. 추천 문구는 없어도 rule-based로 대체 가능한 부가 정보이므로, 응답이 느리면
# 기다리지 않고 바로 fallback한다 (실측: 20곳 동시 호출 시 일부 호출이 수십 초 이상 걸림).
_LLM_REASON_TIMEOUT_SECONDS = 8.0


def _require_tmap() -> None:
    if not settings.tmap_app_key:
        raise HTTPException(
            status_code=503,
            detail="TMAP_APP_KEY가 설정되지 않았습니다. backend/.env에 값을 넣어주세요 (.env.example 참고).",
        )


@router.get("/health")
def location_health():
    return {"tmap_configured": bool(settings.tmap_app_key), "required_env": ["TMAP_APP_KEY"]}


@router.post("/nearby-study-places")
async def nearby_study_places(request: NearbyStudyPlacesRequest):
    _require_tmap()
    fallback_keywords = request.keywords or DEFAULT_STUDY_PLACE_KEYWORDS
    keywords = await _resolve_search_keywords(request.query, fallback_keywords)
    modes = request.transport_modes or DEFAULT_TRANSPORT_MODES
    origin = {"latitude": request.latitude, "longitude": request.longitude}

    keyword_results = await asyncio.gather(
        *[
            tmap.search_pois(keyword, request.latitude, request.longitude, request.radius_meters)
            for keyword in keywords
        ],
        return_exceptions=True,
    )

    places_by_id: dict[str, dict] = {}
    for keyword, result in zip(keywords, keyword_results):
        if isinstance(result, Exception):
            logger.warning("주변 학습장소 검색 실패 (keyword=%s): %s", keyword, result)
            continue
        for poi in result:
            places_by_id.setdefault(poi["id"], poi)

    # 도심 밀집 지역은 키워드 5개만으로도 POI가 수십~100개 가까이 나온다. 장소 하나당
    # 경로 조회가 모드별 최대 3회 TMAP 호출이라, 그 전부를 정교하게 계산하면 TMAP 쪽
    # 호출량 제한에 걸려 응답이 수십 초~수 분까지 늘어진다(실측: 20곳=60호출을 돌리면
    # 동시 호출 수를 낮춰도 여전히 30초 이상 걸림 — 동시성이 아니라 총 호출량 자체가
    # TMAP 쪽 요청 한도에 걸리는 것으로 보임). 그래서 직선거리 기준으로 가까운 상위
    # _MAX_ENRICHED_PLACES 곳만 정교하게(경로/추천 문구) 계산한다.
    candidates = sorted(
        places_by_id.values(),
        key=lambda poi: tmap.haversine_meters(request.latitude, request.longitude, poi["latitude"], poi["longitude"]),
    )[:_MAX_ENRICHED_PLACES]

    # TMAP 쪽 호출량 제한은 services/tmap.py의 전역 세마포어가 이미 완화한다. 여기서는
    # Upstage LLM 호출(장소당 최대 1회)이 한꺼번에 너무 많이 나가지 않도록만 제한한다.
    place_semaphore = asyncio.Semaphore(_PLACE_CONCURRENCY)

    async def _build_place(poi: dict) -> dict:
        async with place_semaphore:
            routes = await tmap.get_routes_for_modes(
                origin, {"latitude": poi["latitude"], "longitude": poi["longitude"]}, modes
            )
            reason = await _generate_place_reason(poi, routes)
        return {
            "id": poi["id"],
            "name": poi["name"],
            "category": poi["category"],
            "address": poi.get("address"),
            "latitude": poi["latitude"],
            "longitude": poi["longitude"],
            "routes": {mode: _serialize_route(info, request.debug) for mode, info in routes.items()},
            "recommendation_reason": reason,
        }

    places = await asyncio.gather(*[_build_place(poi) for poi in candidates])
    places.sort(key=lambda place: _place_sort_key(place, request.latitude, request.longitude))

    return {
        "origin": {"latitude": request.latitude, "longitude": request.longitude},
        "query": request.query,
        "resolved_keywords": keywords,
        "places": places,
    }


@router.post("/exam-day-assistant")
async def exam_day_assistant(request: ExamDayAssistantRequest):
    _require_tmap()
    modes = request.transport_modes or DEFAULT_TRANSPORT_MODES

    try:
        exam_coord = await tmap.geocode_address(request.exam.exam_site_address)
    except tmap.TmapTimeoutError as exc:
        raise HTTPException(status_code=504, detail=f"시험장 주소 변환 시간 초과: {exc}") from exc
    except tmap.TmapRequestError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"시험장 주소를 좌표로 변환하지 못했습니다: {request.exam.exam_site_address}",
        ) from exc

    origin = {"latitude": request.origin.latitude, "longitude": request.origin.longitude}
    routes = await tmap.get_routes_for_modes(origin, exam_coord, modes)

    serialized_routes: dict[str, dict | None] = {}
    for mode, info in routes.items():
        if info is None:
            serialized_routes[mode] = None
            continue
        entry = {
            "distance_meters": info.get("distance_meters"),
            "duration_minutes": info.get("duration_minutes"),
            "recommended_departure_time": _compute_departure_time(
                request.exam.exam_date,
                request.exam.exam_start_time,
                info.get("duration_minutes"),
                request.buffer_minutes,
            ),
        }
        if request.debug:
            entry["raw"] = info.get("raw")
        serialized_routes[mode] = entry

    nearby_exam_site_places = await _search_nearby_exam_site_places(exam_coord)

    exam_info = {
        "certification_name": request.exam.certification_name,
        "exam_site_name": request.exam.exam_site_name,
        "exam_date": request.exam.exam_date,
        "exam_start_time": request.exam.exam_start_time,
    }
    guidance = await _generate_exam_guidance(
        exam_info, serialized_routes, nearby_exam_site_places, request.buffer_minutes
    )

    return {
        "exam": {
            **exam_info,
            "exam_site_address": request.exam.exam_site_address,
            "latitude": exam_coord["latitude"],
            "longitude": exam_coord["longitude"],
        },
        "routes": serialized_routes,
        "nearby_exam_site_places": nearby_exam_site_places,
        "guidance": guidance,
    }


def _serialize_route(route: dict | None, debug: bool) -> dict | None:
    if route is None:
        return None
    result = {"distance_meters": route.get("distance_meters"), "duration_minutes": route.get("duration_minutes")}
    if debug:
        result["raw"] = route.get("raw")
    return result


def _place_sort_key(place: dict, origin_lat: float, origin_lon: float):
    walk = place["routes"].get("walk")
    if walk and walk.get("duration_minutes") is not None:
        return (0, walk["duration_minutes"])
    distance = tmap.haversine_meters(origin_lat, origin_lon, place["latitude"], place["longitude"])
    return (1, distance)


def _compute_departure_time(
    exam_date: str, exam_start_time: str, duration_minutes: float | None, buffer_minutes: int
) -> str | None:
    if duration_minutes is None:
        return None
    try:
        exam_dt = datetime.strptime(f"{exam_date} {exam_start_time}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    departure_dt = exam_dt - timedelta(minutes=duration_minutes + buffer_minutes)
    return departure_dt.strftime("%H:%M")


async def _search_nearby_exam_site_places(
    exam_coord: dict, *, radius_meters: int = 1000, limit: int = 5
) -> dict:
    async def _search(keyword: str) -> list[dict]:
        try:
            return await tmap.search_pois(keyword, exam_coord["latitude"], exam_coord["longitude"], radius_meters)
        except (tmap.TmapRequestError, tmap.TmapTimeoutError) as exc:
            logger.warning("시험장 주변 '%s' 검색 실패: %s", keyword, exc)
            return []

    results = await asyncio.gather(*[_search(keyword) for keyword in _NEARBY_EXAM_KEYWORDS.values()])

    nearby: dict[str, list[dict]] = {}
    for field, pois in zip(_NEARBY_EXAM_KEYWORDS.keys(), results):
        enriched = [
            {
                **poi,
                "distance_meters": round(
                    tmap.haversine_meters(
                        exam_coord["latitude"], exam_coord["longitude"], poi["latitude"], poi["longitude"]
                    )
                ),
            }
            for poi in pois
        ]
        enriched.sort(key=lambda place: place["distance_meters"])
        nearby[field] = enriched[:limit]
    return nearby


def _rule_based_keywords_from_query(query: str) -> list[str]:
    found: list[str] = []
    for term, keyword in _QUERY_KEYWORD_DICTIONARY.items():
        if term in query and keyword not in found:
            found.append(keyword)
    return found


async def _resolve_search_keywords(query: str | None, fallback_keywords: list[str]) -> list[str]:
    """자연어 검색 요청(예: '가까운 공부하기 좋은 카페 알려줘')에서 TMAP POI 검색에 쓸
    키워드를 뽑아낸다. LLM이 있으면 의도 분석에 사용하고, 없거나 실패하면 규칙 기반
    사전 매칭으로 대체하며, 그마저 아무것도 못 찾으면 fallback_keywords를 그대로 쓴다."""
    if not query or not query.strip():
        return fallback_keywords

    if not settings.upstage_api_key:
        return _rule_based_keywords_from_query(query) or fallback_keywords

    try:
        prompt = (
            f'사용자 요청: "{query}"\n\n'
            "이 요청에서 학습 장소 검색에 사용할 한국어 키워드를 1~5개 뽑아줘 "
            "(예: 카페, 스터디카페, 도서관, 대학 도서관, 프린트). "
            "요청에 없는 내용을 지어내지 말고, 실제로 찾고자 하는 장소 유형만 추출해.\n\n"
            'Return JSON only: {"keywords": ["키워드1", "키워드2"]}'
        )
        result = await asyncio.wait_for(
            upstage.chat_json(
                [
                    {"role": "system", "content": "너는 학습 장소 검색 의도를 분석하는 도우미야."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
            ),
            timeout=_LLM_REASON_TIMEOUT_SECONDS,
        )
        keywords = [k.strip() for k in (result.get("keywords") or []) if isinstance(k, str) and k.strip()]
        return keywords or _rule_based_keywords_from_query(query) or fallback_keywords
    except asyncio.TimeoutError:
        logger.warning("검색 의도 분석 LLM 타임아웃 (query=%s)", query)
        return _rule_based_keywords_from_query(query) or fallback_keywords
    except Exception:
        logger.exception("검색 의도 분석 LLM 실패 (query=%s)", query)
        return _rule_based_keywords_from_query(query) or fallback_keywords


def _rule_based_place_reason(routes: dict) -> str:
    candidates = [(mode, info) for mode, info in routes.items() if info and info.get("duration_minutes") is not None]
    if not candidates:
        return "현재 위치 근처에서 찾은 학습 가능한 장소입니다."
    mode, info = min(candidates, key=lambda item: item[1]["duration_minutes"])
    minutes = round(info["duration_minutes"])
    if mode == "walk" and minutes <= 15:
        return f"현재 위치에서 도보로 약 {minutes}분이면 도착할 수 있어 짧은 자투리 학습에도 다녀오기 좋습니다."
    return f"{_MODE_LABELS.get(mode, mode)} 기준 이동 시간이 약 {minutes}분으로, 근처 후보 중 이동이 편한 곳입니다."


async def _generate_place_reason(place: dict, routes: dict) -> str:
    if not settings.upstage_api_key:
        return _rule_based_place_reason(routes)
    try:
        route_lines = (
            "\n".join(
                f"- {_MODE_LABELS.get(mode, mode)}: {info['distance_meters']}m, {info['duration_minutes']}분"
                for mode, info in routes.items()
                if info
            )
            or "이동 정보 없음"
        )
        prompt = (
            f"장소명: {place['name']}\n분류: {place['category']}\n주소: {place.get('address') or '정보 없음'}\n"
            f"현재 위치에서 이동 정보:\n{route_lines}\n\n"
            "위 장소가 학습(공부)하기에 왜 적합한지 한국어 한 문장으로 추천 이유를 작성해줘. "
            "이동시간/거리를 근거로 들고, 과장하지 말고 담백하게 작성해. 문장은 하나만 출력해."
        )
        text = await asyncio.wait_for(
            upstage.chat(
                [
                    {"role": "system", "content": "너는 학습 장소 추천 도우미야. 간결한 한국어 한 문장만 출력해."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.4,
                max_tokens=150,
            ),
            timeout=_LLM_REASON_TIMEOUT_SECONDS,
        )
        return text.strip() or _rule_based_place_reason(routes)
    except asyncio.TimeoutError:
        logger.warning("추천 이유 LLM 생성 타임아웃 (place=%s)", place.get("name"))
        return _rule_based_place_reason(routes)
    except Exception:
        logger.exception("추천 이유 LLM 생성 실패 (place=%s)", place.get("name"))
        return _rule_based_place_reason(routes)


def _fastest_route(routes: dict) -> tuple[str, dict] | None:
    candidates = [(mode, info) for mode, info in routes.items() if info and info.get("duration_minutes") is not None]
    if not candidates:
        return None
    return min(candidates, key=lambda item: item[1]["duration_minutes"])


def _as_str_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _rule_based_exam_guidance(routes: dict, buffer_minutes: int) -> dict:
    """LLM 없이(또는 실패 시) TMAP이 이미 계산한 거리/시간/출발시각만으로 안내를 구성한다.
    이 함수는 새로운 수치를 계산하지 않고, routes에 이미 들어있는 값만 그대로 인용한다."""
    fastest = _fastest_route(routes)
    if fastest is None:
        return {
            "recommended_transport_mode": None,
            "recommended_transport_reason": "이동 경로 정보를 가져오지 못해 추천할 수 없습니다.",
            "risk_notes": ["이동 경로 정보를 가져오지 못했습니다. 출발 전 직접 경로를 확인하세요."],
            "action_plan": ["시험 시작 시간을 다시 확인하고 여유 있게 출발하세요."],
            "preparation_items": list(_DEFAULT_PREPARATION_ITEMS),
        }

    mode, info = fastest
    minutes = round(info["duration_minutes"])
    departure = info.get("recommended_departure_time")

    risk_notes = ["실시간 교통·배차 상황은 반영되지 않았으니 출발 전 다시 확인하세요."]
    if routes.get("transit") is None:
        risk_notes.append("대중교통 경로 정보를 가져오지 못했습니다.")

    action_plan = []
    if departure:
        action_plan.append(f"{departure}까지 출발 준비를 마치고 출발하세요.")
    action_plan.append(
        f"{_MODE_LABELS.get(mode, mode)} 이동 기준 약 {minutes}분이 소요되며, {buffer_minutes}분의 여유 시간이 포함되어 있습니다."
    )
    action_plan.append("시험장 도착 후 신분증/수험표를 확인하고 지정된 좌석을 찾으세요.")

    return {
        "recommended_transport_mode": mode,
        "recommended_transport_reason": f"{_MODE_LABELS.get(mode, mode)} 이동이 약 {minutes}분으로 가장 빠릅니다.",
        "risk_notes": risk_notes,
        "action_plan": action_plan,
        "preparation_items": list(_DEFAULT_PREPARATION_ITEMS),
    }


async def _generate_exam_guidance(exam_info: dict, routes: dict, nearby_places: dict, buffer_minutes: int) -> dict:
    """LLM은 거리/시간/출발시각을 계산하지 않는다 — routes/nearby_places는 이미 TMAP과
    백엔드가 계산을 마친 값이고, LLM은 그 값을 입력으로만 받아 추천 이동수단/리스크/행동
    계획/준비물 문구를 생성한다. LLM이 없거나 실패하면 규칙 기반 안내로 대체한다."""
    fallback = _rule_based_exam_guidance(routes, buffer_minutes)
    if not settings.upstage_api_key:
        return fallback

    try:
        route_lines = (
            "\n".join(
                f"- {_MODE_LABELS.get(mode, mode)}: 거리 {info['distance_meters']}m, "
                f"소요시간 {info['duration_minutes']}분, 권장 출발시각 {info.get('recommended_departure_time') or '알 수 없음'}"
                for mode, info in routes.items()
                if info
            )
            or "이동 가능한 경로 정보 없음"
        )
        nearby_lines = "\n".join(
            f"- {label}: " + (", ".join(p["name"] for p in places[:3]) if places else "없음")
            for label, places in (
                ("카페", nearby_places.get("cafes", [])),
                ("식당", nearby_places.get("restaurants", [])),
                ("프린트", nearby_places.get("print_shops", [])),
            )
        )
        prompt = (
            f"자격증: {exam_info['certification_name']}\n시험장: {exam_info['exam_site_name']}\n"
            f"시험일시: {exam_info['exam_date']} {exam_info['exam_start_time']}\n버퍼 시간: {buffer_minutes}분\n\n"
            f"[이동 수단별 정보 - 이미 계산된 값이니 그대로 인용할 것, 새로 계산하지 말 것]\n{route_lines}\n\n"
            f"[시험장 주변 후보]\n{nearby_lines}\n\n"
            "위 정보만 근거로 시험 당일 안내를 작성해줘. 이동시간/거리/출발시각 숫자는 위에 주어진 값만 "
            "그대로 인용하고, 새로운 숫자를 계산하거나 추측하지 마.\n\n"
            "규칙:\n"
            "- risk_notes는 출발시각을 되풀이하지 말고, 교통 정체·배차 지연·주차·날씨처럼 이동 중 실제로 "
            "생길 수 있는 위험 요소를 설명해.\n"
            "- action_plan은 시험 당일 아침 시간 순서대로 할 일만 적어. 커피/식사 같은 여가 활동은 넣지 마.\n"
            "- preparation_items의 각 배열 원소에는 준비물 하나만 담아. 쉼표로 여러 개를 한 원소에 묶지 마.\n\n"
            "Return JSON only:\n"
            "{\n"
            '  "recommended_transport_mode": "walk 또는 car 또는 transit 중 하나(정보가 전혀 없으면 null)",\n'
            '  "recommended_transport_reason": "이 수단을 추천하는 한국어 한두 문장",\n'
            '  "risk_notes": ["위험 요소 하나당 한국어 문장 하나"],\n'
            '  "action_plan": ["할 일 하나당 한국어 문장 하나, 시간 순서대로"],\n'
            '  "preparation_items": ["준비물 하나당 한국어 단어 또는 짧은 구 하나"]\n'
            "}"
        )
        result = await asyncio.wait_for(
            upstage.chat_json(
                [
                    {
                        "role": "system",
                        "content": "너는 시험 당일 이동을 안내하는 도우미야. 주어진 수치만 사용하고 직접 계산하지 마.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
            ),
            timeout=_LLM_REASON_TIMEOUT_SECONDS,
        )
        return {
            "recommended_transport_mode": result.get("recommended_transport_mode")
            or fallback["recommended_transport_mode"],
            "recommended_transport_reason": result.get("recommended_transport_reason")
            or fallback["recommended_transport_reason"],
            "risk_notes": _as_str_list(result.get("risk_notes")) or fallback["risk_notes"],
            "action_plan": _as_str_list(result.get("action_plan")) or fallback["action_plan"],
            "preparation_items": _as_str_list(result.get("preparation_items")) or fallback["preparation_items"],
        }
    except asyncio.TimeoutError:
        logger.warning("시험 당일 안내 LLM 생성 타임아웃")
        return fallback
    except Exception:
        logger.exception("시험 당일 안내 LLM 생성 실패")
        return fallback

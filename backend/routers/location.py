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
from services import naver, tmap, upstage

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
# 속성 조건이 있는 경로(_generate_place_reason)는 스니펫 대신 블로그 원문(최대 3000자 x 3개)을
# 프롬프트에 넣으면서 응답이 느려지는 경우가 늘어, 8초는 종종 부족했다. 15초로 여유를 둔다.
_LLM_REASON_TIMEOUT_SECONDS = 15.0

# TMap은 좌석/와이파이/콘센트/영업시간/가격/인기 같은 속성을 전혀 제공하지 않는다. 사용자가
# 이런 조건을 물어보면(예: "넓고 조용한 카페") 그 부분만 Naver 블로그 검색으로 실제 후기를
# 찾아보고, 검색 결과에 실제로 나온 내용만 답변에 반영한다 (없으면 지어내지 않고 "확인 안 됨" 처리).
# 어떤 조건이든 대응할 수 있도록 고정 키워드 목록으로 매칭하지 않고, 매 요청마다 LLM이 사용자
# 원문을 직접 해석한다. LLM이 없거나 실패했을 때만 최소한의 규칙 기반 사전으로 대체한다.
_ATTRIBUTE_KEYWORD_FALLBACK = {
    "넓": "좌석/공간이 넓은지",
    "좁": "좌석/공간이 좁은지",
    "조용": "조용한 분위기인지",
    "시끄러": "시끄러운 편인지",
    "와이파이": "와이파이 제공 여부",
    "wifi": "와이파이 제공 여부",
    "콘센트": "콘센트(전원) 여부",
    "전원": "콘센트(전원) 여부",
    "24시간": "24시간 운영 여부",
    "밤늦": "심야 영업 여부",
    "저렴": "가격대",
    "가성비": "가격대",
    "비싸": "가격대",
    "인기": "인기/후기 평판",
    "리뷰": "인기/후기 평판",
    "평점": "인기/후기 평판",
}
_ATTRIBUTE_SEARCH_TIMEOUT_SECONDS = 6.0
_ATTRIBUTE_SEARCH_MAX_RESULTS = 3
_ATTRIBUTE_CONTENT_FETCH_TIMEOUT_SECONDS = 8.0

# 시험 당일 어시스턴트: 시험장 실제 방문 후기(Naver 블로그)에서 주차/입구/대기환경 같은
# 현장 팁을 뽑는다. TMAP/LLM 안내가 못 주는 "가본 사람만 아는" 정보라 별도로 검색한다.
# 부가 기능이므로 Naver 미설정/실패 시 조용히 빈 목록으로 대체한다.
# TMAP 주변 검색과 동시에 실행되는 동안 Naver 응답이 밀리는 경우가 있어(실측: 6초로는
# 간헐적으로 타임아웃) naver.py 자체 HTTP 타임아웃(10초)에 맞춰 여유를 둔다.
_EXAM_TIP_SEARCH_TIMEOUT_SECONDS = 12.0
_EXAM_TIP_MAX_RESULTS = 3


def _rule_based_attribute_hints(query: str) -> list[str]:
    found: list[str] = []
    for term, hint in _ATTRIBUTE_KEYWORD_FALLBACK.items():
        if term in query and hint not in found:
            found.append(hint)
    return found


async def _analyze_attribute_intent(query: str | None) -> list[str]:
    """사용자 원문에서 TMap이 못 주는 시설/분위기/가격/평판 조건을 LLM으로 그때그때 분석한다.
    고정 사전 매칭이 아니라 자연어를 직접 해석하므로 사전에 등록되지 않은 표현(예: "노트북 펴기
    좋은", "단체 손님 받는")도 대응할 수 있다. LLM이 없거나 실패/타임아웃하면 최소한의 규칙
    기반 사전으로 대체한다."""
    if not query or not query.strip():
        return []
    if not settings.upstage_api_key:
        return _rule_based_attribute_hints(query)

    try:
        prompt = (
            f'사용자 요청: "{query}"\n\n'
            "이 요청에서 지도 API(장소 종류/위치/거리 정보만 제공)로는 확인할 수 없는 시설·분위기·"
            "가격·평판 조건만 뽑아줘. 각 조건은 '~인지', '~여부'처럼 짧은 한국어 구로 표현해 "
            "(예: '좌석/공간이 넓은지', '조용한 분위기인지', '24시간 운영 여부').\n"
            "다음은 조건이 아니므로 절대 뽑지 마라:\n"
            "- 장소 종류/카테고리 자체 (카페, 스터디카페, 도서관, 독서실 등). '스터디카페 찾아줘'처럼 "
            "장소 종류만 말한 요청은 조건이 없는 것이니 빈 배열을 반환해라 ('스터디카페인지' 같은 "
            "항목을 만들지 마라).\n"
            "- 위치/거리/가까움 조건.\n"
            "- 사용자가 직접 말하지 않았는데 장소 종류의 통념으로 추론한 조건. 예: '도서관'이라고만 "
            "했으면 '조용한지'를 넣지 마라(도서관이 보통 조용하다는 건 통념일 뿐 사용자가 요청한 게 "
            "아니다). 사용자가 실제로 그 단어를 쓴 조건만 뽑아라.\n"
            "결과의 각 조건은 전부 뒷받침돼야 확정되는 AND 조건으로 쓰이니, 같은 의미를 여러 "
            "항목으로 쪼개지 마라 (예: '콘센트가 많은지'는 그 자체로 한 항목이지, '콘센트 사용 "
            "가능 여부'와 '콘센트 개수 충분 여부'로 나누면 안 된다). "
            "사용자가 '~하기 좋은'/'~에 적합한'처럼 구체적인 시설을 나열하지 않고 뭉뚱그려 말했으면 "
            "그 표현 그대로 한 항목으로만 남겨라 (예: '노트북 사용하기 좋은 카페' → '노트북 사용하기 "
            "좋은지' 한 항목). 사용자가 말하지 않은 와이파이/콘센트/좌석/조용함/24시간 같은 세부 "
            "시설들을 '~하기 좋으려면 이런 게 필요하겠지'라고 추론해서 조건을 늘리지 마라.\n"
            "해당하는 조건이 요청에 없으면 빈 배열을 반환해. 요청에 없는 조건을 지어내지 마.\n\n"
            'Return JSON only: {"attributes": ["조건1", "조건2"]}'
        )
        result = await asyncio.wait_for(
            upstage.chat_json(
                [
                    {"role": "system", "content": "너는 학습 장소 검색 요청에서 시설/분위기 조건을 분석하는 도우미야."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
            ),
            timeout=_LLM_REASON_TIMEOUT_SECONDS,
        )
        hints = [h.strip() for h in (result.get("attributes") or []) if isinstance(h, str) and h.strip()]
        return hints
    except asyncio.TimeoutError:
        logger.warning("속성 조건 분석 LLM 타임아웃 (query=%s)", query)
        return _rule_based_attribute_hints(query)
    except Exception:
        logger.exception("속성 조건 분석 LLM 실패 (query=%s)", query)
        return _rule_based_attribute_hints(query)


async def _search_place_attributes(place: dict, attribute_hints: list[str]) -> list[dict]:
    """속성 조건이 있을 때만 장소명으로 실제 후기/블로그 글을 Naver 검색으로 가져온다.
    속성 설명 문구("좌석/공간이 넓은지" 등)를 그대로 검색어에 넣으면 웹에 없는 표현이라 매칭이
    거의 안 된다 — 실제 블로그/후기 글이 걸리도록 "장소명 + 후기"로만 검색하고, 그 안에서 사용자가
    물어본 속성이 실제로 언급됐는지는 LLM이 판단한다.
    실패/타임아웃/미설정이어도 부가 정보이므로 조용히 빈 목록을 반환한다 (추천 자체는 계속 진행)."""
    if not attribute_hints:
        return []
    search_query = f"{place['name']} 후기"
    try:
        results = await asyncio.wait_for(
            naver.search_blog(search_query, max_results=_ATTRIBUTE_SEARCH_MAX_RESULTS),
            timeout=_ATTRIBUTE_SEARCH_TIMEOUT_SECONDS,
        )
    except Exception:
        logger.warning("장소 속성 Naver 검색 실패 (place=%s)", place.get("name"))
        return []

    # search_blog()의 snippet은 글 앞부분 100~200자만 잘려서 오기 때문에, 확인하려는 내용이
    # 글 뒷부분에 있으면 놓치는 경우가 많았다. 블로그 원문을 가져와 snippet 대신 쓰면 그런
    # 누락이 줄어든다. 원문 크롤링은 외부 페이지 구조에 의존하는 부가 기능이라, 실패하면
    # (타임아웃/비-네이버블로그/파싱 실패 등) 원래 snippet으로 조용히 대체한다.
    async def _enrich(result: dict) -> dict:
        try:
            content = await asyncio.wait_for(
                naver.fetch_blog_content(result["url"]),
                timeout=_ATTRIBUTE_CONTENT_FETCH_TIMEOUT_SECONDS,
            )
        except Exception:
            content = None
        return {**result, "snippet": content} if content else result

    return await asyncio.gather(*[_enrich(r) for r in results])


async def _search_exam_site_reviews(exam_site_name: str) -> list[dict]:
    """시험장 이름으로 실제 방문 후기 블로그 글을 Naver 검색으로 가져온다. 장소 속성 검색과
    같은 이유로 "시험장명 + 후기"로만 검색하고, 팁 추출은 LLM(_extract_exam_site_tips)이 한다.
    미설정/실패/타임아웃이면 부가 정보이므로 조용히 빈 목록을 반환한다."""
    try:
        results = await asyncio.wait_for(
            naver.search_blog(f"{exam_site_name} 시험 후기", max_results=_EXAM_TIP_MAX_RESULTS),
            timeout=_EXAM_TIP_SEARCH_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.warning("시험장 후기 Naver 검색 실패 (site=%s): %r", exam_site_name, exc)
        return []

    # snippet은 글 앞부분만 잘려 오므로, 가능하면 블로그 원문으로 대체한다 (실패 시 snippet 유지).
    async def _enrich(result: dict) -> dict:
        try:
            content = await asyncio.wait_for(
                naver.fetch_blog_content(result["url"]),
                timeout=_ATTRIBUTE_CONTENT_FETCH_TIMEOUT_SECONDS,
            )
        except Exception:
            content = None
        return {**result, "snippet": content} if content else result

    return await asyncio.gather(*[_enrich(r) for r in results])


async def _extract_exam_site_tips(
    exam_site_name: str, certification_name: str, review_snippets: list[dict]
) -> list[str]:
    """후기 글에 실제로 언급된 현장 팁(주차, 입구/고사실 찾기, 대기 환경, 도착 시간 등)만
    한 문장씩 뽑는다. 같은 시험장이라도 다른 종목(예: 조리기능사) 후기가 걸리는 경우가 많아,
    종목 전용 준비물/규정은 빼고 시험장(장소) 자체에 대한 팁만 남기도록 자격증 이름을 함께
    넘긴다. 후기에 없는 내용은 지어내지 않으며, LLM이 없거나 실패하면 빈 목록."""
    if not review_snippets or not settings.upstage_api_key:
        return []
    try:
        snippet_lines = "\n".join(
            f"{i}. {s.get('title', '')} - {s.get('snippet', '')}" for i, s in enumerate(review_snippets, 1)
        )
        prompt = (
            f'시험장: "{exam_site_name}"\n'
            f'사용자가 응시할 자격증: "{certification_name}"\n\n'
            f"이 시험장을 실제로 다녀온 사람들의 블로그 후기:\n{snippet_lines}\n\n"
            "위 후기에 실제로 언급된 내용 중에서, 이 시험장에서 시험을 볼 사람에게 도움이 되는 "
            "현장 팁만 뽑아줘 (예: 주차 가능 여부, 입구/고사실 찾기, 건물 구조, 대기 장소, 화장실, "
            "주변 소음, 도착 권장 시간 등).\n\n"
            "규칙:\n"
            "- 위 후기에 실제로 나온 내용만 사용해라. 후기에 없는 일반적인 시험 조언(신분증 챙기기 등)을 지어내지 마라.\n"
            f"- 후기가 '{exam_site_name}'이 아닌 다른 장소나 다른 주제에 대한 글이면 그 글은 무시해라.\n"
            f"- 시험장(장소) 자체에 대한 팁만 뽑아라. 후기 작성자가 응시한 종목이 '{certification_name}'과 "
            "다르면, 그 종목에만 해당하는 준비물/복장/시험 진행 규정(예: 조리복, 칼, 재료 등)은 제외해라. "
            "주차/건물/대기실/매점/입실 시간처럼 어떤 종목이든 해당되는 내용은 뽑아도 된다.\n"
            "- 팁 하나당 한국어 한 문장. 쓸 만한 팁이 없으면 빈 배열을 반환해라.\n\n"
            'Return JSON only: {"tips": ["팁1", "팁2"]}'
        )
        result = await asyncio.wait_for(
            upstage.chat_json(
                [
                    {
                        "role": "system",
                        "content": "너는 시험장 방문 후기에서 현장 팁을 추출하는 도우미야. 후기에 없는 내용은 절대 지어내지 않아.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=500,
            ),
            timeout=_LLM_REASON_TIMEOUT_SECONDS,
        )
        return [t.strip() for t in (result.get("tips") or []) if isinstance(t, str) and t.strip()]
    except asyncio.TimeoutError:
        logger.warning("시험장 팁 LLM 추출 타임아웃 (site=%s)", exam_site_name)
        return []
    except Exception:
        logger.exception("시험장 팁 LLM 추출 실패 (site=%s)", exam_site_name)
        return []


def _require_tmap() -> None:
    if not settings.tmap_app_key:
        raise HTTPException(
            status_code=503,
            detail="TMAP_APP_KEY가 설정되지 않았습니다. backend/.env에 값을 넣어주세요 (.env.example 참고).",
        )


@router.get("/health")
def location_health():
    return {
        "tmap_configured": bool(settings.tmap_app_key),
        "google_routes_configured": bool(settings.google_maps_api_key),
        "transit_provider": "google_routes" if settings.google_maps_api_key else "tmap",
        "required_env": ["TMAP_APP_KEY"],
        "optional_env": ["GOOGLE_MAPS_API_KEY"],
    }


@router.post("/nearby-study-places")
async def nearby_study_places(request: NearbyStudyPlacesRequest):
    _require_tmap()
    fallback_keywords = request.keywords or DEFAULT_STUDY_PLACE_KEYWORDS
    keywords = await _resolve_search_keywords(request.query, fallback_keywords)
    attribute_hints = await _analyze_attribute_intent(request.query)
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
            attribute_snippets = await _search_place_attributes(poi, attribute_hints)
            reason, attributes_confirmed = await _generate_place_reason(
                poi, routes, request.query, attribute_snippets, attribute_hints
            )
        result = {
            "id": poi["id"],
            "name": poi["name"],
            "category": poi["category"],
            "address": poi.get("address"),
            "latitude": poi["latitude"],
            "longitude": poi["longitude"],
            "routes": {mode: _serialize_route(info, request.debug) for mode, info in routes.items()},
            "recommendation_reason": reason,
            "attributes_confirmed": attributes_confirmed,
        }
        if request.debug:
            result["attribute_search_results"] = attribute_snippets
        return result

    places = await asyncio.gather(*[_build_place(poi) for poi in candidates])
    # 사용자가 시설/분위기 조건을 물어봤으면(attribute_hints) 그 조건이 실제로 확인된
    # 장소만 남긴다. "방문 전 확인 필요"처럼 애매한 곳까지 목록에 섞이면 조건에 안 맞는
    # 장소를 걸러야 하는 부담이 사용자에게 넘어가므로, 확인 안 된 곳은 아예 제외한다.
    if attribute_hints:
        places = [place for place in places if place["attributes_confirmed"]]
    places.sort(key=lambda place: _place_sort_key(place, request.latitude, request.longitude))

    return {
        "origin": {"latitude": request.latitude, "longitude": request.longitude},
        "query": request.query,
        "resolved_keywords": keywords,
        "resolved_attribute_hints": attribute_hints,
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

    nearby_exam_site_places, review_snippets = await asyncio.gather(
        _search_nearby_exam_site_places(exam_coord),
        _search_exam_site_reviews(request.exam.exam_site_name),
    )
    exam_site_tips = await _extract_exam_site_tips(
        request.exam.exam_site_name, request.exam.certification_name, review_snippets
    )

    exam_info = {
        "certification_name": request.exam.certification_name,
        "exam_site_name": request.exam.exam_site_name,
        "exam_date": request.exam.exam_date,
        "exam_start_time": request.exam.exam_start_time,
    }
    guidance = await _generate_exam_guidance(
        exam_info, serialized_routes, nearby_exam_site_places, request.buffer_minutes
    )

    result = {
        "exam": {
            **exam_info,
            "exam_site_address": request.exam.exam_site_address,
            "latitude": exam_coord["latitude"],
            "longitude": exam_coord["longitude"],
        },
        "routes": serialized_routes,
        "nearby_exam_site_places": nearby_exam_site_places,
        "guidance": guidance,
        # Naver 블로그 후기에서 추출한 현장 팁. 후기가 없거나 Naver/LLM 미설정이면 빈 목록.
        "exam_site_tips": exam_site_tips,
        "exam_site_tip_sources": [
            {"title": s.get("title", ""), "url": s.get("url", "")} for s in review_snippets
        ],
    }
    if request.debug:
        result["exam_site_review_snippets"] = review_snippets
    return result


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
            "이 요청에서 TMAP 지도의 장소(POI) 검색에 쓸 '장소 유형' 키워드만 1~5개 뽑아줘 "
            "(예: 카페, 스터디카페, 도서관, 대학 도서관, 독서실, 프린트). "
            "중요: 시설·분위기·가격·운영시간 같은 '조건' 단어는 절대 키워드에 넣지 마라. "
            "예를 들어 '와이파이', '콘센트', '주차', '조용한', '넓은', '저렴한', '24시간', '노트북', "
            "'예쁜' 같은 단어는 장소 유형이 아니므로 제외한다 — 이런 조건은 다른 단계에서 따로 "
            "처리하니 여기서는 순수하게 어떤 '종류'의 장소를 찾는지만 남겨라. "
            "요청에 장소 유형이 분명히 드러나지 않으면 학습에 어울리는 일반적인 유형(카페, 스터디카페, "
            "도서관 등)으로 채워도 된다. 요청에 없는 내용을 지어내지는 마.\n\n"
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


async def _generate_place_reason(
    place: dict,
    routes: dict,
    user_query: str | None,
    attribute_snippets: list[dict],
    attribute_hints: list[str],
) -> tuple[str, bool]:
    """추천 이유 문장과 함께, 사용자가 요청한 속성 조건(attribute_hints)이 실제 검색
    결과로 전부 확인됐는지(두 번째 반환값)를 같이 판단한다. 호출부(nearby_study_places)는
    이 값이 False인 장소를 최종 목록에서 제외한다 — "방문 전 확인 필요"처럼 애매하게 걸치는
    장소를 보여주는 대신, 확인된 곳만 보여달라는 요구사항에 따른 것이다.
    조건은 있는데 검색 스니펫이 아예 없으면 확인할 근거 자체가 없으므로 LLM 호출 없이 바로
    미확인 처리한다 (불필요한 호출도 줄이고, 근거 없이 확인됐다고 지어낼 위험도 없앤다)."""
    if attribute_hints and not attribute_snippets:
        return _rule_based_place_reason(routes), False
    if not settings.upstage_api_key:
        return _rule_based_place_reason(routes), not attribute_hints

    try:
        route_lines = (
            "\n".join(
                f"- {_MODE_LABELS.get(mode, mode)}: {info['distance_meters']}m, {info['duration_minutes']}분"
                for mode, info in routes.items()
                if info
            )
            or "이동 정보 없음"
        )
        query_line = f'사용자 요청 원문: "{user_query}"\n' if user_query and user_query.strip() else ""

        if attribute_hints:
            snippet_lines = "\n".join(
                f"{i}. {s.get('title', '')} - {s.get('snippet', '')}" for i, s in enumerate(attribute_snippets, 1)
            )
            condition_lines = "\n".join(f"- {hint}" for hint in attribute_hints)
            attribute_block = (
                f"확인해야 할 조건:\n{condition_lines}\n\n"
                f"웹 검색 결과(위 조건이 실제로 언급됐는지 확인용):\n{snippet_lines}\n\n"
            )
            # 조건이 여러 개일 때 "전부 확인됐는지"를 하나의 불린 값으로 한 번에 판단하게 하면,
            # 개별 조건을 꼼꼼히 대조하지 않고 답부터 정하는 경향이 있었다(실측: 후기 스니펫에
            # 전혀 없는 조건인데도 true로 잘못 판단하는 경우 발생). 조건마다 confirmed를 따로
            # 받아서 Python에서 all()로 집계하면, 모델이 조건 하나하나를 스니펫과 대조하도록
            # 강제할 수 있어 애매한 케이스가 새어나가는 걸 줄일 수 있다.
            attribute_rule = (
                "- 시설·환경·평판 관련 내용은 위 '웹 검색 결과'에 실제로 나온 내용일 때만 언급해라. "
                "검색 결과에 없는 내용을 단정하지 말고, 부풀리거나 다른 속성으로 바꿔 말하지 마라.\n"
                "- condition_checks에 '확인해야 할 조건' 각각에 대해 하나씩 항목을 만들어라(조건 개수와 "
                "정확히 같은 개수). 그 조건이 위 '웹 검색 결과'에 명확하고 구체적으로 언급된 경우에만 "
                "confirmed=true, 언급이 없거나 간접적/애매하게만 암시된 경우는 confirmed=false로 표시해라. "
                "확신이 서지 않으면 반드시 false를 선택해라.\n"
            )
        else:
            attribute_block = ""
            attribute_rule = ""

        prompt = (
            f"장소명: {place['name']}\n분류: {place['category']}\n주소: {place.get('address') or '정보 없음'}\n"
            f"{query_line}"
            f"현재 위치에서 이동 정보:\n{route_lines}\n\n"
            f"{attribute_block}"
            "위 장소가 학습(공부)하기에 왜 적합한지 한국어 한 문장으로 reason을 작성해줘.\n\n"
            "규칙:\n"
            "- 이동시간/거리, 장소명/분류는 항상 사실로 언급해도 된다.\n"
            f"{attribute_rule}"
            "- 위 정보 어디에도 없는 사실은 절대 지어내지 마라.\n"
            "- 사용자 요청 원문이 있으면 그 요청이 원하는 장소 '종류'와 이 장소의 분류가 맞는지 정도는 짧게 짚어줘도 된다.\n"
            "- 과장하지 말고 담백하게, reason은 한 문장만.\n\n"
            'Return JSON only: {"reason": "...", "condition_checks": '
            '[{"condition": "...", "confirmed": true 또는 false}, ...]}'
            + ("" if attribute_hints else " (attribute_hints가 없으면 condition_checks는 빈 배열)")
        )
        result = await asyncio.wait_for(
            upstage.chat_json(
                [
                    {
                        "role": "system",
                        "content": "너는 학습 장소 추천 도우미야. 주어진 정보에 없는 시설/분위기 속성은 절대 지어내지 않고, "
                        "근거 없이 조건이 확인됐다고 표시하지도 않아. 조건이 여러 개면 하나씩 꼼꼼히 대조해서 판단해.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=400,
            ),
            timeout=_LLM_REASON_TIMEOUT_SECONDS,
        )
        reason = (result.get("reason") or "").strip() or _rule_based_place_reason(routes)
        if attribute_hints:
            checks = result.get("condition_checks")
            # 모델이 조건별 항목을 빠뜨리거나 개수를 다르게 반환하면 근거가 불완전한 것이므로
            # 안전하게 미확인(false) 처리한다 — 애매하면 보여주지 않는다는 원칙을 그대로 적용.
            confirmed = (
                isinstance(checks, list)
                and len(checks) == len(attribute_hints)
                and all(isinstance(c, dict) and c.get("confirmed") is True for c in checks)
            )
        else:
            confirmed = True
        return reason, confirmed
    except asyncio.TimeoutError:
        logger.warning("추천 이유 LLM 생성 타임아웃 (place=%s)", place.get("name"))
        return _rule_based_place_reason(routes), not attribute_hints
    except Exception:
        logger.exception("추천 이유 LLM 생성 실패 (place=%s)", place.get("name"))
        return _rule_based_place_reason(routes), not attribute_hints


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
            "- recommended_transport_mode는 특별한 이유가 없으면 소요시간이 가장 짧은 수단을 골라라. "
            "더 오래 걸리는 수단을 추천하려면 그 이유를 recommended_transport_reason에 분명히 설명해야 한다.\n"
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

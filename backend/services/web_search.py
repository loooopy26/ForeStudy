"""네이버 검색 API 기반 웹 검색 도구."""

import re

import httpx

from config import settings


def _strip_html(value: str) -> str:
    """네이버 검색 결과의 강조 태그를 화면용 일반 텍스트로 바꾼다."""
    return re.sub(r"<[^>]+>", "", value or "").strip()


async def search(query: str, max_results: int = 5) -> list[dict]:
    if not settings.naver_client_id or not settings.naver_client_secret:
        raise RuntimeError(
            "네이버 검색 API 키가 설정되지 않았습니다. "
            "backend/.env에 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 추가해 주세요."
        )

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            "https://openapi.naver.com/v1/search/webkr.json",
            params={"query": query, "display": min(max_results, 100), "sort": "sim"},
            headers={
                "X-Naver-Client-Id": settings.naver_client_id,
                "X-Naver-Client-Secret": settings.naver_client_secret,
            },
        )
        response.raise_for_status()

    return [
        {
            "title": _strip_html(item.get("title", "")),
            "url": item.get("link", ""),
            "snippet": _strip_html(item.get("description", "")),
        }
        for item in response.json().get("items", [])
    ][:max_results]

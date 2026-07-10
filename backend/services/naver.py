"""Naver Search API 클라이언트 (블로그 검색).

TMAP은 좌석/와이파이/조용함 같은 속성을 제공하지 않으므로, 그런 조건이 실제로 언급된
후기를 찾을 때 사용한다. services/web_search.py(DuckDuckGo)와 반환 형식을 동일하게
맞춰([{title, url, snippet}]) 호출부에서 그대로 바꿔 끼울 수 있게 한다.
"""

import re
from urllib.parse import urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

from config import settings

_TAG_RE = re.compile(r"<[^>]+>")
_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_BLOG_CONTENT_TIMEOUT = httpx.Timeout(8.0, connect=5.0)
_BLOG_CONTENT_MAX_CHARS = 3000
# 최신(스마트에디터 3.0) 순으로 시도 — 매칭되는 첫 셀렉터를 본문으로 쓴다.
_BLOG_CONTENT_SELECTORS = ["div.se-main-container", "div#postViewArea", "div.post_ct"]


class NaverConfigError(Exception):
    """NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 설정되지 않았을 때."""


def _strip_tags(text: str) -> str:
    return _TAG_RE.sub("", text or "")


def _require_credentials() -> tuple[str, str]:
    if not settings.naver_client_id or not settings.naver_client_secret:
        raise NaverConfigError(
            "NAVER_CLIENT_ID/NAVER_CLIENT_SECRET이 설정되지 않았습니다. backend/.env에 값을 넣어주세요 (.env.example 참고)."
        )
    return settings.naver_client_id, settings.naver_client_secret


async def search_blog(query: str, max_results: int = 5) -> list[dict]:
    """블로그 검색으로 title/url/snippet 목록을 반환한다. sort=sim(정확도순)이 검색어와
    무관한 최신 글보다 실제 관련 후기를 우선 노출해 속성 확인 용도에 더 적합하다."""
    client_id, client_secret = _require_credentials()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(
            "https://openapi.naver.com/v1/search/blog.json",
            params={"query": query, "display": max_results, "sort": "sim"},
            headers={
                "X-Naver-Client-Id": client_id,
                "X-Naver-Client-Secret": client_secret,
            },
        )
        resp.raise_for_status()

    items = resp.json().get("items") or []
    return [
        {
            "title": _strip_tags(item.get("title", "")),
            "url": item.get("link", ""),
            "snippet": _strip_tags(item.get("description", "")),
        }
        for item in items[:max_results]
    ]


def _to_mobile_blog_url(url: str) -> str:
    """blog.naver.com 글은 본문이 iframe(PostView.naver)으로 들어있어 최상위 페이지를
    그대로 가져오면 본문이 안 잡힌다. 같은 글의 모바일 버전(m.blog.naver.com)은 iframe 없이
    본문을 바로 렌더링하므로 도메인만 바꿔서 요청한다."""
    parsed = urlparse(url)
    if parsed.netloc == "blog.naver.com":
        return urlunparse(parsed._replace(netloc="m.blog.naver.com"))
    return url


async def fetch_blog_content(url: str) -> str | None:
    """블로그 글 원문 텍스트를 가져온다. search_blog()가 주는 snippet은 글 앞부분
    100~200자만 잘려서 오기 때문에, 확인하려는 내용이 글 뒷부분에 있으면 스니펫만으로는
    놓치는 경우가 많다 — 원문을 가져오면 그런 누락을 줄일 수 있다.
    naver 블로그가 아니거나 요청/파싱에 실패하면 None을 반환해 호출부가 snippet으로
    대체하게 한다(본문 크롤링은 외부 페이지 구조에 의존해 실패할 수 있는 부가 기능이다)."""
    try:
        async with httpx.AsyncClient(timeout=_BLOG_CONTENT_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(_to_mobile_blog_url(url), headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
    except httpx.HTTPError:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    container = None
    for selector in _BLOG_CONTENT_SELECTORS:
        container = soup.select_one(selector)
        if container:
            break

    text = (container or soup).get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:_BLOG_CONTENT_MAX_CHARS] or None

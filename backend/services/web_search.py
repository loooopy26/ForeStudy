"""가벼운 웹 검색 도구.

DuckDuckGo의 no-JS HTML 결과를 읽어 제목/URL/스니펫만 반환한다.
"""

from urllib.parse import parse_qs, unquote, urlparse

import httpx


def _clean_duck_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        uddg = parse_qs(parsed.query).get("uddg", [""])[0]
        if uddg:
            return unquote(uddg)
    return raw_url


async def search(query: str, max_results: int = 5) -> list[dict]:
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise RuntimeError("beautifulsoup4가 설치되어 있지 않습니다. pip install -r requirements.txt를 실행해주세요.") from exc

    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
                )
            },
        )
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    results: list[dict] = []
    for result in soup.select(".result"):
        link = result.select_one(".result__a")
        snippet = result.select_one(".result__snippet")
        if not link:
            continue
        title = link.get_text(" ", strip=True)
        url = _clean_duck_url(link.get("href", ""))
        results.append(
            {
                "title": title,
                "url": url,
                "snippet": snippet.get_text(" ", strip=True) if snippet else "",
            }
        )
        if len(results) >= max_results:
            break
    return results

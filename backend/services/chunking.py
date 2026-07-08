"""Convert Upstage Document Parse results into RAG chunks."""

import re
from dataclasses import dataclass
from html import unescape

from config import settings

_TAG_RE = re.compile(r"<[^>]+>")
_ALT_RE = re.compile(r"""alt=(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE | re.DOTALL)
_HEADING_CATEGORIES = {"heading1", "heading2", "heading3"}


@dataclass
class Chunk:
    index: int
    section_title: str | None
    page_number: int | None
    content: str


def _element_text(element: dict) -> str:
    content = element.get("content", {})
    text_content = (content.get("text") or content.get("markdown") or "").strip()
    if text_content:
        return _normalize_text(text_content)

    html = content.get("html", "")
    if element.get("category") == "table":
        return html

    alt_matches = _ALT_RE.findall(html)
    alt_text = " ".join(match[0] or match[1] for match in alt_matches).strip()
    if alt_text:
        return _normalize_text(alt_text)

    return _normalize_text(_TAG_RE.sub(" ", html))


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", unescape(text)).strip()


def _split_long(text: str, max_chars: int, overlap: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    parts = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            cut = max(text.rfind(". ", start, end), text.rfind("다.", start, end))
            if cut > start + max_chars // 2:
                end = cut + 2
        parts.append(text[start:end].strip())
        if end >= len(text):
            break
        start = end - overlap
    return [part for part in parts if part]


def build_chunks(parse_result: dict) -> list[Chunk]:
    max_chars = settings.chunk_max_chars
    overlap = settings.chunk_overlap_chars

    sections: list[tuple[str | None, int | None, list[str]]] = []
    current_title: str | None = None
    current_page: int | None = None
    current_texts: list[str] = []

    for element in parse_result.get("elements", []):
        text = _element_text(element)
        if not text:
            continue
        if element.get("category") in _HEADING_CATEGORIES:
            if current_texts:
                sections.append((current_title, current_page, current_texts))
            current_title = text[:200]
            current_page = element.get("page")
            current_texts = []
        else:
            if current_page is None:
                current_page = element.get("page")
            current_texts.append(text)

    if current_texts or current_title:
        sections.append((current_title, current_page, current_texts))

    chunks: list[Chunk] = []
    for title, page, texts in sections:
        body = "\n".join(texts) if texts else (title or "")
        if title and texts:
            body = f"[{title}]\n{body}"
        for piece in _split_long(body, max_chars, overlap):
            chunks.append(
                Chunk(
                    index=len(chunks),
                    section_title=title,
                    page_number=page,
                    content=piece,
                )
            )
    return chunks

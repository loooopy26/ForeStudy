"""Upstage API 클라이언트 (Chat / Embeddings / Document Parse).

- Chat:      POST {base}/chat/completions   (OpenAI 호환, solar-pro2)
- Embedding: POST {base}/embeddings         (solar-embedding-2-*, 1024차원, 배치 최대 100개)
- Parse:     POST {base}/document-digitization (multipart, model=document-parse)
"""

import json
from pathlib import Path

import httpx

from config import settings

EMBEDDING_DIM = 1024
_EMBED_BATCH_SIZE = 100

_headers = {"Authorization": f"Bearer {settings.upstage_api_key}"}


async def chat(
    messages: list[dict],
    *,
    json_mode: bool = False,
    temperature: float = 0.3,
    max_tokens: int | None = None,
) -> str:
    """Solar 챗 호출. json_mode=True면 JSON Mode(response_format=json_object) 사용 —
    이때 프롬프트에 'JSON'이라는 단어가 반드시 포함되어야 한다(Upstage 문서 요구사항)."""
    body: dict = {
        "model": settings.upstage_chat_model,
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    if max_tokens:
        body["max_tokens"] = max_tokens

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{settings.upstage_base_url}/chat/completions",
            headers={**_headers, "Content-Type": "application/json"},
            json=body,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def chat_json(messages: list[dict], **kwargs) -> dict:
    """JSON Mode 호출 후 파싱까지. 모델이 코드펜스를 붙이는 경우도 방어."""
    content = await chat(messages, json_mode=True, **kwargs)
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        text = text.removeprefix("json").strip()
    return json.loads(text)


async def embed(texts: list[str], *, kind: str = "passage") -> list[list[float]]:
    """텍스트 목록을 임베딩. kind: 'passage'(문서 저장용) | 'query'(검색용)."""
    model = (
        settings.upstage_embedding_passage_model
        if kind == "passage"
        else settings.upstage_embedding_query_model
    )
    results: list[list[float]] = []
    async with httpx.AsyncClient(timeout=120) as client:
        for i in range(0, len(texts), _EMBED_BATCH_SIZE):
            batch = texts[i : i + _EMBED_BATCH_SIZE]
            resp = await client.post(
                f"{settings.upstage_base_url}/embeddings",
                headers={**_headers, "Content-Type": "application/json"},
                json={"model": model, "input": batch},
            )
            resp.raise_for_status()
            data = sorted(resp.json()["data"], key=lambda d: d["index"])
            results.extend(d["embedding"] for d in data)
    return results


async def parse_document(file_path: Path) -> dict:
    """Document Parse 동기 API (최대 100페이지). elements[] 에 heading/paragraph/table
    등 레이아웃 요소가 읽기 순서대로 들어 있다."""
    async with httpx.AsyncClient(timeout=300) as client:
        with open(file_path, "rb") as f:
            resp = await client.post(
                f"{settings.upstage_base_url}/document-digitization",
                headers=_headers,
                files={"document": (file_path.name, f)},
                data={"model": settings.upstage_doc_parse_model, "ocr": "auto"},
            )
        resp.raise_for_status()
        return resp.json()

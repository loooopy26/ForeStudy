"""Upstage API 클라이언트 (Chat / Embeddings / Document Parse).

- Chat:      POST {base}/chat/completions   (OpenAI 호환, solar-pro2)
- Embedding: POST {base}/embeddings         (solar-embedding-2-*, 1024차원, 배치 최대 100개)
- Parse:     POST {base}/document-digitization (동기, 최대 50MB) 또는
             POST {base}/document-digitization/async (비동기, 최대 200MB, 폴링 필요)

주의: async 엔드포인트는 문서상 200MB까지 지원한다고 되어 있지만, 실제로는 내부
프록시("docmate")가 그보다 훨씬 작은 크기에서도 413을 반환하는 사례가 확인되었다
(126MB PDF에서 재현). 그래서 PDF는 async를 타지 않고, 항상 50MB 이하로 잘라
동기 API를 반복 호출하는 방식(_parse_pdf_in_chunks)으로 처리한다.
"""

import asyncio
import io
import json
from pathlib import Path

import httpx
from pypdf import PdfReader, PdfWriter

from config import settings

EMBEDDING_DIM = 1024
_EMBED_BATCH_SIZE = 100

# 동기 API는 50MB까지만 지원, 그 이상은 async 제출 후 폴링해야 함 (Upstage 문서 파싱 API 제약)
_SYNC_SIZE_LIMIT_BYTES = 50 * 1024 * 1024
_ASYNC_POLL_INTERVAL_SECONDS = 5
_ASYNC_POLL_TIMEOUT_SECONDS = 20 * 60

# PDF를 청크로 나눌 때 목표로 하는 청크당 최대 용량(동기 50MB 한도 대비 여유를 둠)과 페이지 수
# (동기 API의 페이지 한도 100장도 함께 고려)
_CHUNK_TARGET_BYTES = 45 * 1024 * 1024
_CHUNK_MAX_PAGES = 100


def _auth_headers() -> dict:
    if not settings.upstage_api_key:
        raise RuntimeError(
            "UPSTAGE_API_KEY가 설정되지 않았습니다. backend/.env에 값을 넣어주세요 "
            "(.env.example 참고). AI 도서관 기능(파싱/임베딩/챗) 호출 시에만 필요합니다."
        )
    return {"Authorization": f"Bearer {settings.upstage_api_key}"}


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

    async with httpx.AsyncClient(timeout=280) as client:
        resp = await client.post(
            f"{settings.upstage_base_url}/chat/completions",
            headers={**_auth_headers(), "Content-Type": "application/json"},
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


async def chat_with_tools(
    messages: list[dict],
    *,
    tools: list[dict],
    tool_choice: str | dict = "auto",
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> dict:
    """Solar의 OpenAI 호환 tool-calling 응답 원본 메시지를 반환한다."""
    body: dict = {
        "model": settings.upstage_chat_model,
        "messages": messages,
        "tools": tools,
        "tool_choice": tool_choice,
        "temperature": temperature,
    }
    if max_tokens:
        body["max_tokens"] = max_tokens

    async with httpx.AsyncClient(timeout=240) as client:
        resp = await client.post(
            f"{settings.upstage_base_url}/chat/completions",
            headers={**_auth_headers(), "Content-Type": "application/json"},
            json=body,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Upstage tool-calling failed: {resp.status_code} {resp.text}")
        return resp.json()["choices"][0]["message"]


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
                headers={**_auth_headers(), "Content-Type": "application/json"},
                json={"model": model, "input": batch},
            )
            resp.raise_for_status()
            data = sorted(resp.json()["data"], key=lambda d: d["index"])
            results.extend(d["embedding"] for d in data)
    return results


async def parse_document(file_path: Path) -> dict:
    """Document Parse. elements[] 에 heading/paragraph/table 등 레이아웃 요소가
    읽기 순서대로 들어 있다. 50MB 이하는 동기 API로 바로 처리한다.
    50MB 초과 PDF는 청크로 잘라 동기 API를 반복 호출해 병합하고(async의 413 이슈 회피),
    PDF가 아닌 형식(ppt/docx 등)은 청크 분할이 어려워 비동기 API로 제출한다."""
    if file_path.stat().st_size <= _SYNC_SIZE_LIMIT_BYTES:
        return await _parse_document_sync(file_path)
    if file_path.suffix.lower() == ".pdf":
        return await _parse_pdf_in_chunks(file_path)
    return await _parse_document_async(file_path)


async def _parse_pdf_in_chunks(file_path: Path) -> dict:
    """50MB를 넘는 PDF를 용량/페이지 기준으로 잘라 동기 API를 순차 호출한 뒤 결과를 병합한다."""
    reader = PdfReader(str(file_path))
    total_pages = len(reader.pages)

    all_elements: list[dict] = []
    page_offset = 0
    start = 0
    while start < total_pages:
        end, chunk_bytes = _build_chunk(reader, start, total_pages)

        tmp_path = file_path.with_name(f"{file_path.stem}__chunk_{start}_{end}{file_path.suffix}")
        tmp_path.write_bytes(chunk_bytes)
        try:
            result = await _parse_document_sync(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

        for element in result.get("elements", []):
            if element.get("page") is not None:
                element["page"] += page_offset
            all_elements.append(element)

        page_offset += end - start
        start = end

    return {"elements": all_elements}


def _build_chunk(reader: PdfReader, start: int, total_pages: int) -> tuple[int, bytes]:
    """start 페이지부터 시작해 _CHUNK_TARGET_BYTES/_CHUNK_MAX_PAGES 한도 안에서
    최대한 채운 PDF 조각을 만든다. 반환값은 (다음 청크 시작 인덱스, PDF 바이트)."""
    writer = PdfWriter()
    end = start
    last_good: bytes | None = None
    while end < total_pages and (end - start) < _CHUNK_MAX_PAGES:
        writer.add_page(reader.pages[end])
        end += 1
        buf = io.BytesIO()
        writer.write(buf)
        chunk_bytes = buf.getvalue()
        if len(chunk_bytes) > _CHUNK_TARGET_BYTES and (end - start) > 1:
            # 방금 페이지를 더해서 한도를 넘겼으면 이전 상태(그 페이지 제외)로 확정하고 중단
            end -= 1
            break
        last_good = chunk_bytes
    return end, last_good


async def _parse_document_sync(file_path: Path) -> dict:
    async with httpx.AsyncClient(timeout=300) as client:
        with open(file_path, "rb") as f:
            resp = await client.post(
                f"{settings.upstage_base_url}/document-digitization",
                headers=_auth_headers(),
                files={"document": (file_path.name, f)},
                data={"model": settings.upstage_doc_parse_model, "ocr": "auto"},
            )
        resp.raise_for_status()
        return resp.json()


async def _parse_document_async(file_path: Path) -> dict:
    """비동기 Document Parse: 제출 → request_id 폴링 → 배치별 결과 다운로드 후 병합.
    각 배치 download_url은 15분 내에 만료되므로 completed 확인 직후 바로 받는다."""
    async with httpx.AsyncClient(timeout=300) as client:
        with open(file_path, "rb") as f:
            resp = await client.post(
                f"{settings.upstage_base_url}/document-digitization/async",
                headers=_auth_headers(),
                files={"document": (file_path.name, f)},
                data={"model": settings.upstage_doc_parse_model, "ocr": "auto"},
            )
        resp.raise_for_status()
        request_id = resp.json()["request_id"]

        elapsed = 0
        job: dict = {}
        while elapsed < _ASYNC_POLL_TIMEOUT_SECONDS:
            await asyncio.sleep(_ASYNC_POLL_INTERVAL_SECONDS)
            elapsed += _ASYNC_POLL_INTERVAL_SECONDS
            status_resp = await client.get(
                f"{settings.upstage_base_url}/document-digitization/requests/{request_id}",
                headers=_auth_headers(),
            )
            status_resp.raise_for_status()
            job = status_resp.json()
            if job["status"] == "completed":
                break
            if job["status"] == "failed":
                reason = job.get("failure_message") or "사유 미상"
                raise RuntimeError(f"Upstage 비동기 파싱 실패 (request_id={request_id}): {reason}")
        else:
            raise TimeoutError(f"Upstage 비동기 파싱 타임아웃({_ASYNC_POLL_TIMEOUT_SECONDS}초): request_id={request_id}")

        elements: list[dict] = []
        for batch in sorted(job["batches"], key=lambda b: b["start_page"]):
            batch_resp = await client.get(batch["download_url"])
            batch_resp.raise_for_status()
            elements.extend(batch_resp.json().get("elements", []))
        return {"elements": elements}

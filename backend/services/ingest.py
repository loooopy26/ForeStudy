"""업로드된 자료의 수집 파이프라인 (백그라운드 실행):
파싱(Document Parse) → 청킹 → 임베딩(passage) → 저장 → 요약/핵심개념 생성
"""

import json
import logging
from pathlib import Path

import httpx

from agents import graph as agent_graph
from db import get_pool, vector_literal
from services import rag, study_agent, upstage
from services.chunking import build_chunks

logger = logging.getLogger(__name__)

# 요약 생성 시 LLM에 넣을 최대 분량 (앞부분 위주 — 전체 요약은 map-reduce로 확장 가능)
_SUMMARY_INPUT_CHARS = 12000


async def ingest_material(study_material_id: str, file_path: Path, title: str) -> None:
    pool = await get_pool()
    try:
        material = await pool.fetchrow(
            """
            SELECT certification_id, is_reference_material
            FROM study_materials
            WHERE id = $1
            """,
            study_material_id,
        )
        if material is None:
            raise ValueError("저장된 학습 자료를 찾을 수 없습니다")
        await pool.execute(
            """
            UPDATE study_materials
            SET processed_status = 'processing', processing_error = NULL, processing_stage = 'requesting_document_parse'
            WHERE id = $1
            """,
            study_material_id,
        )

        # 1) 파싱
        parse_result = await upstage.parse_document(file_path)

        # 2) 청킹
        await _set_stage(pool, study_material_id, "chunking_document")
        chunks = build_chunks(parse_result)
        if not chunks:
            raise ValueError("파싱 결과에서 텍스트를 추출하지 못했습니다")

        # 3) 임베딩 (배치)
        await _set_stage(pool, study_material_id, "creating_embeddings")
        embeddings = await upstage.embed([c.content for c in chunks], kind="passage")

        # 4) 저장 (재처리 대비 기존 청크 삭제 후 삽입)
        await _set_stage(pool, study_material_id, "saving_search_index")
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    "DELETE FROM document_chunks WHERE study_material_id = $1",
                    study_material_id,
                )
                await conn.executemany(
                    """
                    INSERT INTO document_chunks
                        (study_material_id, chunk_index, section_title, page_number,
                         content, token_count, embedding)
                    VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
                    """,
                    [
                        (
                            study_material_id,
                            c.index,
                            c.section_title,
                            c.page_number,
                            c.content,
                            len(c.content) // 2,  # 대략적 토큰 수
                            vector_literal(e),
                        )
                        for c, e in zip(chunks, embeddings)
                    ],
                )

        # 5) 요약 + 핵심 개념
        await _set_stage(pool, study_material_id, "generating_summary")
        sample = ""
        for c in chunks:
            if len(sample) + len(c.content) > _SUMMARY_INPUT_CHARS:
                break
            sample += c.content + "\n"
        summary_result = await _summarize_with_retry(title, sample)

        # 사용자 자료를 같은 자격증의 출제기준/기출 해설과 비교해 일별 플랜과 퀴즈에
        # 반영할 보완 주제를 저장한다. 공통 자료 자체에는 다시 비교를 적용하지 않는다.
        reference_alignment = None
        if material["certification_id"] and not material["is_reference_material"]:
            reference_alignment = await _build_reference_alignment(
                certification_id=str(material["certification_id"]),
                title=title,
                summary=summary_result.get("summary") or "",
            )

        await _set_stage(pool, study_material_id, "saving_summary")
        await pool.execute(
            """
            UPDATE study_materials
            SET processed_status = 'ready', ai_summary = $2, key_concepts = $3::jsonb,
                reference_alignment = $4::jsonb, processing_stage = NULL
            WHERE id = $1
            """,
            study_material_id,
            summary_result.get("summary"),
            json.dumps(summary_result.get("key_concepts", []), ensure_ascii=False),
            json.dumps(reference_alignment, ensure_ascii=False) if reference_alignment else None,
        )
        logger.info("ingest 완료: material=%s chunks=%d", study_material_id, len(chunks))

    except Exception as exc:
        logger.exception("ingest 실패: material=%s", study_material_id)
        error_message = _describe_ingest_error(exc)
        await pool.execute(
            "UPDATE study_materials SET processed_status = 'failed', processing_error = $2, processing_stage = NULL WHERE id = $1",
            study_material_id,
            error_message,
        )


async def _set_stage(pool, study_material_id: str, stage: str) -> None:
    await pool.execute(
        "UPDATE study_materials SET processing_stage = $2 WHERE id = $1", study_material_id, stage
    )


async def _summarize_with_retry(title: str, sample: str) -> dict:
    """매우 길고 촘촘한 자료는 요약 생성 자체가 느려 타임아웃이 날 수 있고, 요약이 너무 길어져
    응답이 max_tokens 중간에 잘려 JSON 파싱이 깨질 수도 있다(JSONDecodeError). 둘 다 입력을
    절반으로 줄이면 완화되므로(생성 시간 단축, 자연히 더 짧은 요약 유도) 같은 방식으로 재시도한다."""
    try:
        return await agent_graph.run_summarize(title, sample)
    except (httpx.ReadTimeout, httpx.PoolTimeout, json.JSONDecodeError) as exc:
        logger.warning("summarize 실패(%s), 입력을 절반으로 줄여 재시도: title=%s", type(exc).__name__, title)
        return await agent_graph.run_summarize(title, sample[: len(sample) // 2])


async def _build_reference_alignment(
    *, certification_id: str, title: str, summary: str
) -> dict | None:
    """공통 자료가 아직 없거나 보조 분석이 실패해도 업로드 처리를 막지 않는다."""
    if not summary:
        return None
    try:
        reference_chunks = await rag.retrieve_reference_chunks(
            certification_id,
            f"{title}\n{summary[:4000]}",
            top_k=8,
        )
        if not reference_chunks:
            return None
        return await study_agent.analyze_material_alignment(
            title,
            summary,
            rag.format_context(reference_chunks),
        )
    except Exception:
        logger.exception("공통 RAG 비교 분석 실패: title=%s", title)
        return None


def _describe_ingest_error(exc: Exception) -> str:
    """자주 발생하는 Upstage 오류는 사용자가 바로 조치할 수 있는 한국어 안내로 바꾸고,
    그 외에는 기존처럼 원본 오류를 그대로 보여준다 (디버깅용)."""
    if not isinstance(exc, httpx.HTTPStatusError):
        # httpcore.ReadTimeout 등 일부 예외는 str(exc)가 빈 문자열이라 예외 타입명으로 대체
        return str(exc)[:500] or f"{type(exc).__name__} (메시지 없음)"

    try:
        body = exc.response.json()
        error = body.get("error") or {}
        code = error.get("code")
        message = error.get("message") or ""
    except (ValueError, AttributeError):
        code = None
        message = exc.response.text[:300]

    if code == "invalid_document":
        if "password" in message.lower():
            return "비밀번호로 보호된 파일은 업로드할 수 없습니다. 비밀번호를 해제한 뒤 다시 업로드해 주세요."
        return f"이 파일을 처리할 수 없습니다: {message[:200]}" if message else "이 파일을 처리할 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요."

    return f"Upstage API 오류 ({exc.response.status_code}): {exc.response.text[:300]}"

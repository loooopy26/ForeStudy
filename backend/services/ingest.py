"""업로드된 자료의 수집 파이프라인 (백그라운드 실행):
파싱(Document Parse) → 청킹 → 임베딩(passage) → 저장 → 요약/핵심개념 생성
"""

import json
import logging
from pathlib import Path

from db import get_pool, vector_literal
from services import study_agent, upstage
from services.chunking import build_chunks

logger = logging.getLogger(__name__)

# 요약 생성 시 LLM에 넣을 최대 분량 (앞부분 위주 — 전체 요약은 map-reduce로 확장 가능)
_SUMMARY_INPUT_CHARS = 12000


async def ingest_material(study_material_id: str, file_path: Path, title: str) -> None:
    pool = await get_pool()
    try:
        await pool.execute(
            "UPDATE study_materials SET processed_status = 'processing' WHERE id = $1",
            study_material_id,
        )

        # 1) 파싱
        parse_result = await upstage.parse_document(file_path)

        # 2) 청킹
        chunks = build_chunks(parse_result)
        if not chunks:
            raise ValueError("파싱 결과에서 텍스트를 추출하지 못했습니다")

        # 3) 임베딩 (배치)
        embeddings = await upstage.embed([c.content for c in chunks], kind="passage")

        # 4) 저장 (재처리 대비 기존 청크 삭제 후 삽입)
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
        sample = ""
        for c in chunks:
            if len(sample) + len(c.content) > _SUMMARY_INPUT_CHARS:
                break
            sample += c.content + "\n"
        summary_result = await study_agent.summarize(title, sample)

        await pool.execute(
            """
            UPDATE study_materials
            SET processed_status = 'ready', ai_summary = $2, key_concepts = $3::jsonb
            WHERE id = $1
            """,
            study_material_id,
            summary_result.get("summary"),
            json.dumps(summary_result.get("key_concepts", []), ensure_ascii=False),
        )
        logger.info("ingest 완료: material=%s chunks=%d", study_material_id, len(chunks))

    except Exception:
        logger.exception("ingest 실패: material=%s", study_material_id)
        await pool.execute(
            "UPDATE study_materials SET processed_status = 'failed' WHERE id = $1",
            study_material_id,
        )

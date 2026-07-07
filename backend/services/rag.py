"""pgvector 유사도 검색 (코사인 거리 <=> 연산자)."""

from config import settings
from db import get_pool, vector_literal
from services import upstage


async def retrieve_chunks(
    study_material_id: str,
    query: str,
    top_k: int | None = None,
) -> list[dict]:
    """자료 범위 내에서 query와 가장 유사한 청크 top-k 반환."""
    top_k = top_k or settings.rag_top_k
    [query_embedding] = await upstage.embed([query], kind="query")

    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, chunk_index, section_title, page_number, content,
               1 - (embedding <=> $1::vector) AS similarity
        FROM document_chunks
        WHERE study_material_id = $2 AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3
        """,
        vector_literal(query_embedding),
        study_material_id,
        top_k,
    )
    return [dict(r) for r in rows]


def format_context(chunks: list[dict]) -> str:
    """검색된 청크를 LLM 컨텍스트 블록으로 조립."""
    blocks = []
    for c in chunks:
        header = f"(p.{c['page_number']}" + (f", {c['section_title']}" if c["section_title"] else "") + ")"
        blocks.append(f"--- 발췌 {c['chunk_index']} {header} ---\n{c['content']}")
    return "\n\n".join(blocks)

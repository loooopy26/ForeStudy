"""pgvector 유사도 검색 (코사인 거리 <=> 연산자)."""

from config import settings
from db import get_pool, vector_literal
from services import upstage


async def retrieve_chunks(
    study_material_id: str,
    query: str,
    top_k: int | None = None,
    *,
    include_reference: bool = True,
) -> list[dict]:
    """사용자 자료를 우선해 검색하고, 같은 자격증 공통 자료를 보조 근거로 더한다.

    공통 자료는 `is_reference_material`로 별도 보관된다. 선택한 사용자 자료에
    certification_id가 있을 때만 같은 자격증의 출제 기준/기출 해설을 합치므로,
    다른 자격증이나 일반 업로드 자료의 검색 결과에는 섞이지 않는다. 특히 공식
    출제기준(exam_standard)은 자료가 존재하는 한 매 검색마다 최소 한 청크 이상을
    보장해, 기출 유사도가 높다는 이유로 기준 자체가 빠지지 않게 한다.
    """
    top_k = top_k or settings.rag_top_k
    [query_embedding] = await upstage.embed([query], kind="query")

    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT c.id, c.chunk_index, c.section_title, c.page_number, c.content,
               m.title AS source_title, m.is_reference_material, m.reference_kind,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM document_chunks c
        JOIN study_materials m ON m.id = c.study_material_id
        JOIN study_materials selected ON selected.id = $2
        WHERE c.embedding IS NOT NULL
          AND (
              c.study_material_id = $2
              OR (
                  $4::boolean = TRUE
                  AND m.is_reference_material = TRUE
                  AND selected.certification_id IS NOT NULL
                  AND m.certification_id = selected.certification_id
              )
          )
        -- 사용자 자료의 동점/근접 결과를 아주 조금 앞세운다. 공통 자료가 사용자의
        -- 업로드 본문을 완전히 덮지 않으면서도 시험 기준의 빈틈을 보완하게 된다.
        ORDER BY (c.embedding <=> $1::vector)
            - CASE WHEN c.study_material_id = $2 THEN 0.02 ELSE 0 END
        LIMIT $3
        """,
        vector_literal(query_embedding),
        study_material_id,
        top_k,
        include_reference,
    )
    results = [dict(r) for r in rows]
    if not include_reference:
        return results

    # 유사도만으로 검색하면 기출 해설의 문제 문장이 더 가까워 공식 출제기준이 결과에서
    # 빠질 수 있다. 기준 청크를 별도로 검색해 앞에 보강한다. 나머지 자리는 사용자 자료와
    # 기출 해설의 의미 검색 결과가 채운다.
    standard_rows = await pool.fetch(
        """
        SELECT c.id, c.chunk_index, c.section_title, c.page_number, c.content,
               m.title AS source_title, m.is_reference_material, m.reference_kind,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM document_chunks c
        JOIN study_materials m ON m.id = c.study_material_id
        JOIN study_materials selected ON selected.id = $2
        WHERE c.embedding IS NOT NULL
          AND selected.certification_id IS NOT NULL
          AND m.certification_id = selected.certification_id
          AND m.is_reference_material = TRUE
          AND m.reference_kind = 'exam_standard'
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
        """,
        vector_literal(query_embedding),
        study_material_id,
        _official_standard_slots(top_k),
    )
    return _prioritize_official_standard(results, [dict(r) for r in standard_rows], top_k)


async def retrieve_reference_chunks(
    certification_id: str,
    query: str,
    top_k: int = 6,
) -> list[dict]:
    """특정 자격증의 공통 기준/기출 자료만 대상으로 검색한다.

    비교 분석에도 공식 출제기준이 빠지지 않도록 같은 우선순위 규칙을 적용한다.
    """
    [query_embedding] = await upstage.embed([query], kind="query")
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT c.id, c.chunk_index, c.section_title, c.page_number, c.content,
               m.title AS source_title, m.is_reference_material, m.reference_kind,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM document_chunks c
        JOIN study_materials m ON m.id = c.study_material_id
        WHERE c.embedding IS NOT NULL
          AND m.certification_id = $2
          AND m.is_reference_material = TRUE
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
        """,
        vector_literal(query_embedding),
        certification_id,
        top_k,
    )
    standard_rows = await pool.fetch(
        """
        SELECT c.id, c.chunk_index, c.section_title, c.page_number, c.content,
               m.title AS source_title, m.is_reference_material, m.reference_kind,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM document_chunks c
        JOIN study_materials m ON m.id = c.study_material_id
        WHERE c.embedding IS NOT NULL
          AND m.certification_id = $2
          AND m.is_reference_material = TRUE
          AND m.reference_kind = 'exam_standard'
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
        """,
        vector_literal(query_embedding),
        certification_id,
        _official_standard_slots(top_k),
    )
    return _prioritize_official_standard(
        [dict(r) for r in rows], [dict(r) for r in standard_rows], top_k
    )


async def retrieve_quiz_chunks(
    study_material_id: str,
    query: str,
    top_k: int,
) -> list[dict]:
    """퀴즈용 검색: 공식 출제기준은 범위로, 기출 해설은 문제 형식의 주근거로 쓴다.

    사용자 자료와 출제기준을 버리지 않되, 실제 문항의 개념·난이도·보기 구성은
    기출 해설 청크를 우선 참고하도록 past_exam 청크를 별도 확보한다. 원문 문제를
    그대로 복제하는 용도가 아니라 같은 개념을 새 문항으로 재구성하는 근거다.
    """
    results = await retrieve_chunks(study_material_id, query, top_k=top_k)
    [query_embedding] = await upstage.embed([query], kind="query")
    pool = await get_pool()
    past_exam_rows = await pool.fetch(
        """
        SELECT c.id, c.chunk_index, c.section_title, c.page_number, c.content,
               m.title AS source_title, m.is_reference_material, m.reference_kind,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM document_chunks c
        JOIN study_materials m ON m.id = c.study_material_id
        JOIN study_materials selected ON selected.id = $2
        WHERE c.embedding IS NOT NULL
          AND selected.certification_id IS NOT NULL
          AND m.certification_id = selected.certification_id
          AND m.is_reference_material = TRUE
          AND m.reference_kind = 'past_exam'
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
        """,
        vector_literal(query_embedding),
        study_material_id,
        _past_exam_slots(top_k),
    )
    user_material_rows = await pool.fetch(
        """
        SELECT c.id, c.chunk_index, c.section_title, c.page_number, c.content,
               m.title AS source_title, m.is_reference_material, m.reference_kind,
               1 - (c.embedding <=> $1::vector) AS similarity
        FROM document_chunks c
        JOIN study_materials m ON m.id = c.study_material_id
        WHERE c.embedding IS NOT NULL
          AND c.study_material_id = $2
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3
        """,
        vector_literal(query_embedding),
        study_material_id,
        _user_material_slots(top_k),
    )
    standards = [
        item
        for item in results
        if item.get("reference_kind") == "exam_standard"
    ][:_official_standard_slots(top_k)]
    # 이미 확보한 공식 기준/기출 비율을 넘는 결과는 보충 후보에서 제외한다. 사용자의
    # 업로드 내용은 별도 확보한 뒤, 남은 자리를 의미 검색의 사용자 청크로 넓힌다.
    user_results = [item for item in results if not item.get("is_reference_material")]
    # 출제기준 → 기출 해설 → 사용자 자료/나머지 의미 검색 순서가 프롬프트에 그대로
    # 전달되어 모델이 각 자료의 역할을 혼동하지 않게 한다.
    return _merge_unique_chunks(
        [
            *standards,
            *[dict(row) for row in past_exam_rows],
            *[dict(row) for row in user_material_rows],
            *user_results,
        ],
        top_k,
    )


def _official_standard_slots(top_k: int) -> int:
    """검색 컨텍스트를 독점하지 않는 범위에서 출제기준에 할당할 최소 몫."""
    return min(3, max(1, top_k // 3))


def _past_exam_slots(top_k: int) -> int:
    """문제 생성 컨텍스트에서 기출 해설에 보장할 최소 청크 수."""
    return min(6, max(2, top_k // 3))


def _user_material_slots(top_k: int) -> int:
    """사용자 자료가 공통 참고 자료에 밀리지 않도록 확보할 최소 청크 수."""
    return min(4, max(2, top_k // 3))


def _prioritize_official_standard(
    results: list[dict], standard_results: list[dict], top_k: int
) -> list[dict]:
    """공식 출제기준을 먼저 배치하고 중복 없이 전체 검색 결과를 채운다."""
    return _merge_unique_chunks([*standard_results, *results], top_k)


def _merge_unique_chunks(chunks: list[dict], top_k: int) -> list[dict]:
    """출처별로 확보한 청크를 전달 순서대로 중복 없이 합친다."""
    selected: list[dict] = []
    seen_ids: set[str] = set()
    for chunk in chunks:
        chunk_id = str(chunk["id"])
        if chunk_id not in seen_ids:
            selected.append(chunk)
            seen_ids.add(chunk_id)
        if len(selected) == top_k:
            break
    return selected


def format_context(chunks: list[dict]) -> str:
    """검색된 청크를 LLM 컨텍스트 블록으로 조립."""
    blocks = []
    for c in chunks:
        header = f"(p.{c['page_number']}" + (f", {c['section_title']}" if c["section_title"] else "") + ")"
        source_title = c.get("source_title")
        if source_title:
            if c.get("reference_kind") == "exam_standard":
                source_type = "공식 출제기준"
            elif c.get("is_reference_material"):
                source_type = "공통 기출/참고 자료"
            else:
                source_type = "사용자 자료"
            source = f" | {source_type}: {source_title}"
        else:
            source = ""
        blocks.append(f"--- 발췌 {c['chunk_index']} {header}{source} ---\n{c['content']}")
    return "\n\n".join(blocks)

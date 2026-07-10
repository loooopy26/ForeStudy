"""AI 도서관 - 학습 자료 업로드/조회/검색."""

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi import Path as PathParam
from fastapi import Query

from config import settings
from db import get_or_create_demo_user, get_pool
from services import rag
from services.ingest import ingest_material

router = APIRouter(prefix="/api/materials", tags=["AI 도서관"])

_ALLOWED_EXTENSIONS = {".pdf": "pdf", ".ppt": "ppt", ".pptx": "ppt", ".docx": "docx", ".doc": "docx"}


def _parse_optional_uuid(value: str | None, field_name: str) -> str | None:
    """Swagger 멀티파트 폼은 빈 값도 ''/'string' 같은 문자열로 보낼 수 있어 None으로 정규화한다."""
    if value is None or value.strip() == "":
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(400, f"{field_name}는 올바른 UUID 형식이어야 합니다: {value!r}")


@router.get("")
async def list_materials(user_id: str | None = Query(None, description="필터링할 소유자 user_id(UUID). 비워두면 전체 조회")):
    """자료 목록 조회 (최신 업로드 순). 프론트 자료 선택 화면에서 사용."""
    pool = await get_pool()
    if user_id:
        rows = await pool.fetch(
            """
            SELECT id, title, file_type, processed_status, uploaded_at
            FROM study_materials WHERE user_id = $1 ORDER BY uploaded_at DESC
            """,
            user_id,
        )
    else:
        rows = await pool.fetch(
            "SELECT id, title, file_type, processed_status, uploaded_at FROM study_materials ORDER BY uploaded_at DESC"
        )
    return [dict(row) for row in rows]


@router.post("", status_code=202)
async def upload_material(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="업로드할 학습 자료 파일 (pdf/ppt/pptx/doc/docx)"),
    title: str | None = Form(None, description="자료 제목. 비워두면 파일명에서 확장자를 뺀 값을 사용"),
    user_id: str | None = Form(None, description="자료 소유자 user_id(UUID). 비워두면 데모 사용자로 처리"),
    certification_id: str | None = Form(None, description="연관된 자격증 id(UUID). 없으면 비워둠"),
):
    """자료 업로드. 202 반환 후 백그라운드에서 파싱→임베딩→요약 진행.
    processed_status가 'ready'가 될 때까지 GET /api/materials/{id} 로 폴링."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"지원하지 않는 파일 형식입니다: {ext} (pdf/ppt/pptx/doc/docx)")

    user_id = _parse_optional_uuid(user_id, "user_id")
    certification_id = _parse_optional_uuid(certification_id, "certification_id")

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            400,
            f"파일이 너무 큽니다 ({len(content) / 1024 / 1024:.1f}MB). "
            f"최대 {settings.max_upload_mb}MB까지 업로드할 수 있습니다.",
        )

    saved_path = settings.upload_dir / f"{uuid.uuid4().hex}{ext}"
    saved_path.write_bytes(content)

    pool = await get_pool()
    async with pool.acquire() as conn:
        if user_id is None:
            user_id = await get_or_create_demo_user(conn)
        row = await conn.fetchrow(
            """
            INSERT INTO study_materials (user_id, certification_id, title, file_url, file_type)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            """,
            user_id,
            certification_id,
            title or Path(file.filename or "자료").stem,
            str(saved_path),
            _ALLOWED_EXTENSIONS[ext],
        )
    material_id = str(row["id"])

    background_tasks.add_task(ingest_material, material_id, saved_path, title or file.filename or "자료")
    return {"material_id": material_id, "processed_status": "pending"}


@router.get("/{material_id}")
async def get_material(
    material_id: str = PathParam(..., description="조회할 자료의 id(UUID). POST /api/materials 응답의 material_id"),
):
    """자료 상태/요약/핵심개념 조회."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT m.id, m.title, m.file_type, m.processed_status, m.processing_stage, m.ai_summary,
               m.key_concepts, m.uploaded_at, m.processing_error,
               (SELECT count(*) FROM document_chunks c WHERE c.study_material_id = m.id) AS chunk_count
        FROM study_materials m WHERE m.id = $1
        """,
        material_id,
    )
    if row is None:
        raise HTTPException(404, "자료를 찾을 수 없습니다")
    result = dict(row)
    if result["key_concepts"]:
        result["key_concepts"] = json.loads(result["key_concepts"])
    return result


@router.delete("/{material_id}", status_code=204)
async def delete_material(
    material_id: str = PathParam(..., description="삭제할 자료의 id(UUID)"),
):
    """자료와 그로부터 생성된 요약/청크/퀴즈를 함께 삭제한다.
    (자격증 삭제 시 연결된 학습 자료를 정리하는 용도로도 쓰인다.)
    quizzes.study_material_id는 ON DELETE SET NULL이라 study_materials만 지우면
    퀴즈가 고아로 남는다 — 퀴즈부터 명시적으로 지운다.

    weak_point_reports/study_reports/tutor_chat_sessions/user_learning_profiles는 study_materials에
    대한 외래키가 없거나 ON DELETE SET NULL이라 그냥 두면 자료 연결만 끊긴 채 고아로 남는다 —
    weak_point_reports는 quizzes를 지우기 전에(quiz_attempts를 거쳐 조회해야 하므로) 먼저 지운다.
    tutor_chat_messages는 tutor_chat_sessions에 대한 ON DELETE CASCADE라 세션만 지우면 같이 지워진다."""
    pool = await get_pool()
    row = await pool.fetchrow("SELECT file_url FROM study_materials WHERE id = $1", material_id)
    if row is None:
        raise HTTPException(404, "자료를 찾을 수 없습니다")

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                DELETE FROM weak_point_reports
                WHERE source_quiz_attempt_id IN (
                    SELECT a.id FROM quiz_attempts a
                    JOIN quizzes q ON q.id = a.quiz_id
                    WHERE q.study_material_id = $1
                )
                """,
                material_id,
            )
            await conn.execute("DELETE FROM study_reports WHERE study_material_id = $1", material_id)
            await conn.execute("DELETE FROM tutor_chat_sessions WHERE study_material_id = $1", material_id)
            await conn.execute("DELETE FROM user_learning_profiles WHERE study_material_id = $1", material_id)
            await conn.execute("DELETE FROM quizzes WHERE study_material_id = $1", material_id)
            await conn.execute("DELETE FROM study_materials WHERE id = $1", material_id)

    if row["file_url"]:
        Path(row["file_url"]).unlink(missing_ok=True)
    return None


@router.get("/{material_id}/search")
async def search_material(
    material_id: str = PathParam(..., description="검색 대상 자료의 id(UUID)"),
    query: str = Query(..., description="검색할 질의문(자연어)"),
    top_k: int | None = Query(None, description="반환할 최대 청크 수. 비워두면 settings.rag_top_k 기본값 사용"),
):
    """자료 내 의미 검색 (RAG 검색 디버그/미리보기용)."""
    chunks = await rag.retrieve_chunks(material_id, query, top_k)
    return {"query": query, "chunks": chunks}

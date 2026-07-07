"""AI 도서관 - 학습 자료 업로드/조회/검색."""

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from config import settings
from db import get_or_create_demo_user, get_pool
from services import rag
from services.ingest import ingest_material

router = APIRouter(prefix="/api/materials", tags=["AI 도서관"])

_ALLOWED_EXTENSIONS = {".pdf": "pdf", ".ppt": "ppt", ".pptx": "ppt", ".docx": "docx", ".doc": "docx"}


@router.post("", status_code=202)
async def upload_material(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    user_id: str | None = Form(None),
    certification_id: str | None = Form(None),
):
    """자료 업로드. 202 반환 후 백그라운드에서 파싱→임베딩→요약 진행.
    processed_status가 'ready'가 될 때까지 GET /api/materials/{id} 로 폴링."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"지원하지 않는 파일 형식입니다: {ext} (pdf/ppt/pptx/doc/docx)")

    saved_path = settings.upload_dir / f"{uuid.uuid4().hex}{ext}"
    saved_path.write_bytes(await file.read())

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
async def get_material(material_id: str):
    """자료 상태/요약/핵심개념 조회."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT m.id, m.title, m.file_type, m.processed_status, m.ai_summary,
               m.key_concepts, m.uploaded_at,
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


@router.get("/{material_id}/search")
async def search_material(material_id: str, query: str, top_k: int | None = None):
    """자료 내 의미 검색 (RAG 검색 디버그/미리보기용)."""
    chunks = await rag.retrieve_chunks(material_id, query, top_k)
    return {"query": query, "chunks": chunks}

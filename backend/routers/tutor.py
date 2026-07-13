"""튜터 챗봇 (선생-학생) - 자료 발췌에 근거해 소크라테스식으로 지도."""

import io
import json
import logging
import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from PIL import Image, UnidentifiedImageError

from config import settings
from db import get_or_create_demo_user, get_pool
from services import rag, study_agent, upstage
from services.chunking import _element_text

router = APIRouter(prefix="/api/tutor", tags=["튜터 챗봇"])

_HISTORY_LIMIT = 20  # LLM에 넣을 최근 대화 수
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
_DOCUMENT_EXTENSIONS = {".pdf", ".ppt", ".pptx", ".doc", ".docx"}
_ATTACHMENT_EXTENSIONS = _IMAGE_EXTENSIONS | _DOCUMENT_EXTENSIONS


logger = logging.getLogger(__name__)

_IMAGE_FORMATS = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP"}
_MAX_TUTOR_IMAGE_PIXELS = 40_000_000
_MAX_OCR_CONTEXT_CHARS = 12_000


class SessionCreateRequest(BaseModel):
    study_material_id: str | None = None
    weak_point_report_id: str | None = None
    user_id: str | None = None


class MessageRequest(BaseModel):
    content: str


@router.post("/sessions", status_code=201)
async def create_session(req: SessionCreateRequest):
    """오늘의 학습 주제(curriculum_day) 단위로 세션을 재사용한다 — 화면을 나갔다
    다시 들어와도 오늘 나눈 대화가 사라지지 않도록. weak_point_report_id로 여는
    세션은 오답 1건에 대한 1회성 질문이라 재사용하지 않고 항상 새로 만든다."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = req.user_id or await get_or_create_demo_user(conn)
    plan_scope = await _load_today_plan_scope(pool, user_id, req.study_material_id)
    day_id = plan_scope["day_id"] if plan_scope else None

    existing = None
    if not req.weak_point_report_id:
        existing = await pool.fetchrow(
            """
            SELECT id FROM tutor_chat_sessions
            WHERE user_id = $1
              AND study_material_id IS NOT DISTINCT FROM $2
              AND curriculum_day_id IS NOT DISTINCT FROM $3
              AND weak_point_report_id IS NULL
            ORDER BY started_at DESC LIMIT 1
            """,
            user_id,
            req.study_material_id,
            day_id,
        )

    if existing:
        session_id = str(existing["id"])
    else:
        row = await pool.fetchrow(
            """
            INSERT INTO tutor_chat_sessions
                (user_id, study_material_id, weak_point_report_id, curriculum_day_id)
            VALUES ($1, $2, $3, $4) RETURNING id
            """,
            user_id,
            req.study_material_id,
            req.weak_point_report_id,
            day_id,
        )
        session_id = str(row["id"])
    return {"session_id": session_id, "plan_scope": plan_scope}


@router.get("/materials/{material_id}/history")
async def get_material_chat_history(material_id: str, user_id: str | None = None):
    """일별 학습 주제마다 나눴던 질문들을 다시 볼 수 있도록, 자료 하나에 대해
    실제로 메시지가 오간 세션만 날짜별로 묶어서 반환한다."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        resolved_user_id = user_id or await get_or_create_demo_user(conn)
    rows = await pool.fetch(
        """
        SELECT
            s.id AS session_id,
            s.curriculum_day_id,
            cd.day_date,
            cd.focus_topic,
            s.started_at,
            COUNT(m.id) AS message_count,
            MAX(m.created_at) AS last_message_at
        FROM tutor_chat_sessions s
        JOIN tutor_chat_messages m ON m.tutor_chat_session_id = s.id
        LEFT JOIN curriculum_days cd ON cd.id = s.curriculum_day_id
        WHERE s.user_id = $1 AND s.study_material_id = $2
        GROUP BY s.id, s.curriculum_day_id, cd.day_date, cd.focus_topic, s.started_at
        ORDER BY COALESCE(cd.day_date, s.started_at::date) DESC, s.started_at DESC
        """,
        resolved_user_id,
        material_id,
    )
    return {
        "sessions": [
            {
                "session_id": str(r["session_id"]),
                "day_id": str(r["curriculum_day_id"]) if r["curriculum_day_id"] else None,
                "date": (r["day_date"] or r["started_at"].date()).isoformat(),
                "focus_topic": r["focus_topic"],
                "message_count": r["message_count"],
                "last_message_at": r["last_message_at"].isoformat(),
            }
            for r in rows
        ]
    }


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, req: MessageRequest):
    pool = await get_pool()
    session = await _get_session_or_404(pool, session_id)

    plan_scope = await _load_today_plan_scope(
        pool, str(session["user_id"]), str(session["study_material_id"]) if session["study_material_id"] else None
    )
    context = await _rag_context(session, req.content, plan_scope)
    return await _stream_reply_and_persist(
        pool, session_id, user_content=req.content, context=context, plan_scope=plan_scope
    )


@router.post("/sessions/{session_id}/messages/image")
async def send_image_message(
    session_id: str,
    file: UploadFile = File(..., description="첨부할 파일 (이미지/pdf/ppt/doc)"),
    content: str = Form(""),
):
    """첨부 파일을 파싱해 텍스트를 추출하고, 그 내용에 대해 질문한다."""
    pool = await get_pool()
    session = await _get_session_or_404(pool, session_id)

    ext = _uploaded_attachment_ext(file.filename)
    attachment_bytes = await file.read()
    _validate_tutor_attachment(attachment_bytes, ext)
    saved_name = f"{uuid.uuid4().hex}{ext}"
    saved_path = settings.tutor_chat_images_dir / saved_name
    saved_path.write_bytes(attachment_bytes)
    image_url = f"/tutor-chat-images/{saved_name}"

    try:
        ocr_result = await upstage.parse_document(saved_path)
        ocr_text = "\n".join(
            text for element in ocr_result.get("elements", []) if (text := _element_text(element).strip())
        )
    except Exception as exc:  # noqa: BLE001
        saved_path.unlink(missing_ok=True)
        logger.exception("Tutor attachment parsing failed: session=%s file=%s", session_id, saved_name)
        raise HTTPException(
            502,
            "첨부 파일에서 텍스트를 읽는 데 실패했습니다. 잠시 후 다시 시도하거나, 파일이 손상되지 않았는지 확인해 주세요.",
        ) from exc

    ocr_text = _trim_ocr_text(ocr_text)
    if not ocr_text:
        saved_path.unlink(missing_ok=True)
        logger.warning("Tutor attachment contained no extractable text: session=%s file=%s", session_id, saved_name)
        raise HTTPException(
            422,
            "첨부 파일에서 읽을 수 있는 텍스트를 찾지 못했습니다. 글자가 선명한 이미지 또는 텍스트가 포함된 문서를 첨부해 주세요.",
        )

    user_text = content.strip() or "이 첨부 파일의 내용을 설명해줘"

    plan_scope = await _load_today_plan_scope(
        pool, str(session["user_id"]), str(session["study_material_id"]) if session["study_material_id"] else None
    )
    context = await _rag_context(session, user_text, plan_scope)
    ocr_section = f"[첨부 파일 추출 텍스트]\n{ocr_text}"
    context = f"{context}\n\n{ocr_section}" if context else ocr_section

    return await _stream_reply_and_persist(
        pool, session_id, user_content=user_text, context=context, plan_scope=plan_scope, image_url=image_url
    )


async def _get_session_or_404(pool, session_id: str):
    session = await pool.fetchrow(
        "SELECT id, user_id, study_material_id FROM tutor_chat_sessions WHERE id = $1", session_id
    )
    if session is None:
        raise HTTPException(404, "세션을 찾을 수 없습니다")
    return session


def _uploaded_attachment_ext(filename: str | None) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in _ATTACHMENT_EXTENSIONS:
        raise HTTPException(400, "png/jpg/webp/pdf/ppt/pptx/doc/docx 파일만 첨부할 수 있습니다.")
    return ext


def _validate_tutor_attachment(attachment_bytes: bytes, ext: str) -> None:
    if not attachment_bytes:
        raise HTTPException(400, "비어 있는 첨부 파일입니다.")
    max_mb = settings.tutor_chat_image_max_mb if ext in _IMAGE_EXTENSIONS else settings.max_upload_mb
    if len(attachment_bytes) > max_mb * 1024 * 1024:
        raise HTTPException(400, f"첨부 파일은 최대 {max_mb}MB까지 올릴 수 있습니다.")
    if ext not in _IMAGE_EXTENSIONS:
        return
    try:
        with Image.open(io.BytesIO(attachment_bytes)) as image:
            image.verify()
        with Image.open(io.BytesIO(attachment_bytes)) as image:
            if image.format != _IMAGE_FORMATS[ext]:
                raise HTTPException(400, "파일 확장자와 실제 이미지 형식이 일치하지 않습니다.")
            if image.width * image.height > _MAX_TUTOR_IMAGE_PIXELS:
                raise HTTPException(400, "사진 해상도가 너무 큽니다. 4천만 화소 이하의 이미지를 첨부해 주세요.")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(400, "손상되었거나 지원하지 않는 이미지 파일입니다.") from exc


def _trim_ocr_text(text: str) -> str:
    """Keep the useful beginning and end when a dense screenshot exceeds chat context."""
    normalized = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    if len(normalized) <= _MAX_OCR_CONTEXT_CHARS:
        return normalized
    head = normalized[:9_000]
    tail = normalized[-3_000:]
    return f"{head}\n\n[첨부 파일 텍스트 일부 생략]\n\n{tail}"


async def _rag_context(session, query_text: str, plan_scope: dict | None) -> str | None:
    """자료가 연결된 세션이면 사용자 발화 기준으로 관련 발췌를 검색한다."""
    if not session["study_material_id"]:
        return None
    query = " ".join(value for value in [_plan_query(plan_scope), query_text] if value)
    chunks = await rag.retrieve_chunks(str(session["study_material_id"]), query, top_k=4)
    return rag.format_context(chunks) if chunks else None


async def _stream_reply_and_persist(
    pool,
    session_id: str,
    *,
    user_content: str,
    context: str | None,
    plan_scope: dict | None,
    image_url: str | None = None,
) -> StreamingResponse:
    history_rows = await pool.fetch(
        """
        SELECT role, content FROM tutor_chat_messages
        WHERE tutor_chat_session_id = $1 ORDER BY created_at DESC LIMIT $2
        """,
        session_id,
        _HISTORY_LIMIT,
    )
    history = [{"role": r["role"], "content": r["content"]} for r in reversed(history_rows)]
    history.append({"role": "user", "content": user_content})

    async def event_stream():
        full_reply = ""
        try:
            async for delta in study_agent.tutor_reply_stream(history, context, plan_scope):
                full_reply += delta
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001 — 스트림 중간의 어떤 실패든 클라이언트에 알려야 한다
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
            return

        # 스트림이 끝까지 정상적으로 흐른 뒤에만 저장한다 — 중간에 끊기면 대화 기록에
        # 잘린 답변이 남지 않는다.
        await pool.executemany(
            """
            INSERT INTO tutor_chat_messages (tutor_chat_session_id, role, content, image_url)
            VALUES ($1, $2, $3, $4)
            """,
            [(session_id, "user", user_content, image_url), (session_id, "assistant", full_reply, None)],
        )
        yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


async def _load_today_plan_scope(pool, user_id: str, material_id: str | None) -> dict | None:
    """Return today's active curriculum day when it was generated from this material."""
    if not material_id:
        return None
    row = await pool.fetchrow(
        """
        SELECT cd.id, cd.day_date, cd.focus_topic, cd.tasks, cd.planned_minutes
        FROM curricula c
        JOIN user_cert_goals g ON g.id = c.user_cert_goal_id
        JOIN curriculum_weeks cw ON cw.curriculum_id = c.id
        JOIN curriculum_days cd ON cd.curriculum_week_id = cw.id
        JOIN quiz_attempts source_attempt ON source_attempt.id = c.source_quiz_attempt_id
        JOIN quizzes source_quiz ON source_quiz.id = source_attempt.quiz_id
        WHERE c.status = 'active'
          AND g.user_id = $1
          AND source_quiz.study_material_id = $2
          AND cd.day_date = $3
        ORDER BY c.created_at DESC
        LIMIT 1
        """,
        user_id,
        material_id,
        date.today(),
    )
    if row is None:
        return None
    tasks = row["tasks"]
    if isinstance(tasks, str):
        try:
            tasks = json.loads(tasks)
        except json.JSONDecodeError:
            tasks = []
    return {
        "day_id": str(row["id"]),
        "date": row["day_date"].isoformat(),
        "focus_topic": row["focus_topic"] or "",
        "planned_minutes": row["planned_minutes"],
        "tasks": [str(task) for task in tasks] if isinstance(tasks, list) else [],
    }


def _plan_query(plan_scope: dict | None) -> str:
    if not plan_scope:
        return ""
    return " ".join(
        value.strip()
        for value in [plan_scope.get("focus_topic", ""), *(plan_scope.get("tasks") or [])]
        if isinstance(value, str) and value.strip()
    )


@router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT role, content, image_url, created_at FROM tutor_chat_messages
        WHERE tutor_chat_session_id = $1 ORDER BY created_at
        """,
        session_id,
    )
    return {"messages": [dict(r) for r in rows]}

"""튜터 챗봇 (선생-학생) - 자료 발췌에 근거해 소크라테스식으로 지도."""

import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import graph as agent_graph
from db import get_or_create_demo_user, get_pool
from services import rag

router = APIRouter(prefix="/api/tutor", tags=["튜터 챗봇"])

_HISTORY_LIMIT = 20  # LLM에 넣을 최근 대화 수


class SessionCreateRequest(BaseModel):
    study_material_id: str | None = None
    weak_point_report_id: str | None = None
    user_id: str | None = None


class MessageRequest(BaseModel):
    content: str


@router.post("/sessions", status_code=201)
async def create_session(req: SessionCreateRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = req.user_id or await get_or_create_demo_user(conn)
        row = await conn.fetchrow(
            """
            INSERT INTO tutor_chat_sessions (user_id, study_material_id, weak_point_report_id)
            VALUES ($1, $2, $3) RETURNING id
            """,
            user_id,
            req.study_material_id,
            req.weak_point_report_id,
        )
    plan_scope = await _load_today_plan_scope(pool, user_id, req.study_material_id)
    return {"session_id": str(row["id"]), "plan_scope": plan_scope}


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, req: MessageRequest):
    pool = await get_pool()
    session = await pool.fetchrow(
        "SELECT id, user_id, study_material_id FROM tutor_chat_sessions WHERE id = $1", session_id
    )
    if session is None:
        raise HTTPException(404, "세션을 찾을 수 없습니다")

    history_rows = await pool.fetch(
        """
        SELECT role, content FROM tutor_chat_messages
        WHERE tutor_chat_session_id = $1 ORDER BY created_at DESC LIMIT $2
        """,
        session_id,
        _HISTORY_LIMIT,
    )
    history = [{"role": r["role"], "content": r["content"]} for r in reversed(history_rows)]
    history.append({"role": "user", "content": req.content})

    # 자료가 연결된 세션이면 사용자 발화 기준으로 관련 발췌 검색
    plan_scope = await _load_today_plan_scope(
        pool, str(session["user_id"]), str(session["study_material_id"]) if session["study_material_id"] else None
    )
    context = None
    if session["study_material_id"]:
        query = " ".join(value for value in [_plan_query(plan_scope), req.content] if value)
        chunks = await rag.retrieve_chunks(str(session["study_material_id"]), query, top_k=4)
        if chunks:
            context = rag.format_context(chunks)

    reply = await agent_graph.run_tutor_reply(history, context, plan_scope)

    await pool.executemany(
        """
        INSERT INTO tutor_chat_messages (tutor_chat_session_id, role, content)
        VALUES ($1, $2, $3)
        """,
        [(session_id, "user", req.content), (session_id, "assistant", reply)],
    )
    return {"reply": reply}


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
        SELECT role, content, created_at FROM tutor_chat_messages
        WHERE tutor_chat_session_id = $1 ORDER BY created_at
        """,
        session_id,
    )
    return {"messages": [dict(r) for r in rows]}

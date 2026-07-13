"""도서관 공부 타이머 영속화 서비스.

담당 탭: 도서관 화면, 공부 시작/이탈 정지/공부 종료.
로그인 계정(UUID)을 기준으로 Postgres study_sessions/study_session_interruptions에 저장한다
(예전에는 SQLite에 정수 데모 유저 id로 저장해 로그인 계정과 무관하게 데이터가 섞였다).
"""

import asyncpg
from fastapi import HTTPException

from db import get_pool
from services.auth_service import grant_quest_reward


async def start_timer(user_id: str, material_id: str | None = None) -> dict:
    pool = await get_pool()
    try:
        row = await pool.fetchrow(
            """
            INSERT INTO study_sessions (user_id, study_material_id, status)
            VALUES ($1, $2, 'active')
            RETURNING id, user_id, started_at, status
            """,
            user_id,
            material_id,
        )
    except (asyncpg.DataError, asyncpg.ForeignKeyViolationError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="User not found") from exc
    return {
        "session_id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "started_at": row["started_at"],
        "status": row["status"],
    }


async def pause_timer(session_id: str, segment_minutes: int, reason: str) -> dict:
    pool = await get_pool()
    session = await _get_active_session(pool, session_id)
    paused_row = await pool.fetchrow(
        """
        INSERT INTO study_session_interruptions (study_session_id, paused_at, segment_minutes, reason)
        VALUES ($1, now(), $2, $3)
        RETURNING paused_at
        """,
        session_id,
        segment_minutes,
        reason,
    )
    total_studied_minutes = await pool.fetchval(
        "SELECT COALESCE(SUM(segment_minutes), 0) FROM study_session_interruptions WHERE study_session_id = $1",
        session_id,
    )
    await pool.execute("UPDATE study_sessions SET status = 'paused' WHERE id = $1", session_id)
    return {
        "session_id": str(session["id"]),
        "user_id": str(session["user_id"]),
        "paused_at": paused_row["paused_at"],
        "segment_minutes": segment_minutes,
        "total_studied_minutes": int(total_studied_minutes),
        "status": "paused",
        "reason": reason,
    }


async def end_timer(session_id: str, studied_minutes: int, max_uninterrupted_minutes: int) -> dict:
    pool = await get_pool()
    session = await _get_active_session(pool, session_id)

    reward_dotori = 30 if studied_minutes >= 40 else 10 if studied_minutes > 0 else 0
    row = await pool.fetchrow(
        """
        UPDATE study_sessions
        SET ended_at = now(), studied_minutes = $1, max_uninterrupted_minutes = $2,
            reward_dotori = $3, status = 'completed'
        WHERE id = $4
        RETURNING id, user_id, started_at, ended_at, studied_minutes, max_uninterrupted_minutes,
                  reward_dotori, status
        """,
        studied_minutes,
        max_uninterrupted_minutes,
        reward_dotori,
        session_id,
    )

    if reward_dotori > 0:
        # 기존 SQLite reward_service.add_reward(token=exp)와 동일하게 exp == 도토리 지급량으로 맞춘다.
        await grant_quest_reward(str(row["user_id"]), reward_dotori, reward_dotori)

    return {
        "session_id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "started_at": row["started_at"],
        "ended_at": row["ended_at"],
        "studied_minutes": row["studied_minutes"],
        "max_uninterrupted_minutes": row["max_uninterrupted_minutes"],
        "reward_token": row["reward_dotori"],
        "status": row["status"],
        "final_quiz_recommended": row["studied_minutes"] > 0,
        "next_action": "POST /api/materials/{material_id}/review-quiz to create a post-study review quiz.",
    }


async def _get_active_session(pool: asyncpg.Pool, session_id: str) -> asyncpg.Record:
    try:
        row = await pool.fetchrow(
            "SELECT id, user_id, status FROM study_sessions WHERE id = $1",
            session_id,
        )
    except (asyncpg.DataError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Timer session not found") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="Timer session not found")
    if row["status"] not in ("active", "paused"):
        raise HTTPException(status_code=400, detail="Timer session is not active")
    return row

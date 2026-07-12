"""Timer persistence service.

Screen: library study timer.
Role: 프론트에서 측정한 타이머 값을 받아 저장만 한다 (경과 시간 계산은 하지 않음).
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import StudySession, StudySessionInterruption
from services.memory_store import mark_activity, now_utc
from services.reward_service import add_reward


def start_timer(db: Session, user_id: int, material_id: str | None = None) -> dict:
    session = StudySession(user_id=user_id, material_id=material_id, started_at=now_utc(), status="started")
    db.add(session)
    db.commit()
    db.refresh(session)

    mark_activity(user_id)
    return _to_start_response(session)


def pause_timer(db: Session, session_id: int, segment_minutes: int, reason: str) -> dict:
    session = _get_active_session(db, session_id)
    paused_at = now_utc()

    interruption = StudySessionInterruption(
        study_session_id=session.id,
        interrupted_at=paused_at,
        segment_minutes=segment_minutes,
        reason=reason,
    )
    db.add(interruption)
    db.commit()
    db.refresh(session)

    total_studied_minutes = sum(item.segment_minutes for item in session.interruptions)
    return {
        "session_id": session.id,
        "user_id": session.user_id,
        "paused_at": paused_at,
        "segment_minutes": segment_minutes,
        "total_studied_minutes": total_studied_minutes,
        "status": "paused",
        "reason": reason,
    }


def end_timer(db: Session, session_id: int, studied_minutes: int, max_uninterrupted_minutes: int) -> dict:
    session = _get_active_session(db, session_id)

    reward_token = 30 if studied_minutes >= 40 else 10 if studied_minutes > 0 else 0
    session.ended_at = now_utc()
    session.studied_minutes = studied_minutes
    session.max_uninterrupted_minutes = max_uninterrupted_minutes
    session.reward_token = reward_token
    session.status = "ended"
    db.commit()
    db.refresh(session)

    achievement = "Focused study 40 minutes" if studied_minutes >= 40 else "First study completed"
    add_reward(session.user_id, reward_token, achievement if studied_minutes > 0 else None)
    mark_activity(session.user_id)
    return _to_end_response(session)


def _get_active_session(db: Session, session_id: int) -> StudySession:
    session = db.get(StudySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Timer session not found")
    if session.status == "ended":
        raise HTTPException(status_code=400, detail="Timer session is not active")
    return session


def _to_start_response(session: StudySession) -> dict:
    return {
        "session_id": session.id,
        "user_id": session.user_id,
        "started_at": session.started_at,
        "status": session.status,
    }


def _to_end_response(session: StudySession) -> dict:
    return {
        "session_id": session.id,
        "user_id": session.user_id,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "studied_minutes": session.studied_minutes,
        "max_uninterrupted_minutes": session.max_uninterrupted_minutes,
        "reward_token": session.reward_token,
        "status": session.status,
        "final_quiz_recommended": session.studied_minutes > 0,
        "next_action": "POST /api/materials/{material_id}/review-quiz to create a post-study review quiz.",
    }

"""Timer persistence service.

Screen: library study timer.
Role: save timer starts, interruption events, and completed study sessions.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import StudySession, StudySessionInterruption
from services.memory_store import mark_activity, now_utc
from services.reward_service import add_reward


def start_timer(db: Session, user_id: int) -> dict:
    session = StudySession(user_id=user_id, started_at=now_utc(), status="started")
    db.add(session)
    db.commit()
    db.refresh(session)

    mark_activity(user_id)
    return _to_start_response(session)


def pause_timer(db: Session, session_id: int, reason: str) -> dict:
    session = _get_active_session(db, session_id)
    paused_at = now_utc()
    segment_minutes = _minutes_between(_latest_segment_started_at(session), paused_at)

    interruption = StudySessionInterruption(
        study_session_id=session.id,
        interrupted_at=paused_at,
        segment_minutes=segment_minutes,
        reason=reason,
    )
    db.add(interruption)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "user_id": session.user_id,
        "paused_at": paused_at,
        "studied_minutes": _elapsed_minutes(session, paused_at),
        "status": "paused",
        "reason": reason,
    }


def end_timer(db: Session, session_id: int, studied_minutes: int | None = None) -> dict:
    session = _get_active_session(db, session_id)
    ended_at = now_utc()
    if studied_minutes is None:
        studied_minutes = _elapsed_minutes(session, ended_at)

    reward_token = 30 if studied_minutes >= 40 else 10 if studied_minutes > 0 else 0
    session.ended_at = ended_at
    session.studied_minutes = studied_minutes
    session.max_uninterrupted_minutes = _completed_uninterrupted_minutes(session, ended_at, studied_minutes)
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


def _minutes_between(started_at: datetime, ended_at: datetime) -> int:
    return max(0, int((ended_at - started_at).total_seconds() // 60))


def _elapsed_minutes(session: StudySession, ended_at: datetime) -> int:
    return _minutes_between(session.started_at, ended_at)


def _latest_segment_started_at(session: StudySession) -> datetime:
    if not session.interruptions:
        return session.started_at
    return session.interruptions[-1].interrupted_at


def _max_uninterrupted_minutes(session: StudySession, ended_at: datetime) -> int:
    segment_minutes = [interruption.segment_minutes for interruption in session.interruptions]
    segment_minutes.append(_minutes_between(_latest_segment_started_at(session), ended_at))
    return max(segment_minutes, default=0)


def _completed_uninterrupted_minutes(
    session: StudySession,
    ended_at: datetime,
    studied_minutes: int,
) -> int:
    if not session.interruptions:
        return studied_minutes
    return _max_uninterrupted_minutes(session, ended_at)


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

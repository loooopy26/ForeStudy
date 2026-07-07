from fastapi import HTTPException

from services import memory_store
from services.memory_store import mark_activity, now_utc, study_logs, timer_sessions
from services.reward_service import add_reward


def start_timer(user_id: int) -> dict:
    # 도서관 화면에서 "공부 시작"을 눌렀을 때 호출됩니다.
    session_id = memory_store.next_timer_session_id
    memory_store.next_timer_session_id += 1

    session = {
        "session_id": session_id,
        "user_id": user_id,
        "started_at": now_utc(),
        "status": "started",
    }
    timer_sessions[session_id] = session
    mark_activity(user_id)
    return session


def pause_timer(session_id: int, reason: str) -> dict:
    # 사이트 이탈, 다른 활동 전환 등으로 공부 시간이 멈출 때 호출됩니다.
    session = _get_active_session(session_id)
    paused_at = now_utc()
    studied_minutes = int((paused_at - session["started_at"]).total_seconds() // 60)

    paused = {
        **session,
        "paused_at": paused_at,
        "studied_minutes": studied_minutes,
        "status": "paused",
        "reason": reason,
    }
    timer_sessions[session_id] = paused
    return paused


def end_timer(session_id: int, studied_minutes: int | None = None) -> dict:
    # 공부 종료 시 호출되며, 보상을 지급하고 마무리 퀴즈 생성을 안내합니다.
    session = _get_active_session(session_id)
    ended_at = now_utc()
    if studied_minutes is None:
        studied_minutes = int((ended_at - session["started_at"]).total_seconds() // 60)

    reward_token = 30 if studied_minutes >= 40 else 10 if studied_minutes > 0 else 0
    log = {
        **session,
        "ended_at": ended_at,
        "studied_minutes": studied_minutes,
        "reward_token": reward_token,
        "status": "ended",
        "final_quiz_recommended": studied_minutes > 0,
        "next_action": "POST /quiz/generate 로 마무리 퀴즈를 생성하세요.",
    }

    study_logs.append(log)
    timer_sessions[session_id] = log

    achievement = "집중 학습 40분 달성" if studied_minutes >= 40 else "첫 공부 완료"
    add_reward(session["user_id"], reward_token, achievement if studied_minutes > 0 else None)
    mark_activity(session["user_id"])
    return log


def _get_active_session(session_id: int) -> dict:
    # 이미 종료/정지된 타이머를 중복 처리하지 않도록 공통 검증합니다.
    if session_id not in timer_sessions:
        raise HTTPException(status_code=404, detail="Timer session not found")
    if timer_sessions[session_id]["status"] in {"ended", "paused"}:
        raise HTTPException(status_code=400, detail="Timer session is not active")
    return timer_sessions[session_id]

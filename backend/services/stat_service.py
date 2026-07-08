"""User stat calculation service.

Screen: status and growth reports.
Role: calculate focus, comprehension, persistence, and growth score.

이해도/합격 가능성은 실제로 동작 중인 AI 퀴즈 결과(Postgres quiz_attempts)를 근거로
계산한다. SQLite 쪽 quiz_results 테이블은 어떤 화면도 채워 넣지 않는 값이라 제외했다.
"""

from datetime import date

from sqlalchemy.orm import Session

from db import get_or_create_demo_user, get_pool
from models import StudySession
from services.memory_store import get_current_streak_days

_RECENT_QUIZ_LIMIT = 5


async def get_user_stats(db: Session, user_id: int) -> dict:
    ended_sessions = (
        db.query(StudySession)
        .filter(StudySession.user_id == user_id, StudySession.status == "ended")
        .order_by(StudySession.ended_at.desc())
        .all()
    )

    total_study_minutes = sum(session.studied_minutes for session in ended_sessions)
    best_uninterrupted_minutes = max(
        (session.max_uninterrupted_minutes for session in ended_sessions),
        default=0,
    )
    current_streak_days = _current_streak_days_from_sessions(ended_sessions) or get_current_streak_days(user_id)
    recent_scores = await _recent_quiz_scores()
    recent_quiz_average = round(sum(recent_scores) / len(recent_scores), 2) if recent_scores else 0

    focus = min(100, best_uninterrupted_minutes // 3)
    comprehension = int(recent_quiz_average)
    persistence = min(100, current_streak_days * 10)
    pass_rate = recent_quiz_average
    growth_score = int((focus + comprehension + persistence + pass_rate) / 4)

    if total_study_minutes == 0 and not recent_scores:
        ai_feedback = "아직 학습 데이터가 부족합니다. 타이머로 공부를 기록하고 퀴즈를 진행해보세요."
    elif focus >= 80:
        ai_feedback = "끊기지 않고 집중한 시간이 좋습니다. 지금 리듬을 유지해도 좋습니다."
    elif pass_rate >= 80:
        ai_feedback = "최근 퀴즈 성과가 좋습니다. 무중단 공부 시간을 조금 더 늘려보세요."
    else:
        ai_feedback = "학습 시간과 오답 복습 퀘스트를 함께 진행해보세요."

    return {
        "user_id": user_id,
        "focus": focus,
        "comprehension": comprehension,
        "persistence": persistence,
        "growth_score": growth_score,
        "pass_rate": pass_rate,
        "total_study_minutes": total_study_minutes,
        "current_streak_days": current_streak_days,
        "recent_quiz_average": recent_quiz_average,
        "ai_feedback": ai_feedback,
    }


async def _recent_quiz_scores() -> list[float]:
    """AI 도서관 데모 유저 기준으로 최근 제출된 퀴즈 점수를 가져온다."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        demo_user_id = await get_or_create_demo_user(conn)
        rows = await conn.fetch(
            """
            SELECT score_pct FROM quiz_attempts
            WHERE user_id = $1 AND submitted_at IS NOT NULL
            ORDER BY submitted_at DESC LIMIT $2
            """,
            demo_user_id,
            _RECENT_QUIZ_LIMIT,
        )
    return [float(row["score_pct"]) for row in rows if row["score_pct"] is not None]


def _current_streak_days_from_sessions(sessions: list[StudySession]) -> int:
    days = {session.ended_at.date() for session in sessions if session.ended_at is not None}
    if not days:
        return 0

    streak = 0
    cursor = date.today()
    while cursor in days:
        streak += 1
        cursor = date.fromordinal(cursor.toordinal() - 1)
    return streak

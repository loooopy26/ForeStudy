"""Deterministic status scores for the home dashboard."""

from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from db import get_or_create_demo_user, get_pool
from models import StudySession
from services.memory_store import get_current_streak_days

_RECENT_QUIZ_LIMIT = 5
_RECENT_STUDY_LIMIT = 10


async def get_user_stats(db: Session, user_id: int, material_id: str | None = None) -> dict:
    sessions_query = (
        db.query(StudySession)
        .filter(StudySession.user_id == user_id, StudySession.status == "ended")
    )
    if material_id:
        sessions_query = sessions_query.filter(StudySession.material_id == material_id)
    ended_sessions = sessions_query.order_by(StudySession.ended_at.desc()).all()

    total_study_minutes = sum(session.studied_minutes for session in ended_sessions)
    current_streak_days = _current_streak_days_from_sessions(ended_sessions) or get_current_streak_days(user_id)
    focus = _calculate_focus(ended_sessions)
    quiz_metrics = await _get_quiz_metrics(material_id)
    comprehension = _calculate_comprehension(quiz_metrics)
    plan_metrics = await _get_plan_completion_metrics(ended_sessions, material_id)
    persistence = _calculate_persistence(current_streak_days, plan_metrics)
    pass_rate = round(focus * 0.25 + comprehension * 0.45 + persistence * 0.30, 2)
    growth_score = round((focus + comprehension + persistence + pass_rate) / 4)

    if total_study_minutes == 0 and quiz_metrics["attempt_count"] == 0:
        feedback = "학습 기록을 쌓으면 상태 점수가 계산됩니다."
    elif plan_metrics["eligible_days"] and plan_metrics["completed_days"] == 0:
        feedback = "오늘의 목표 시간, AI 퀴즈, 오답 복습까지 마치면 일별 플랜이 완료됩니다."
    elif comprehension < 60:
        feedback = "AI 퀴즈와 오답 복습을 함께 진행해 이해도를 높여보세요."
    elif focus < 60:
        feedback = "중단 없이 이어서 공부한 시간이 늘수록 집중력이 올라갑니다."
    else:
        feedback = "꾸준한 학습 흐름이 잘 유지되고 있습니다."

    return {
        "user_id": user_id,
        "focus": focus,
        "comprehension": comprehension,
        "persistence": persistence,
        "growth_score": growth_score,
        "pass_rate": pass_rate,
        "total_study_minutes": total_study_minutes,
        "current_streak_days": current_streak_days,
        "recent_quiz_average": quiz_metrics["recent_quiz_average"],
        "ai_feedback": feedback,
    }


def _calculate_focus(sessions: list[StudySession]) -> int:
    """Use recent continuous-study time and recorded interruptions."""
    recent_sessions = sessions[:_RECENT_STUDY_LIMIT]
    if not recent_sessions:
        return 0

    scores = []
    for session in recent_sessions:
        continuous_score = min(100, round(session.max_uninterrupted_minutes / 40 * 100))
        interruption_penalty = max(0, len(session.interruptions) - 1) * 8
        scores.append(max(0, continuous_score - interruption_penalty))
    return round(sum(scores) / len(scores))


def _calculate_comprehension(metrics: dict) -> int:
    if metrics["attempt_count"] == 0:
        return 0
    if metrics["wrong_note_count"] == 0:
        return round(metrics["recent_quiz_average"])
    return round(metrics["recent_quiz_average"] * 0.7 + metrics["mastered_wrong_note_rate"] * 0.3)


def _calculate_persistence(current_streak_days: int, plan_metrics: dict) -> int:
    attendance_score = min(100, current_streak_days * 20)
    return round(attendance_score * 0.5 + plan_metrics["completion_rate"] * 0.5)


async def _get_quiz_metrics(material_id: str | None = None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        demo_user_id = await get_or_create_demo_user(conn)
        row = await conn.fetchrow(
            """
            WITH recent_attempts AS (
                SELECT score_pct
                FROM quiz_attempts a
                JOIN quizzes q ON q.id = a.quiz_id
                WHERE a.user_id = $1 AND a.submitted_at IS NOT NULL
                  AND ($3::uuid IS NULL OR q.study_material_id = $3::uuid)
                ORDER BY a.submitted_at DESC
                LIMIT $2
            ), notes AS (
                SELECT n.status
                FROM wrong_answer_notes n
                JOIN quiz_attempts a ON a.id = n.quiz_attempt_id
                JOIN quizzes q ON q.id = a.quiz_id
                WHERE a.user_id = $1 AND a.submitted_at IS NOT NULL
                  AND ($3::uuid IS NULL OR q.study_material_id = $3::uuid)
            )
            SELECT
                COALESCE((SELECT AVG(score_pct) FROM recent_attempts), 0) AS recent_quiz_average,
                (SELECT COUNT(*) FROM recent_attempts) AS attempt_count,
                (SELECT COUNT(*) FROM notes) AS wrong_note_count,
                (SELECT COUNT(*) FROM notes WHERE status = 'mastered') AS mastered_wrong_note_count
            """,
            demo_user_id,
            _RECENT_QUIZ_LIMIT,
            material_id,
        )

    wrong_note_count = int(row["wrong_note_count"] or 0)
    mastered_count = int(row["mastered_wrong_note_count"] or 0)
    return {
        "recent_quiz_average": round(float(row["recent_quiz_average"] or 0), 2),
        "attempt_count": int(row["attempt_count"] or 0),
        "wrong_note_count": wrong_note_count,
        "mastered_wrong_note_rate": round(mastered_count / wrong_note_count * 100, 2) if wrong_note_count else 0,
    }


async def _get_plan_completion_metrics(sessions: list[StudySession], material_id: str | None = None) -> dict:
    """A plan completes after planned study, quiz submission, and zero unresolved notes."""
    study_minutes_by_day = defaultdict(int)
    for session in sessions:
        if session.ended_at is not None:
            study_minutes_by_day[session.ended_at.date()] += session.studied_minutes

    pool = await get_pool()
    async with pool.acquire() as conn:
        demo_user_id = await get_or_create_demo_user(conn)
        rows = await conn.fetch(
            """
            WITH active_days AS (
                SELECT cd.id, cd.day_date, COALESCE(cd.planned_minutes, 0) AS planned_minutes
                FROM curricula c
                JOIN user_cert_goals g ON g.id = c.user_cert_goal_id
                JOIN curriculum_weeks cw ON cw.curriculum_id = c.id
                JOIN curriculum_days cd ON cd.curriculum_week_id = cw.id
                JOIN quiz_attempts source_attempt ON source_attempt.id = c.source_quiz_attempt_id
                JOIN quizzes source_quiz ON source_quiz.id = source_attempt.quiz_id
                WHERE c.status = 'active'
                  AND g.user_id = $1
                  AND ($2::uuid IS NULL OR source_quiz.study_material_id = $2::uuid)
                  AND cd.day_date BETWEEN CURRENT_DATE - INTERVAL '6 days' AND CURRENT_DATE
            )
            SELECT
                d.day_date,
                d.planned_minutes,
                EXISTS (
                    SELECT 1
                    FROM quizzes q
                    JOIN quiz_attempts a ON a.quiz_id = q.id
                    WHERE q.curriculum_day_id = d.id
                      AND a.user_id = $1
                      AND a.submitted_at IS NOT NULL
                ) AS quiz_submitted,
                NOT EXISTS (
                    SELECT 1
                    FROM wrong_answer_notes n
                    JOIN quiz_attempts a ON a.id = n.quiz_attempt_id
                    JOIN quizzes q ON q.id = a.quiz_id
                    WHERE q.curriculum_day_id = d.id
                      AND a.user_id = $1
                      AND a.submitted_at IS NOT NULL
                      AND n.status <> 'mastered'
                ) AS all_wrong_notes_mastered
            FROM active_days d
            ORDER BY d.day_date
            """,
            demo_user_id,
            material_id,
        )

    if not rows:
        return {"completed_days": 0, "eligible_days": 0, "completion_rate": 0}

    completed_days = sum(
        1
        for row in rows
        if study_minutes_by_day[row["day_date"]] >= int(row["planned_minutes"] or 0)
        and row["quiz_submitted"]
        and row["all_wrong_notes_mastered"]
    )
    return {
        "completed_days": completed_days,
        "eligible_days": len(rows),
        "completion_rate": round(completed_days / len(rows) * 100),
    }


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

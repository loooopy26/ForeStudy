"""사용자 능력치 계산 서비스.

담당 탭: 상태창, AI 분석 리포트.
역할: 집중력, 이해도, 학습 지속성, 성장도, 현재 합격률 계산.
"""

from services.memory_store import get_current_streak_days, quiz_results, study_logs


def get_user_stats(user_id: int) -> dict:
    # 사용자 능력치 계산 기준:
    # 집중력 = 누적 공부 시간, 이해도/합격률 = 최근 퀴즈 평균, 지속성 = 연속 활동일
    user_study_logs = [log for log in study_logs if log["user_id"] == user_id]
    user_quiz_results = [result for result in quiz_results if result["user_id"] == user_id]

    total_study_minutes = sum(log["studied_minutes"] for log in user_study_logs)
    current_streak_days = get_current_streak_days(user_id)
    recent_scores = [result["score_percent"] for result in user_quiz_results[-5:]]
    recent_quiz_average = round(sum(recent_scores) / len(recent_scores), 2) if recent_scores else 0

    focus = min(100, total_study_minutes // 3)
    comprehension = int(recent_quiz_average)
    persistence = min(100, current_streak_days * 10)
    pass_rate = recent_quiz_average
    growth_score = int((focus + comprehension + persistence + pass_rate) / 4)

    if total_study_minutes == 0 and not user_quiz_results:
        ai_feedback = "아직 학습 데이터가 부족합니다. 타이머와 퀴즈를 먼저 진행해보세요."
    elif pass_rate >= 80:
        ai_feedback = "최근 퀴즈 성과가 좋습니다. 기출 문제 풀이 비중을 늘려도 좋습니다."
    else:
        ai_feedback = "학습 시간은 쌓이고 있습니다. 오답 복습 퀘스트를 함께 진행해보세요."

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

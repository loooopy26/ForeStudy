"""홈/상태창 요약 데이터 조합 서비스.

담당 탭: 홈 화면.
역할: 보상, 능력치, 오늘의 퀘스트 요약을 한 번에 반환.
"""

from services.reward_service import get_rewards
from services.stat_service import get_user_stats
from sqlalchemy.orm import Session

_FALLBACK_STATS = {
    "focus": 0, "comprehension": 0, "persistence": 0, "growth_score": 0,
    "pass_rate": 0, "total_study_minutes": 0, "current_streak_days": 0,
    "recent_quiz_average": 0, "ai_feedback": "",
}


async def get_dashboard(db: Session, user_id: int) -> dict:
    rewards = get_rewards(user_id)
    # 이 라우터는 실제 로그인 계정(Postgres UUID)이 아니라 예전 SQLite 데모 유저(정수 id)
    # 기준이라 get_user_stats(Postgres UUID 기준)와 맞지 않는다 — 프론트에서 쓰이지 않는
    # 화면이라 정수 id를 UUID로 억지로 맞추는 대신, 조회가 안 되면 빈 값으로 대체한다.
    try:
        stats = await get_user_stats(user_id=str(user_id))
    except Exception:
        stats = _FALLBACK_STATS

    return {
        "user_id": user_id,
        "nickname": "성실한 학습자",
        "level": rewards["level"],
        "exp": rewards["exp"],
        "next_level_exp": rewards["level"] * 100,
        "token": rewards["token"],
        "gem": 320,
        "streak_days": stats["current_streak_days"],
        "stats": stats,
        "today_quest": {
            "title": "데이터베이스 개념 복습",
            "target_minutes": 40,
            "progress_percent": min(100, round((stats["total_study_minutes"] / 40) * 100, 2)),
            "exp_reward": 150,
            "token_reward": 80,
        },
    }

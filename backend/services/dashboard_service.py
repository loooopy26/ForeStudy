from services.reward_service import get_rewards
from services.stat_service import get_user_stats


def get_dashboard(user_id: int) -> dict:
    rewards = get_rewards(user_id)
    stats = get_user_stats(user_id)

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

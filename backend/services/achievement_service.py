from services.memory_store import get_current_streak_days, quest_results, quiz_results


def get_achievements(user_id: int) -> list[dict]:
    streak_days = get_current_streak_days(user_id)
    completed_quests = len(
        [result for result in quest_results if result["user_id"] == user_id and result["completed"]]
    )
    perfect_quizzes = len(
        [result for result in quiz_results if result["user_id"] == user_id and result["score_percent"] == 100]
    )

    return [
        {
            "title": "7일 연속 학습",
            "description": "7일 연속으로 학습하기",
            "progress_current": min(streak_days, 7),
            "progress_target": 7,
            "completed": streak_days >= 7,
            "reward_token": 0,
        },
        {
            "title": "첫 퀘스트 완료",
            "description": "퀘스트 1회 완료하기",
            "progress_current": min(completed_quests, 1),
            "progress_target": 1,
            "completed": completed_quests >= 1,
            "reward_token": 0,
        },
        {
            "title": "퀴즈 만점",
            "description": "마무리 퀴즈를 모두 맞히기",
            "progress_current": min(perfect_quizzes, 1),
            "progress_target": 1,
            "completed": perfect_quizzes >= 1,
            "reward_token": 100,
        },
        {
            "title": "30일 연속 학습",
            "description": "30일 연속으로 학습하기",
            "progress_current": min(streak_days, 30),
            "progress_target": 30,
            "completed": streak_days >= 30,
            "reward_token": 100,
        },
    ]

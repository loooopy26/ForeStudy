from schemas import QuestResponse


def generate_daily_quests(user_id: int, goal_id: int) -> list[QuestResponse]:
    """Return MVP dummy quests before AI and DB integration."""
    return [
        QuestResponse(
            title="오늘 40분 이상 공부하기",
            description="도서관 타이머를 켜고 40분 이상 집중 학습을 진행하세요.",
            quest_type="study_time",
            target_value=40,
            reward_token=30,
        ),
        QuestResponse(
            title="마무리 퀴즈 5문제 풀기",
            description="오늘 학습한 내용을 바탕으로 퀴즈를 풀어보세요.",
            quest_type="quiz",
            target_value=5,
            reward_token=20,
        ),
    ]

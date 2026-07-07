from services.memory_store import quest_results
from services.reward_service import add_reward
from schemas import QuestResponse


def generate_daily_quests(user_id: int, goal_id: int) -> list[QuestResponse]:
    """Return MVP dummy quests before Planner Agent integration."""
    return [
        QuestResponse(
            title="오늘 40분 이상 공부하기",
            description="도서관 타이머를 켜고 40분 이상 집중 학습을 진행하세요.",
            quest_type="study_time",
            target_value=40,
            reward_token=30,
            difficulty="normal",
        ),
        QuestResponse(
            title="마무리 퀴즈 5문제 풀기",
            description="공부 종료 후 오늘 학습한 내용을 바탕으로 퀴즈를 풀어보세요.",
            quest_type="quiz",
            target_value=5,
            reward_token=20,
            difficulty="easy",
        ),
        QuestResponse(
            title="오늘 퀘스트 100% 달성하기",
            description="공부 시간 퀘스트와 퀴즈 퀘스트를 모두 완료하세요.",
            quest_type="completion",
            target_value=100,
            reward_token=50,
            difficulty="hard",
        ),
    ]


def complete_quest(
    user_id: int,
    quest_type: str,
    achieved_value: int,
    target_value: int,
    reward_token: int,
) -> dict:
    # 프론트에서 퀘스트 진행도를 보내면 완료 여부를 계산하고 보상을 지급합니다.
    progress_percent = min(100, round((achieved_value / target_value) * 100, 2))
    completed = progress_percent >= 100
    actual_reward = reward_token if completed else 0

    if completed:
        achievement = "퀘스트 첫 완료" if quest_type != "completion" else "하루 퀘스트 100% 달성"
        add_reward(user_id, actual_reward, achievement)

    result = {
        "user_id": user_id,
        "quest_type": quest_type,
        "completed": completed,
        "progress_percent": progress_percent,
        "reward_token": actual_reward,
        "message": "퀘스트를 완료했습니다." if completed else "아직 퀘스트 목표에 도달하지 못했습니다.",
    }
    quest_results.append(result)
    return result

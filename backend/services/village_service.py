from services.reward_service import get_rewards
from services.stat_service import get_user_stats


def get_village(user_id: int) -> dict:
    rewards = get_rewards(user_id)
    stats = get_user_stats(user_id)

    return {
        "user_id": user_id,
        "token": rewards["token"],
        "gem": 320,
        "locations": [
            {"key": "quest_board", "name": "퀘스트 게시판", "path": "/quests", "unlocked": True},
            {"key": "library", "name": "도서관", "path": "/library", "unlocked": True},
            {"key": "shop", "name": "상점", "path": "/shop", "unlocked": True},
            {"key": "room", "name": "내 방", "path": "/room", "unlocked": True},
            {"key": "character", "name": "캐릭터", "path": "/character", "unlocked": True},
            {"key": "party", "name": "파티", "path": "/party", "unlocked": False},
        ],
        "weekly_exam": "정보처리기사",
        "weekly_progress_percent": min(100, stats["growth_score"] + 20),
    }

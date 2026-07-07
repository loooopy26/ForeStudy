from services.memory_store import user_rewards


def get_or_create_rewards(user_id: int) -> dict:
    # 사용자의 성장 정보가 없으면 기본 레벨/토큰/테마 상태를 생성합니다.
    if user_id not in user_rewards:
        user_rewards[user_id] = {
            "user_id": user_id,
            "level": 1,
            "exp": 0,
            "token": 0,
            "achievements": [],
            "unlocked_themes": ["기본 숲"],
        }
    return user_rewards[user_id]


def add_reward(user_id: int, token: int, achievement: str | None = None) -> dict:
    # 퀘스트, 공부, 퀴즈 완료 시 토큰과 EXP를 지급하고 조건에 따라 테마를 해금합니다.
    rewards = get_or_create_rewards(user_id)
    rewards["token"] += token
    rewards["exp"] += token
    rewards["level"] = rewards["exp"] // 100 + 1

    if achievement and achievement not in rewards["achievements"]:
        rewards["achievements"].append(achievement)
    if len(rewards["achievements"]) >= 2 and "새싹 테마" not in rewards["unlocked_themes"]:
        rewards["unlocked_themes"].append("새싹 테마")
    if rewards["level"] >= 3 and "집중의 숲" not in rewards["unlocked_themes"]:
        rewards["unlocked_themes"].append("집중의 숲")

    return rewards


def spend_token(user_id: int, token: int) -> dict:
    # 상점 구매 시 토큰을 차감합니다.
    rewards = get_or_create_rewards(user_id)
    if rewards["token"] < token:
        raise ValueError("Not enough token")
    rewards["token"] -= token
    return rewards


def get_rewards(user_id: int) -> dict:
    return get_or_create_rewards(user_id)

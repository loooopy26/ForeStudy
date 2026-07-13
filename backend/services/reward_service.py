"""AI 아이템 생성의 데모(비로그인) 경로가 쓰는 더미 토큰 지갑.

담당 탭: 상점 / 내 방 (item_generation_service.py의 real_user_id 없는 분기 전용).
역할: 로그인 계정이 있으면 실제 도토리(PostgreSQL users.dotori)를 쓰고, 없을 때만
이 더미 토큰을 대신 차감한다.
주의: 예전에는 여기 있던 add_reward/get_rewards도 미사용 더미 라우터(퀘스트/상점/
캐릭터/방/업적 등)가 쓰던 함수였지만, 그 라우터들이 제거되면서 함께 정리했다.
"""

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


def spend_token(user_id: int, token: int) -> dict:
    # AI 아이템 생성 시 데모 토큰을 차감합니다.
    rewards = get_or_create_rewards(user_id)
    if rewards["token"] < token:
        raise ValueError("Not enough token")
    rewards["token"] -= token
    return rewards

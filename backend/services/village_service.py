"""마을 허브 데이터 서비스.

담당 탭: 마을 화면.
역할: 건물 이동 정보, 재화, 주간 시험 진행률 요약 반환.
"""

from services.reward_service import get_rewards
from services.stat_service import get_user_stats
from sqlalchemy.orm import Session

_FALLBACK_GROWTH_SCORE = 0


async def get_village(db: Session, user_id: int) -> dict:
    rewards = get_rewards(user_id)
    # 이 라우터는 실제 로그인 계정(Postgres UUID)이 아니라 예전 SQLite 데모 유저(정수 id)
    # 기준이라 get_user_stats(Postgres UUID 기준)와 맞지 않는다 — 프론트에서 쓰이지 않는
    # 화면이라 정수 id를 UUID로 억지로 맞추는 대신, 조회가 안 되면 빈 값으로 대체한다.
    try:
        stats = await get_user_stats(user_id=str(user_id))
    except Exception:
        stats = {"growth_score": _FALLBACK_GROWTH_SCORE}

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

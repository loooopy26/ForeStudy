"""MVP 공용 메모리 저장소.

담당 탭: 전체 탭 공통.
역할: DB 연동 전까지 사용자, 퀘스트, 타이머, 퀴즈, 보상, 상점, 내 방 데이터를 임시 저장.
주의: 서버를 재시작하면 저장된 데이터가 초기화됩니다.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from services.generated_item_repository import get_generated_item, to_item_dict

# MVP 임시 저장소입니다.
# 현재는 DB 없이 서버 메모리에 저장하므로 서버를 재시작하면 데이터가 초기화됩니다.
# (유저 계정은 이제 DB의 users 테이블에 저장 → auth_service.py 참고,
#  AI 생성 아이템도 DB에 저장 → services/generated_item_repository.py 참고)
materials: dict[int, dict[str, Any]] = {}
timer_sessions: dict[int, dict[str, Any]] = {}
study_logs: list[dict[str, Any]] = []
quiz_sets: dict[int, dict[str, Any]] = {}
quiz_results: list[dict[str, Any]] = []
quest_results: list[dict[str, Any]] = []
user_rewards: dict[int, dict[str, Any]] = {}
user_rooms: dict[int, dict[str, Any]] = {}
user_inventories: dict[int, set[int]] = {}
activity_days: dict[int, set[date]] = {}

shop_items = [
    {"item_id": 1, "name": "원목 책상", "item_type": "furniture", "price_token": 30, "theme_required": None},
    {"item_id": 2, "name": "초록 화분", "item_type": "decoration", "price_token": 20, "theme_required": None},
    {"item_id": 3, "name": "새싹 벽지", "item_type": "theme", "price_token": 50, "theme_required": "새싹 테마"},
]


def find_owned_item(db: Session, user_id: int, item_id: int) -> dict[str, Any] | None:
    # 상점 아이템(공용 카탈로그, 메모리)과 사용자가 생성한 커스텀 아이템(DB)을 모두 뒤져 찾습니다.
    item = next((shop_item for shop_item in shop_items if shop_item["item_id"] == item_id), None)
    if item is not None:
        return item

    generated = get_generated_item(db, user_id=user_id, item_id=item_id)
    return to_item_dict(generated) if generated is not None else None

next_material_id = 1
next_timer_session_id = 1
next_quiz_id = 1


def now_utc() -> datetime:
    # 서버 내부 시간 기록용입니다.
    return datetime.utcnow()


def mark_activity(user_id: int, activity_date: date | None = None) -> None:
    # 접속/학습/퀴즈 활동일을 기록해 연속 학습일 계산에 사용합니다.
    activity_days.setdefault(user_id, set()).add(activity_date or date.today())


def get_current_streak_days(user_id: int) -> int:
    # 오늘부터 거꾸로 확인해 연속으로 활동한 날짜 수를 계산합니다.
    days = activity_days.get(user_id, set())
    if not days:
        return 0

    streak = 0
    cursor = date.today()
    while cursor in days:
        streak += 1
        cursor = date.fromordinal(cursor.toordinal() - 1)
    return streak

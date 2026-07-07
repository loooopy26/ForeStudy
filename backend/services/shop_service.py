"""상점 구매 서비스.

담당 탭: 상점.
역할: 판매 아이템 목록 조회, 토큰 차감, 구매 아이템 인벤토리 등록.
"""

from fastapi import HTTPException

from services.memory_store import shop_items, user_inventories
from services.reward_service import get_rewards, spend_token


def get_shop_items() -> list[dict]:
    # 상점 화면에서 판매 중인 아이템 목록을 보여줍니다.
    return shop_items


def purchase_item(user_id: int, item_id: int) -> dict:
    # 토큰과 테마 해금 조건을 확인한 뒤 아이템을 구매 처리합니다.
    item = next((shop_item for shop_item in shop_items if shop_item["item_id"] == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Shop item not found")

    rewards = get_rewards(user_id)
    required_theme = item.get("theme_required")
    if required_theme and required_theme not in rewards["unlocked_themes"]:
        raise HTTPException(status_code=400, detail="Required theme is locked")

    try:
        updated_rewards = spend_token(user_id, item["price_token"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user_inventories.setdefault(user_id, set()).add(item_id)

    return {
        "user_id": user_id,
        "item": item,
        "remaining_token": updated_rewards["token"],
        "message": f"{item['name']} 아이템을 구매했습니다.",
    }

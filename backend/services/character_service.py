"""캐릭터 장착 서비스.

담당 탭: 캐릭터.
역할: 캐릭터 정보 조회, 구매한 아이템 장착 처리.
"""

from fastapi import HTTPException

from services.memory_store import shop_items, user_inventories, user_rooms
from services.reward_service import get_rewards


def get_character(user_id: int) -> dict:
    rewards = get_rewards(user_id)
    room = user_rooms.get(user_id, {"equipped_items": []})
    owned_item_ids = sorted(user_inventories.get(user_id, set()))

    return {
        "user_id": user_id,
        "level": rewards["level"],
        "token": rewards["token"],
        "gem": 12,
        "equipped_items": room["equipped_items"],
        "owned_item_ids": owned_item_ids,
    }


def equip_character_items(user_id: int, item_ids: list[int]) -> dict:
    owned_items = user_inventories.get(user_id, set())
    selected_items = []

    for item_id in item_ids:
        if item_id not in owned_items:
            raise HTTPException(status_code=400, detail=f"Item {item_id} has not been purchased")
        item = next((shop_item for shop_item in shop_items if shop_item["item_id"] == item_id), None)
        if item is None:
            raise HTTPException(status_code=404, detail=f"Shop item {item_id} not found")
        selected_items.append(item)

    user_rooms.setdefault(user_id, {"user_id": user_id, "equipped_items": [], "natural_language_prompt": None})
    user_rooms[user_id]["equipped_items"] = selected_items
    return get_character(user_id)

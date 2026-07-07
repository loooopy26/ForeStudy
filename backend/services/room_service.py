from fastapi import HTTPException

from services.memory_store import shop_items, user_inventories, user_rooms


def get_or_create_room(user_id: int) -> dict:
    # 내 방 정보가 없으면 빈 방 상태를 생성합니다.
    if user_id not in user_rooms:
        user_rooms[user_id] = {
            "user_id": user_id,
            "equipped_items": [],
            "natural_language_prompt": None,
        }
    return user_rooms[user_id]


def decorate_room(user_id: int, item_ids: list[int], prompt: str | None = None) -> dict:
    # 구매한 아이템만 배치할 수 있습니다. prompt는 추후 LLM 꾸미기 기능에 연결합니다.
    room = get_or_create_room(user_id)
    selected_items = []
    owned_items = user_inventories.get(user_id, set())

    for item_id in item_ids:
        if item_id not in owned_items:
            raise HTTPException(status_code=400, detail=f"Item {item_id} has not been purchased")
        item = next((shop_item for shop_item in shop_items if shop_item["item_id"] == item_id), None)
        if item is None:
            raise HTTPException(status_code=404, detail=f"Shop item {item_id} not found")
        selected_items.append(item)

    room["equipped_items"] = selected_items
    room["natural_language_prompt"] = prompt
    return room

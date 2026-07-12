"""상점/내 방/캐릭터 꾸미기 API 라우터.

담당 탭: 상점, 내 방, 캐릭터.
로그인 계정(UUID) 기준으로 goods.js가 예전에 localStorage에만 저장하던 보유 아이템/
AI 커스텀 아이템/장착 상태/방 배치를 실제로 영속화한다.
주요 API: GET /api/goods/{user_id}, POST .../buy, POST .../custom-items,
          DELETE .../custom-items/{item_id}, POST .../equip, PUT .../room
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services import goods_service

router = APIRouter(prefix="/api/goods", tags=["goods"])


class BuyItemRequest(BaseModel):
    item_id: str = Field(..., min_length=1)
    price: int = Field(..., ge=0)


class CustomItemRequest(BaseModel):
    item: dict


class EquipRequest(BaseModel):
    slot: str
    item_id: str | None = None


class RoomPlacement(BaseModel):
    id: str
    x: float
    y: float
    scale: float | None = None
    rotate: float | None = None


class SaveRoomRequest(BaseModel):
    wallpaper: str | None = None
    floor: str | None = None
    placed: list[dict] = Field(default_factory=list)


@router.get("/{user_id}")
async def read_goods_state(user_id: str):
    return await goods_service.get_goods_state(user_id)


@router.post("/{user_id}/buy")
async def buy_item(user_id: str, request: BuyItemRequest):
    return await goods_service.buy_item(user_id, request.item_id, request.price)


@router.post("/{user_id}/custom-items")
async def add_custom_item(user_id: str, request: CustomItemRequest):
    return await goods_service.add_custom_item(user_id, request.item)


@router.delete("/{user_id}/custom-items/{item_id}")
async def remove_custom_item(user_id: str, item_id: str):
    return await goods_service.remove_custom_item(user_id, item_id)


@router.post("/{user_id}/equip")
async def set_equipped(user_id: str, request: EquipRequest):
    return await goods_service.set_equipped(user_id, request.slot, request.item_id)


@router.put("/{user_id}/room")
async def save_room(user_id: str, request: SaveRoomRequest):
    return await goods_service.save_room(user_id, request.wallpaper, request.floor, request.placed)

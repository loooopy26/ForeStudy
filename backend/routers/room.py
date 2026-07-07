"""내 방 API 라우터.

담당 탭: 내 방 화면, 구매한 아이템 배치와 자연어 꾸미기 요청 저장.
주요 API: GET /room/{user_id}, POST /room/decorate
"""

from fastapi import APIRouter

from schemas import RoomDecorateRequest, RoomResponse
from services.room_service import decorate_room, get_or_create_room

router = APIRouter(prefix="/room", tags=["room"])


@router.get("/{user_id}", response_model=RoomResponse)
def read_user_room(user_id: int):
    return get_or_create_room(user_id=user_id)


@router.post("/decorate", response_model=RoomResponse)
def decorate_user_room(request: RoomDecorateRequest):
    return decorate_room(
        user_id=request.user_id,
        item_ids=request.item_ids,
        prompt=request.prompt,
    )

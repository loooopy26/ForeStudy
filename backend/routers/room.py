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

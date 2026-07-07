"""캐릭터 API 라우터.

담당 탭: 캐릭터 화면, 보유 아이템 조회와 캐릭터 장착 처리.
주요 API: GET /character/{user_id}, POST /character/equip
"""

from fastapi import APIRouter

from schemas import CharacterEquipRequest, CharacterResponse
from services.character_service import equip_character_items, get_character

router = APIRouter(prefix="/character", tags=["character"])


@router.get("/{user_id}", response_model=CharacterResponse)
def read_character(user_id: int):
    return get_character(user_id=user_id)


@router.post("/equip", response_model=CharacterResponse)
def equip_character(request: CharacterEquipRequest):
    return equip_character_items(user_id=request.user_id, item_ids=request.item_ids)

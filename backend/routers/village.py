from fastapi import APIRouter

from schemas import VillageResponse
from services.village_service import get_village

router = APIRouter(prefix="/village", tags=["village"])


@router.get("/{user_id}", response_model=VillageResponse)
def read_village(user_id: int):
    return get_village(user_id=user_id)

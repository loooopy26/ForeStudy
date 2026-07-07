from fastapi import APIRouter

from schemas import AchievementResponse
from services.achievement_service import get_achievements

router = APIRouter(prefix="/achievements", tags=["achievements"])


@router.get("/{user_id}", response_model=list[AchievementResponse])
def read_achievements(user_id: int):
    return get_achievements(user_id=user_id)

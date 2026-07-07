from fastapi import APIRouter

from schemas import StatsResponse
from services.stat_service import get_user_stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/{user_id}", response_model=StatsResponse)
def read_user_stats(user_id: int):
    return get_user_stats(user_id=user_id)

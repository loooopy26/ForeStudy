from fastapi import APIRouter

from schemas import RewardsResponse
from services.reward_service import get_rewards

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/{user_id}", response_model=RewardsResponse)
def read_user_rewards(user_id: int):
    return get_rewards(user_id=user_id)

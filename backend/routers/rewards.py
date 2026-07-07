"""성장 보상 API 라우터.

담당 탭: 상태창, 캐릭터, 상점에서 사용하는 레벨/EXP/토큰/해금 테마 조회.
주요 API: GET /rewards/{user_id}
"""

from fastapi import APIRouter

from schemas import RewardsResponse
from services.reward_service import get_rewards

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/{user_id}", response_model=RewardsResponse)
def read_user_rewards(user_id: int):
    return get_rewards(user_id=user_id)

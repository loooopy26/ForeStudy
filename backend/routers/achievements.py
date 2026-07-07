"""업적 API 라우터.

담당 탭: 업적 화면, 연속 학습/퀘스트 완료/퀴즈 만점 업적 진행도 조회.
주요 API: GET /achievements/{user_id}
"""

from fastapi import APIRouter

from schemas import AchievementResponse
from services.achievement_service import get_achievements

router = APIRouter(prefix="/achievements", tags=["achievements"])


@router.get("/{user_id}", response_model=list[AchievementResponse])
def read_achievements(user_id: int):
    return get_achievements(user_id=user_id)

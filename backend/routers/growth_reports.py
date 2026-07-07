"""AI 분석 리포트 API 라우터.

담당 탭: AI 분석 리포트 화면, 능력치 변화와 합격 가능성 분석.
주요 API: GET /reports/{user_id}
"""

from fastapi import APIRouter

from schemas import StatsResponse
from services.stat_service import get_user_stats

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/{user_id}", response_model=StatsResponse)
def read_ai_report(user_id: int):
    return get_user_stats(user_id=user_id)

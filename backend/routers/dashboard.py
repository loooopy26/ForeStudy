"""홈/상태창 요약 API 라우터.

담당 탭: 메인 홈 화면, 상태창 카드, 오늘의 퀘스트 요약.
주요 API: GET /dashboard/{user_id}
"""

from fastapi import APIRouter

from schemas import DashboardResponse
from services.dashboard_service import get_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/{user_id}", response_model=DashboardResponse)
def read_dashboard(user_id: int):
    return get_dashboard(user_id=user_id)

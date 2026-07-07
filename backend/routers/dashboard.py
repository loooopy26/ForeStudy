from fastapi import APIRouter

from schemas import DashboardResponse
from services.dashboard_service import get_dashboard

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/{user_id}", response_model=DashboardResponse)
def read_dashboard(user_id: int):
    return get_dashboard(user_id=user_id)

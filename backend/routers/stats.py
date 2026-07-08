"""사용자 능력치 API 라우터.

담당 탭: 상태창, 리포트, 홈 요약에서 사용하는 집중력/이해도/지속성/합격률 조회.
주요 API: GET /stats/{user_id}
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import StatsResponse
from services.stat_service import get_user_stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/{user_id}", response_model=StatsResponse)
async def read_user_stats(user_id: int, db: Session = Depends(get_db)):
    return await get_user_stats(db=db, user_id=user_id)

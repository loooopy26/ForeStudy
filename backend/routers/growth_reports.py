"""AI 분석 리포트 API 라우터.

담당 탭: AI 분석 리포트 화면, 능력치 변화와 합격 가능성 분석.
주요 API: GET /reports/{user_id}
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import StatsResponse
from services.stat_service import get_user_stats

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/{user_id}", response_model=StatsResponse)
async def read_ai_report(user_id: int, db: Session = Depends(get_db)):
    # 이 라우터는 실제 로그인 계정(Postgres UUID)이 아니라 예전 SQLite 데모 유저(정수 id)
    # 기준이라 get_user_stats(Postgres UUID 기준)와 맞지 않는다 — 프론트에서 쓰이지 않는
    # 화면이라 정수 id를 UUID로 억지로 맞추는 대신, 조회가 안 되면 빈 값으로 대체한다.
    try:
        return await get_user_stats(user_id=str(user_id))
    except Exception:
        return {
            "user_id": str(user_id), "focus": 0, "comprehension": 0, "persistence": 0,
            "growth_score": 0, "pass_rate": 0, "total_study_minutes": 0,
            "current_streak_days": 0, "recent_quiz_average": 0, "ai_feedback": "",
        }

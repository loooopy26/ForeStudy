"""퀘스트 게시판 진행률/보상 수령 API 라우터.

담당 탭: 퀘스트 게시판, 업적.
주요 API: POST /api/quest-progress/events, GET /api/quest-progress/events,
          POST /api/quest-progress/claim, GET /api/quest-progress/claimed
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from services import quest_progress_service

router = APIRouter(prefix="/api/quest-progress", tags=["quest-progress"])


class RecordEventRequest(BaseModel):
    user_id: str
    event_type: str = Field(..., min_length=1)
    amount: float = Field(1, gt=0)
    event_date: str = Field(..., description="프론트(브라우저 로컬 시간) 기준 YYYY-MM-DD")


class ClaimRewardRequest(BaseModel):
    user_id: str
    reward_id: str = Field(..., min_length=1)
    period_key: str = Field(..., min_length=1)
    exp: int = Field(..., ge=0)
    dotori: int = Field(..., ge=0)


@router.post("/events", status_code=204)
async def record_event(request: RecordEventRequest):
    await quest_progress_service.record_event(
        request.user_id, request.event_type, request.amount, request.event_date
    )
    return None


@router.get("/events")
async def read_events(user_id: str, days: int = Query(14, ge=1, le=90)):
    return await quest_progress_service.get_events(user_id, days)


@router.post("/claim")
async def claim_reward(request: ClaimRewardRequest):
    return await quest_progress_service.claim_reward(
        request.user_id, request.reward_id, request.period_key, request.exp, request.dotori
    )


@router.get("/claimed")
async def read_claimed(user_id: str, period_keys: str = Query(..., description="쉼표로 구분된 period_key 목록")):
    keys = [key for key in period_keys.split(",") if key]
    return await quest_progress_service.get_claimed(user_id, keys)

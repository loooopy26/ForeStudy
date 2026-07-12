"""도서관 공부 타이머 API 라우터.

담당 탭: 도서관 화면, 공부 시작/이탈 정지/공부 종료.
주요 API: POST /timer/start, POST /timer/pause, POST /timer/end
"""

from fastapi import APIRouter

from schemas import (
    TimerEndRequest,
    TimerEndResponse,
    TimerPauseRequest,
    TimerPauseResponse,
    TimerStartRequest,
    TimerStartResponse,
)
from services.timer_service import end_timer, pause_timer, start_timer

router = APIRouter(prefix="/timer", tags=["timer"])


@router.post("/start", response_model=TimerStartResponse)
async def start_study_timer(request: TimerStartRequest):
    return await start_timer(user_id=request.user_id, material_id=request.material_id)


@router.post("/pause", response_model=TimerPauseResponse)
async def pause_study_timer(request: TimerPauseRequest):
    return await pause_timer(
        session_id=request.session_id,
        segment_minutes=request.segment_minutes,
        reason=request.reason,
    )


@router.post("/end", response_model=TimerEndResponse)
async def end_study_timer(request: TimerEndRequest):
    return await end_timer(
        session_id=request.session_id,
        studied_minutes=request.studied_minutes,
        max_uninterrupted_minutes=request.max_uninterrupted_minutes,
    )

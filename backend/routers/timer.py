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
def start_study_timer(request: TimerStartRequest):
    return start_timer(user_id=request.user_id)


@router.post("/pause", response_model=TimerPauseResponse)
def pause_study_timer(request: TimerPauseRequest):
    return pause_timer(session_id=request.session_id, reason=request.reason)


@router.post("/end", response_model=TimerEndResponse)
def end_study_timer(request: TimerEndRequest):
    return end_timer(session_id=request.session_id, studied_minutes=request.studied_minutes)

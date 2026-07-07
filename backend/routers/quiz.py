"""AI 퀴즈 API 라우터.

담당 탭: AI 퀴즈 화면, 문제 생성, 답안 제출, 자동 채점.
주요 API: POST /quiz/generate, POST /quiz/submit
"""

from fastapi import APIRouter

from schemas import QuizGenerateRequest, QuizGenerateResponse, QuizSubmitRequest, QuizSubmitResponse
from services.quiz_service import generate_quiz, submit_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizGenerateResponse)
def generate_daily_quiz(request: QuizGenerateRequest):
    return generate_quiz(user_id=request.user_id, goal_id=request.goal_id, count=request.count)


@router.post("/submit", response_model=QuizSubmitResponse)
def submit_daily_quiz(request: QuizSubmitRequest):
    return submit_quiz(user_id=request.user_id, quiz_id=request.quiz_id, answers=request.answers)

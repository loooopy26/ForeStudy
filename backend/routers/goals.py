"""자격증 목표 설정 API 라우터.

담당 탭: 목표 설정 화면, 퀘스트 생성을 위한 자격증/기간/난이도 입력.
주요 API: POST /goals
"""

from fastapi import APIRouter

from schemas import GoalCreate, GoalResponse

router = APIRouter(prefix="/goals", tags=["goals"])

goals_store: list[GoalResponse] = []


@router.post("", response_model=GoalResponse, status_code=201)
def create_goal(goal: GoalCreate):
    new_goal = GoalResponse(id=len(goals_store) + 1, **goal.model_dump())
    goals_store.append(new_goal)
    return new_goal

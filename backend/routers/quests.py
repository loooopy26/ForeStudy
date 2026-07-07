from fastapi import APIRouter

from schemas import QuestGenerateRequest, QuestResponse
from services.quest_service import generate_daily_quests

router = APIRouter(prefix="/quests", tags=["quests"])


@router.post("/generate", response_model=list[QuestResponse])
def generate_quests(request: QuestGenerateRequest):
    return generate_daily_quests(user_id=request.user_id, goal_id=request.goal_id)

from fastapi import APIRouter

from schemas import (
    QuestCompleteRequest,
    QuestCompleteResponse,
    QuestGenerateRequest,
    QuestResponse,
)
from services.quest_service import complete_quest, generate_daily_quests

router = APIRouter(prefix="/quests", tags=["quests"])


@router.post("/generate", response_model=list[QuestResponse])
def generate_quests(request: QuestGenerateRequest):
    return generate_daily_quests(user_id=request.user_id, goal_id=request.goal_id)


@router.post("/complete", response_model=QuestCompleteResponse)
def complete_daily_quest(request: QuestCompleteRequest):
    return complete_quest(
        user_id=request.user_id,
        quest_type=request.quest_type,
        achieved_value=request.achieved_value,
        target_value=request.target_value,
        reward_token=request.reward_token,
    )

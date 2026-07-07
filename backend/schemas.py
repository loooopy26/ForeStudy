from pydantic import BaseModel, Field


class GoalCreate(BaseModel):
    user_id: int = Field(..., example=1)
    certificate_name: str = Field(..., example="정보처리기사")
    period_days: int = Field(..., gt=0, example=14)
    difficulty: str = Field(..., example="초급")
    current_level: str = Field(..., example="입문")


class GoalResponse(GoalCreate):
    id: int
    message: str = "목표가 저장되었습니다."


class QuestGenerateRequest(BaseModel):
    user_id: int = Field(..., example=1)
    goal_id: int = Field(..., example=1)


class QuestResponse(BaseModel):
    title: str
    description: str
    quest_type: str
    target_value: int
    reward_token: int

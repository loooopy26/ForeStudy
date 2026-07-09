"""자격증 목표일과 학습 플랜 준비 API."""

from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.plan_goal_graph import run_goal_agent_turn
from db import get_or_create_demo_user, get_pool
from services import exam_goal_service

router = APIRouter(prefix="/api/cert-goals", tags=["cert goals"])


class GoalQuery(BaseModel):
    certification_name: str = Field(..., min_length=1, max_length=120)
    user_id: str | None = None


class GoalSaveRequest(GoalQuery):
    target_exam_date: date
    current_level: str | None = Field(None, pattern="^(beginner|intermediate|advanced)$")


class GoalAgentChatRequest(GoalQuery):
    message: str = Field(..., min_length=1)
    thread_id: str | None = None


async def _resolve_user_id(pool, user_id: str | None) -> str:
    if user_id:
        return user_id
    async with pool.acquire() as conn:
        return await get_or_create_demo_user(conn)


@router.get("")
async def get_goal(certification_name: str, user_id: str | None = None):
    pool = await get_pool()
    resolved_user_id = await _resolve_user_id(pool, user_id)
    return await exam_goal_service.get_exam_goal(
        pool,
        user_id=resolved_user_id,
        certification_name=certification_name,
    )


@router.put("")
async def save_goal(req: GoalSaveRequest):
    pool = await get_pool()
    resolved_user_id = await _resolve_user_id(pool, req.user_id)
    try:
        return await exam_goal_service.save_exam_goal(
            pool,
            user_id=resolved_user_id,
            certification_name=req.certification_name,
            target_exam_date=req.target_exam_date,
            current_level=req.current_level,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/agent-chat")
async def agent_chat(req: GoalAgentChatRequest):
    pool = await get_pool()
    resolved_user_id = await _resolve_user_id(pool, req.user_id)
    return await run_goal_agent_turn(
        user_id=resolved_user_id,
        certification_name=req.certification_name,
        message=req.message,
        thread_id=req.thread_id,
    )

"""시험 당일 AI 어시스턴트: 시험 계획 저장(DB) + 저장된 계획으로 안내 실행.

routers/location.py의 /exam-day-assistant는 매번 시험 정보를 body로 받는 stateless API다.
여기서는 시험 계획(자격증/시험장/일시/출발지)을 DB(exam_day_plans)에 저장해 두고,
시험 당일 아침에 계획 ID만으로 어시스턴트를 실행하거나 마지막 실행 결과를 다시 조회한다.

curl -X POST http://localhost:8000/api/exam-day/plans \
  -H "Content-Type: application/json" \
  -d "{\"certification_name\":\"정보처리기사\",\"exam_site_name\":\"서울국가자격시험장\",\"exam_site_address\":\"서울특별시 중구 세종대로 110\",\"exam_date\":\"2026-07-20\",\"exam_start_time\":\"09:00\",\"origin\":{\"latitude\":37.5665,\"longitude\":126.9780}}"

curl http://localhost:8000/api/exam-day/plans
curl -X POST http://localhost:8000/api/exam-day/plans/{plan_id}/assistant
curl http://localhost:8000/api/exam-day/plans/{plan_id}
"""

import json
from datetime import date, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import get_or_create_demo_user, get_pool
from routers import location
from schemas import (
    DEFAULT_TRANSPORT_MODES,
    Coordinate,
    ExamDayAssistantRequest,
    ExamInfoRequest,
    TransportMode,
)

router = APIRouter(prefix="/api/exam-day", tags=["exam day"])


class ExamDayPlanCreateRequest(BaseModel):
    certification_name: str = Field(..., min_length=1, example="정보처리기사")
    exam_site_name: str = Field(..., min_length=1, example="서울국가자격시험장")
    exam_site_address: str = Field(..., min_length=1, example="서울특별시 중구 세종대로 110")
    exam_date: date = Field(..., example="2026-07-20")
    exam_start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$", example="09:00")
    origin: Coordinate
    buffer_minutes: int = Field(30, ge=0, le=180, example=30)
    user_id: str | None = None


class ExamDayAssistantRunRequest(BaseModel):
    """저장된 계획으로 어시스턴트를 실행한다. 당일 출발 위치가 계획의 출발지와 다르면
    origin으로 덮어쓸 수 있다 (계획 자체는 수정하지 않는다)."""

    origin: Coordinate | None = None
    buffer_minutes: int | None = Field(None, ge=0, le=180)
    transport_modes: list[TransportMode] = Field(default_factory=lambda: list(DEFAULT_TRANSPORT_MODES))
    debug: bool = False


async def _resolve_user_id(pool, user_id: str | None) -> str:
    if user_id:
        return user_id
    async with pool.acquire() as conn:
        return await get_or_create_demo_user(conn)


def _serialize_plan(row, *, include_result: bool = False) -> dict:
    plan = {
        "id": str(row["id"]),
        "user_id": str(row["user_id"]),
        "certification_name": row["certification_name"],
        "exam_site_name": row["exam_site_name"],
        "exam_site_address": row["exam_site_address"],
        "exam_date": row["exam_date"].isoformat(),
        "exam_start_time": row["exam_start_time"],
        "origin": {"latitude": row["origin_latitude"], "longitude": row["origin_longitude"]},
        "buffer_minutes": row["buffer_minutes"],
        "last_assistant_at": row["last_assistant_at"].isoformat() if row["last_assistant_at"] else None,
        "created_at": row["created_at"].isoformat(),
    }
    if include_result:
        raw = row["last_assistant_result"]
        plan["last_assistant_result"] = json.loads(raw) if raw else None
    return plan


@router.get("/health")
def exam_day_health():
    from config import settings

    return {
        "tmap_configured": bool(settings.tmap_app_key),
        "naver_configured": bool(settings.naver_client_id and settings.naver_client_secret),
        "upstage_configured": bool(settings.upstage_api_key),
        "required_env": ["TMAP_APP_KEY"],
        "optional_env": ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "UPSTAGE_API_KEY"],
    }


@router.post("/plans", status_code=201)
async def create_plan(req: ExamDayPlanCreateRequest):
    pool = await get_pool()
    user_id = await _resolve_user_id(pool, req.user_id)
    row = await pool.fetchrow(
        """
        INSERT INTO exam_day_plans (
            user_id, certification_name, exam_site_name, exam_site_address,
            exam_date, exam_start_time, origin_latitude, origin_longitude, buffer_minutes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        """,
        user_id,
        req.certification_name,
        req.exam_site_name,
        req.exam_site_address,
        req.exam_date,
        req.exam_start_time,
        req.origin.latitude,
        req.origin.longitude,
        req.buffer_minutes,
    )
    return _serialize_plan(row)


@router.get("/plans")
async def list_plans(user_id: str | None = None):
    pool = await get_pool()
    resolved_user_id = await _resolve_user_id(pool, user_id)
    rows = await pool.fetch(
        "SELECT * FROM exam_day_plans WHERE user_id = $1 ORDER BY exam_date, created_at",
        resolved_user_id,
    )
    return {"plans": [_serialize_plan(row) for row in rows]}


@router.get("/plans/{plan_id}")
async def get_plan(plan_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM exam_day_plans WHERE id = $1", plan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="시험 계획을 찾을 수 없습니다.")
    return _serialize_plan(row, include_result=True)


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str):
    pool = await get_pool()
    deleted = await pool.fetchval("DELETE FROM exam_day_plans WHERE id = $1 RETURNING id", plan_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="시험 계획을 찾을 수 없습니다.")
    return {"deleted": True, "id": str(deleted)}


@router.post("/plans/{plan_id}/assistant")
async def run_plan_assistant(plan_id: str, req: ExamDayAssistantRunRequest | None = None):
    """저장된 계획으로 시험 당일 어시스턴트(경로/출발시각/주변장소/안내/시험장 후기 팁)를
    실행하고 결과를 계획에 저장한다. 저장된 결과는 GET /plans/{id}로 다시 볼 수 있다."""
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM exam_day_plans WHERE id = $1", plan_id)
    if row is None:
        raise HTTPException(status_code=404, detail="시험 계획을 찾을 수 없습니다.")

    req = req or ExamDayAssistantRunRequest()
    origin = req.origin or Coordinate(latitude=row["origin_latitude"], longitude=row["origin_longitude"])
    buffer_minutes = req.buffer_minutes if req.buffer_minutes is not None else row["buffer_minutes"]

    assistant_request = ExamDayAssistantRequest(
        origin=origin,
        exam=ExamInfoRequest(
            certification_name=row["certification_name"],
            exam_site_name=row["exam_site_name"],
            exam_site_address=row["exam_site_address"],
            exam_date=row["exam_date"].isoformat(),
            exam_start_time=row["exam_start_time"],
        ),
        buffer_minutes=buffer_minutes,
        transport_modes=req.transport_modes,
        debug=req.debug,
    )
    result = await location.exam_day_assistant(assistant_request)

    await pool.execute(
        "UPDATE exam_day_plans SET last_assistant_result = $2::jsonb, last_assistant_at = $3 WHERE id = $1",
        plan_id,
        json.dumps(result, ensure_ascii=False),
        datetime.now().astimezone(),
    )
    return {"plan_id": plan_id, **result}

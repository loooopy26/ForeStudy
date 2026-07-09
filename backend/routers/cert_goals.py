"""자격증 목표일과 학습 플랜 준비 API."""

import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents import graph as agent_graph
from agents.plan_goal_graph import run_goal_agent_turn
from db import get_or_create_demo_user, get_pool
from services import exam_goal_service, rag

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


class CurriculumCreateRequest(BaseModel):
    quiz_attempt_id: str = Field(..., min_length=1)


class CurriculumRegenerateRequest(BaseModel):
    target_exam_date: date | None = None
    quiz_attempt_id: str | None = None


class CurriculumDayUpdateRequest(BaseModel):
    focus_topic: str | None = None
    tasks: list[str] | None = None
    checkpoint: str | None = None
    planned_minutes: int | None = None
    progress_status: str | None = Field(None, pattern="^(not_started|in_progress|completed)$")


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


@router.post("/{goal_id}/curricula", status_code=201)
async def create_curriculum(goal_id: str, req: CurriculumCreateRequest):
    pool = await get_pool()
    goal = await _load_goal(pool, goal_id)
    remaining_days = _remaining_days(goal["target_exam_date"])
    attempt_context = await _load_attempt_context(pool, req.quiz_attempt_id)

    plan = await agent_graph.run_generate_daily_learning_plan(
        certification_name=goal["certification_name"],
        material_id=attempt_context["material_id"],
        material_title=attempt_context["material_title"],
        current_date=date.today().isoformat(),
        target_exam_date=goal["target_exam_date"].isoformat(),
        remaining_days=remaining_days,
        material_summary=attempt_context["material_summary"],
        key_concepts=attempt_context["key_concepts"],
        learning_evaluation=attempt_context["learning_evaluation"],
        quiz_results=attempt_context["quiz_results"],
        context=attempt_context["context"],
    )

    curriculum_id = await _persist_curriculum(
        pool,
        goal_id=goal_id,
        version=1,
        source_quiz_attempt_id=req.quiz_attempt_id,
        plan=plan,
    )
    return await _load_curriculum(pool, curriculum_id)


@router.post("/{goal_id}/curricula/regenerate", status_code=201)
async def regenerate_curriculum(goal_id: str, req: CurriculumRegenerateRequest):
    pool = await get_pool()
    goal = await _load_goal(pool, goal_id)

    active = await pool.fetchrow(
        "SELECT id, version, source_quiz_attempt_id FROM curricula WHERE user_cert_goal_id = $1 AND status = 'active'",
        goal_id,
    )
    quiz_attempt_id = req.quiz_attempt_id or (active["source_quiz_attempt_id"] if active else None)
    if not quiz_attempt_id:
        raise HTTPException(409, "재생성에 사용할 quiz_attempt_id가 없습니다. 처음 생성 시 사용한 것을 넘겨주세요.")

    if req.target_exam_date is not None:
        await exam_goal_service.save_exam_goal(
            pool,
            user_id=goal["user_id"],
            certification_name=goal["certification_name"],
            target_exam_date=req.target_exam_date,
            current_level=goal["current_level"],
        )
        goal = await _load_goal(pool, goal_id)

    remaining_days = _remaining_days(goal["target_exam_date"])
    attempt_context = await _load_attempt_context(pool, quiz_attempt_id)

    plan = await agent_graph.run_generate_daily_learning_plan(
        certification_name=goal["certification_name"],
        material_id=attempt_context["material_id"],
        material_title=attempt_context["material_title"],
        current_date=date.today().isoformat(),
        target_exam_date=goal["target_exam_date"].isoformat(),
        remaining_days=remaining_days,
        material_summary=attempt_context["material_summary"],
        key_concepts=attempt_context["key_concepts"],
        learning_evaluation=attempt_context["learning_evaluation"],
        quiz_results=attempt_context["quiz_results"],
        context=attempt_context["context"],
    )

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE curricula SET status = 'superseded' WHERE user_cert_goal_id = $1 AND status = 'active'",
                goal_id,
            )
    next_version = (active["version"] + 1) if active else 1
    curriculum_id = await _persist_curriculum(
        pool,
        goal_id=goal_id,
        version=next_version,
        source_quiz_attempt_id=quiz_attempt_id,
        plan=plan,
    )
    return await _load_curriculum(pool, curriculum_id)


@router.get("/{goal_id}/curricula/active")
async def get_active_curriculum(goal_id: str):
    pool = await get_pool()
    curriculum = await pool.fetchrow(
        "SELECT id FROM curricula WHERE user_cert_goal_id = $1 AND status = 'active'",
        goal_id,
    )
    if curriculum is None:
        raise HTTPException(404, "이 목표에 대해 생성된 학습 플랜이 없습니다")
    return await _load_curriculum(pool, str(curriculum["id"]))


@router.patch("/curriculum-days/{day_id}")
async def update_curriculum_day(day_id: str, req: CurriculumDayUpdateRequest):
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT d.id FROM curriculum_days d
        JOIN curriculum_weeks w ON w.id = d.curriculum_week_id
        JOIN curricula c ON c.id = w.curriculum_id
        WHERE d.id = $1 AND c.status = 'active'
        """,
        day_id,
    )
    if row is None:
        raise HTTPException(404, "수정할 학습일을 찾을 수 없습니다 (이미 지난 버전일 수 있음)")

    content_fields = {"focus_topic", "tasks", "checkpoint", "planned_minutes"}
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "변경할 값이 없습니다")

    set_clauses = []
    values: list = []
    for index, (key, value) in enumerate(updates.items(), start=1):
        if key == "tasks":
            set_clauses.append(f"tasks = ${index}::jsonb")
            values.append(json.dumps(value, ensure_ascii=False))
        else:
            set_clauses.append(f"{key} = ${index}")
            values.append(value)
    if content_fields & updates.keys():
        set_clauses.append("edited_by = 'user'")
    values.append(day_id)

    await pool.execute(
        f"UPDATE curriculum_days SET {', '.join(set_clauses)} WHERE id = ${len(values)}",
        *values,
    )
    return await _load_curriculum_day(pool, day_id)


async def _load_goal(pool, goal_id: str) -> dict:
    row = await pool.fetchrow(
        """
        SELECT g.id AS goal_id, g.user_id, c.name AS certification_name,
               g.target_exam_date, g.current_level
        FROM user_cert_goals g
        JOIN certifications c ON c.id = g.certification_id
        WHERE g.id = $1 AND g.status = 'active'
        """,
        goal_id,
    )
    if row is None:
        raise HTTPException(404, "자격증 목표를 찾을 수 없습니다")
    if row["target_exam_date"] is None:
        raise HTTPException(409, "이 목표에는 아직 목표 시험일이 설정되지 않았습니다")
    return dict(row)


def _remaining_days(target_exam_date: date) -> int:
    remaining = (target_exam_date - date.today()).days
    if remaining < 1:
        raise HTTPException(409, "목표 시험일이 이미 지났습니다. 목표일을 먼저 갱신해 주세요.")
    return remaining


async def _load_attempt_context(pool, quiz_attempt_id: str) -> dict:
    attempt = await pool.fetchrow(
        """
        SELECT a.id, q.study_material_id, m.title AS material_title, m.ai_summary, m.key_concepts
        FROM quiz_attempts a
        JOIN quizzes q ON q.id = a.quiz_id
        LEFT JOIN study_materials m ON m.id = q.study_material_id
        WHERE a.id = $1
        """,
        quiz_attempt_id,
    )
    if attempt is None:
        raise HTTPException(404, "quiz attempt를 찾을 수 없습니다")
    if attempt["study_material_id"] is None:
        raise HTTPException(409, "이 응시 기록은 학습 자료와 연결되어 있지 않습니다")

    rows = await pool.fetch(
        """
        SELECT q.question_order, q.question_type, q.question_text, q.topic_tag,
               COALESCE(q.question_difficulty, 'normal') AS question_difficulty,
               a.user_answer, a.is_correct
        FROM quiz_answers a
        JOIN quiz_questions q ON q.id = a.quiz_question_id
        WHERE a.quiz_attempt_id = $1
        ORDER BY q.question_order
        """,
        quiz_attempt_id,
    )
    evaluation = await pool.fetchrow(
        """
        SELECT mastery_score, mastery_level, recommended_difficulty, confidence_score, ai_analysis
        FROM quiz_attempt_evaluations WHERE quiz_attempt_id = $1
        """,
        quiz_attempt_id,
    )
    learning_evaluation = None
    if evaluation:
        learning_evaluation = dict(evaluation)
        learning_evaluation["mastery_score"] = float(learning_evaluation["mastery_score"])
        learning_evaluation["confidence_score"] = float(learning_evaluation["confidence_score"])

    key_concepts = []
    if attempt["key_concepts"]:
        try:
            key_concepts = json.loads(attempt["key_concepts"])
        except (TypeError, json.JSONDecodeError):
            key_concepts = []

    material_id = str(attempt["study_material_id"])
    topics = ", ".join(str(row["topic_tag"]) for row in rows if row["topic_tag"])
    chunks = await rag.retrieve_chunks(material_id, topics or attempt["material_title"], top_k=8)

    return {
        "material_id": material_id,
        "material_title": attempt["material_title"] or "학습 자료",
        "material_summary": attempt["ai_summary"],
        "key_concepts": key_concepts,
        "learning_evaluation": learning_evaluation,
        "quiz_results": [dict(row) for row in rows],
        "context": rag.format_context(chunks),
    }


async def _persist_curriculum(pool, *, goal_id: str, version: int, source_quiz_attempt_id: str, plan: dict) -> str:
    async with pool.acquire() as conn:
        async with conn.transaction():
            curriculum = await conn.fetchrow(
                """
                INSERT INTO curricula (user_cert_goal_id, version, generated_by, status, source_quiz_attempt_id)
                VALUES ($1, $2, 'ai', 'active', $3) RETURNING id
                """,
                goal_id,
                version,
                source_quiz_attempt_id,
            )
            curriculum_id = str(curriculum["id"])
            for week in plan["weeks"]:
                week_row = await conn.fetchrow(
                    """
                    INSERT INTO curriculum_weeks (curriculum_id, week_number, theme, planned_hours)
                    VALUES ($1, $2, $3, $4) RETURNING id
                    """,
                    curriculum_id,
                    week["week_number"],
                    week["theme"],
                    week.get("planned_hours"),
                )
                week_id = str(week_row["id"])
                for day in week["days"]:
                    await conn.execute(
                        """
                        INSERT INTO curriculum_days
                            (curriculum_week_id, day_date, focus_topic, planned_minutes, tasks, checkpoint)
                        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
                        """,
                        week_id,
                        date.fromisoformat(day["date"]),
                        day["focus_topic"],
                        day["planned_minutes"],
                        json.dumps(day["tasks"], ensure_ascii=False),
                        day["checkpoint"],
                    )
    return curriculum_id


async def _load_curriculum(pool, curriculum_id: str) -> dict:
    curriculum = await pool.fetchrow(
        "SELECT id, user_cert_goal_id, version, generated_by, status, source_quiz_attempt_id, created_at FROM curricula WHERE id = $1",
        curriculum_id,
    )
    if curriculum is None:
        raise HTTPException(404, "학습 플랜을 찾을 수 없습니다")
    weeks = await pool.fetch(
        "SELECT id, week_number, theme, planned_hours FROM curriculum_weeks WHERE curriculum_id = $1 ORDER BY week_number",
        curriculum_id,
    )
    result_weeks = []
    for week in weeks:
        days = await pool.fetch(
            """
            SELECT id, day_date, focus_topic, planned_minutes, tasks, checkpoint, progress_status, edited_by
            FROM curriculum_days WHERE curriculum_week_id = $1 ORDER BY day_date
            """,
            week["id"],
        )
        result_weeks.append(
            {
                "week_number": week["week_number"],
                "theme": week["theme"],
                "planned_hours": float(week["planned_hours"]) if week["planned_hours"] is not None else None,
                "days": [_serialize_day(day) for day in days],
            }
        )
    return {
        "curriculum_id": str(curriculum["id"]),
        "goal_id": str(curriculum["user_cert_goal_id"]),
        "version": curriculum["version"],
        "generated_by": curriculum["generated_by"],
        "status": curriculum["status"],
        "source_quiz_attempt_id": str(curriculum["source_quiz_attempt_id"]) if curriculum["source_quiz_attempt_id"] else None,
        "weeks": result_weeks,
    }


async def _load_curriculum_day(pool, day_id: str) -> dict:
    day = await pool.fetchrow(
        "SELECT id, day_date, focus_topic, planned_minutes, tasks, checkpoint, progress_status, edited_by FROM curriculum_days WHERE id = $1",
        day_id,
    )
    if day is None:
        raise HTTPException(404, "학습일을 찾을 수 없습니다")
    return _serialize_day(day)


def _serialize_day(day) -> dict:
    tasks = day["tasks"]
    if isinstance(tasks, str):
        try:
            tasks = json.loads(tasks)
        except (TypeError, json.JSONDecodeError):
            tasks = []
    return {
        "day_id": str(day["id"]),
        "date": day["day_date"].isoformat(),
        "focus_topic": day["focus_topic"],
        "planned_minutes": day["planned_minutes"],
        "tasks": tasks or [],
        "checkpoint": day["checkpoint"],
        "progress_status": day["progress_status"],
        "edited_by": day["edited_by"],
    }

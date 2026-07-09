"""Learning plan APIs generated from certification goals, materials, and placement results."""

import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents import graph as agent_graph
from db import get_pool
from services import rag

router = APIRouter(prefix="/api/learning-plans", tags=["learning plans"])


class LearningPlanCreateRequest(BaseModel):
    certification_name: str = Field(..., min_length=1, max_length=120)
    quiz_attempt_id: str = Field(..., min_length=1)


@router.post("", status_code=201)
async def create_learning_plan(req: LearningPlanCreateRequest):
    pool = await get_pool()
    attempt = await pool.fetchrow(
        """
        SELECT a.id, a.user_id, q.id AS quiz_id, q.study_material_id, q.quiz_type,
               m.title AS material_title, m.ai_summary, m.key_concepts
        FROM quiz_attempts a
        JOIN quizzes q ON q.id = a.quiz_id
        LEFT JOIN study_materials m ON m.id = q.study_material_id
        WHERE a.id = $1
        """,
        req.quiz_attempt_id,
    )
    if attempt is None:
        raise HTTPException(404, "quiz attempt not found")
    if attempt["study_material_id"] is None:
        raise HTTPException(409, "this attempt is not connected to a study material")

    rows = await pool.fetch(
        """
        SELECT q.id AS question_id, q.question_order, q.question_type, q.question_text,
               q.correct_answer, q.topic_tag,
               COALESCE(q.question_difficulty, 'normal') AS question_difficulty,
               COALESCE(q.difficulty_score, 50) AS difficulty_score,
               a.user_answer, a.is_correct
        FROM quiz_answers a
        JOIN quiz_questions q ON q.id = a.quiz_question_id
        WHERE a.quiz_attempt_id = $1
        ORDER BY q.question_order
        """,
        req.quiz_attempt_id,
    )
    if not rows:
        raise HTTPException(409, "quiz attempt has no graded answers")

    evaluation = await _get_attempt_evaluation(pool, req.quiz_attempt_id)
    material_id = str(attempt["study_material_id"])
    topics = ", ".join(str(row["topic_tag"]) for row in rows if row["topic_tag"])
    chunks = await rag.retrieve_chunks(material_id, topics or attempt["material_title"], top_k=8)

    key_concepts = []
    if attempt["key_concepts"]:
        try:
            key_concepts = json.loads(attempt["key_concepts"])
        except (TypeError, json.JSONDecodeError):
            key_concepts = []

    plan = await agent_graph.run_generate_learning_plan(
        certification_name=req.certification_name,
        material_title=attempt["material_title"] or req.certification_name,
        current_date=date.today().isoformat(),
        material_summary=attempt["ai_summary"],
        key_concepts=key_concepts,
        learning_evaluation=evaluation,
        quiz_results=[dict(row) for row in rows],
        context=rag.format_context(chunks),
    )
    return {
        "quiz_attempt_id": req.quiz_attempt_id,
        "material_id": material_id,
        "quiz_type": attempt["quiz_type"],
        "plan": plan,
    }


async def _get_attempt_evaluation(pool, attempt_id: str) -> dict | None:
    row = await pool.fetchrow(
        """
        SELECT mastery_score, mastery_level, recommended_difficulty, confidence_score,
               difficulty_breakdown, strengths, weaknesses, ai_analysis
        FROM quiz_attempt_evaluations
        WHERE quiz_attempt_id = $1
        """,
        attempt_id,
    )
    if row is None:
        return None
    evaluation = dict(row)
    evaluation["mastery_score"] = float(evaluation["mastery_score"])
    evaluation["confidence_score"] = float(evaluation["confidence_score"])
    evaluation["analysis"] = evaluation.pop("ai_analysis", "") or ""
    return evaluation

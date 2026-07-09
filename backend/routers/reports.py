"""학습 리포트 - 요약 + 퀴즈 결과 + 오답 분석을 묶은 종합 리포트."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents import graph as agent_graph
from db import get_pool

router = APIRouter(prefix="/api/reports", tags=["학습 리포트"])


class ReportCreateRequest(BaseModel):
    study_material_id: str
    quiz_attempt_id: str | None = None
    user_id: str | None = None


@router.post("", status_code=201)
async def create_report(req: ReportCreateRequest):
    pool = await get_pool()
    material = await pool.fetchrow(
        "SELECT id, user_id, title, ai_summary FROM study_materials WHERE id = $1",
        req.study_material_id,
    )
    if material is None:
        raise HTTPException(404, "자료를 찾을 수 없습니다")

    attempt = None
    weak_points = []
    if req.quiz_attempt_id:
        attempt = await pool.fetchrow(
            "SELECT correct_count, total_count, score_pct FROM quiz_attempts WHERE id = $1",
            req.quiz_attempt_id,
        )
        weak_rows = await pool.fetch(
            """
            SELECT topic_tag, weakness_score, recommendation FROM weak_point_reports
            WHERE source_quiz_attempt_id = $1
            """,
            req.quiz_attempt_id,
        )
        weak_points = [dict(r) for r in weak_rows]

    report_text = await agent_graph.run_generate_report(
        material_title=material["title"],
        material_summary=material["ai_summary"],
        attempt=attempt,
        weak_points=weak_points,
    )

    wrong_analysis = "\n".join(
        f"[{w['topic_tag']}] {w['recommendation']}" for w in weak_points
    ) or None
    recommendation = weak_points[0]["recommendation"] if weak_points else None

    row = await pool.fetchrow(
        """
        INSERT INTO study_reports (user_id, study_material_id, quiz_attempt_id, summary, wrong_answer_analysis, recommendation)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
        """,
        req.user_id or str(material["user_id"]),
        req.study_material_id,
        req.quiz_attempt_id,
        report_text,
        wrong_analysis,
        recommendation,
    )
    return {
        "report_id": str(row["id"]),
        "summary": report_text,
        "wrong_answer_analysis": wrong_analysis,
        "weak_points": weak_points,
    }


@router.get("/{report_id}")
async def get_report(report_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM study_reports WHERE id = $1", report_id)
    if row is None:
        raise HTTPException(404, "리포트를 찾을 수 없습니다")
    return dict(row)

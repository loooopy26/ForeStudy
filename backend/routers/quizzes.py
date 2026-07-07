"""AI 퀴즈 - 자료 기반 퀴즈 생성 / 제출·자동 채점 / 오답(약점) 분석."""

import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import get_or_create_demo_user, get_pool
from services import rag, study_agent

router = APIRouter(prefix="/api", tags=["AI 퀴즈"])


class QuizCreateRequest(BaseModel):
    num_questions: int = Field(5, ge=1, le=20)
    difficulty: str = Field("normal", pattern="^(easy|normal|hard)$")
    focus_query: str | None = None  # 특정 주제 위주로 내고 싶을 때
    user_id: str | None = None


class AnswerItem(BaseModel):
    question_id: str
    answer: str


class QuizSubmitRequest(BaseModel):
    answers: list[AnswerItem]
    user_id: str | None = None


@router.post("/materials/{material_id}/quiz", status_code=201)
async def create_quiz(material_id: str, req: QuizCreateRequest):
    """자료 발췌를 근거로 퀴즈 생성. 정답/해설은 제출 전까지 응답에 포함하지 않는다."""
    pool = await get_pool()
    material = await pool.fetchrow(
        "SELECT id, user_id, title, processed_status FROM study_materials WHERE id = $1",
        material_id,
    )
    if material is None:
        raise HTTPException(404, "자료를 찾을 수 없습니다")
    if material["processed_status"] != "ready":
        raise HTTPException(409, f"자료 처리 상태가 '{material['processed_status']}' 입니다. ready 후 시도하세요.")

    # 취약 주제가 있으면 우선 출제
    user_id = req.user_id or str(material["user_id"])
    weak_rows = await pool.fetch(
        """
        SELECT topic_tag FROM weak_point_reports
        WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 3
        """,
        user_id,
    )
    weak_topics = [r["topic_tag"] for r in weak_rows]

    query = req.focus_query or f"{material['title']} 핵심 개념"
    chunks = await rag.retrieve_chunks(material_id, query, top_k=8)
    if not chunks:
        raise HTTPException(409, "검색 가능한 청크가 없습니다")

    questions = await study_agent.generate_quiz(
        rag.format_context(chunks),
        num_questions=req.num_questions,
        difficulty=req.difficulty,
        weak_topics=weak_topics or None,
    )

    async with pool.acquire() as conn:
        async with conn.transaction():
            quiz_row = await conn.fetchrow(
                """
                INSERT INTO quizzes (user_id, study_material_id, quiz_date, title, difficulty, generated_by, status)
                VALUES ($1, $2, $3, $4, $5, 'ai', 'pending') RETURNING id
                """,
                user_id,
                material_id,
                date.today(),
                f"{material['title']} 퀴즈",
                req.difficulty,
            )
            quiz_id = str(quiz_row["id"])
            out_questions = []
            for i, q in enumerate(questions):
                q_row = await conn.fetchrow(
                    """
                    INSERT INTO quiz_questions
                        (quiz_id, question_order, question_text, question_type,
                         options, correct_answer, explanation, topic_tag)
                    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING id
                    """,
                    quiz_id,
                    i + 1,
                    q["question_text"],
                    q.get("question_type", "multiple_choice"),
                    json.dumps(q.get("options"), ensure_ascii=False) if q.get("options") else None,
                    str(q["correct_answer"]),
                    q.get("explanation"),
                    q.get("topic_tag"),
                )
                out_questions.append(
                    {
                        "question_id": str(q_row["id"]),
                        "question_order": i + 1,
                        "question_text": q["question_text"],
                        "question_type": q.get("question_type", "multiple_choice"),
                        "options": q.get("options"),
                    }
                )

    return {"quiz_id": quiz_id, "difficulty": req.difficulty, "questions": out_questions}


@router.post("/quizzes/{quiz_id}/submit")
async def submit_quiz(quiz_id: str, req: QuizSubmitRequest):
    """답안 제출 → 자동 채점 → 오답 분석 및 약점 리포트 저장."""
    pool = await get_pool()
    quiz = await pool.fetchrow(
        "SELECT id, user_id, study_material_id FROM quizzes WHERE id = $1", quiz_id
    )
    if quiz is None:
        raise HTTPException(404, "퀴즈를 찾을 수 없습니다")

    q_rows = await pool.fetch(
        """
        SELECT id, question_text, question_type, correct_answer, explanation, topic_tag
        FROM quiz_questions WHERE quiz_id = $1 ORDER BY question_order
        """,
        quiz_id,
    )
    questions = {str(r["id"]): dict(r) for r in q_rows}
    submitted = {a.question_id: a.answer for a in req.answers}

    # 채점: 객관식/OX는 정규화 비교, 단답형은 LLM 채점
    results = []
    for qid, q in questions.items():
        user_answer = submitted.get(qid)
        if user_answer is None:
            is_correct = False
        elif q["question_type"] == "short_answer":
            is_correct = await study_agent.grade_short_answer(
                q["question_text"], q["correct_answer"], user_answer
            )
        else:
            is_correct = user_answer.strip().lower() == q["correct_answer"].strip().lower()
        results.append(
            {
                "question_id": qid,
                "user_answer": user_answer,
                "correct_answer": q["correct_answer"],
                "is_correct": is_correct,
                "explanation": q["explanation"],
                "topic_tag": q["topic_tag"],
            }
        )

    correct_count = sum(1 for r in results if r["is_correct"])
    total_count = len(results)
    score_pct = round(correct_count / total_count * 100, 2) if total_count else 0.0
    user_id = req.user_id or str(quiz["user_id"])

    async with pool.acquire() as conn:
        async with conn.transaction():
            attempt = await conn.fetchrow(
                """
                INSERT INTO quiz_attempts (quiz_id, user_id, submitted_at, correct_count, total_count, score_pct)
                VALUES ($1, $2, now(), $3, $4, $5) RETURNING id
                """,
                quiz_id,
                user_id,
                correct_count,
                total_count,
                score_pct,
            )
            attempt_id = str(attempt["id"])
            await conn.executemany(
                """
                INSERT INTO quiz_answers (quiz_attempt_id, quiz_question_id, user_answer, is_correct)
                VALUES ($1, $2, $3, $4)
                """,
                [(attempt_id, r["question_id"], r["user_answer"], r["is_correct"]) for r in results],
            )
            await conn.execute("UPDATE quizzes SET status = 'graded' WHERE id = $1", quiz_id)

    # 오답 분석 (틀린 문제가 있을 때만)
    wrong = [r for r in results if not r["is_correct"]]
    analysis = None
    if wrong:
        context = ""
        if quiz["study_material_id"]:
            topics = ", ".join(str(w["topic_tag"]) for w in wrong if w["topic_tag"])
            chunks = await rag.retrieve_chunks(
                str(quiz["study_material_id"]), topics or "핵심 개념", top_k=4
            )
            context = rag.format_context(chunks)
        analysis = await study_agent.analyze_wrong_answers(
            [
                {
                    "question_text": questions[w["question_id"]]["question_text"],
                    "correct_answer": w["correct_answer"],
                    "user_answer": w["user_answer"] or "(무응답)",
                    "topic_tag": w["topic_tag"] or "기타",
                }
                for w in wrong
            ],
            context,
        )
        await pool.executemany(
            """
            INSERT INTO weak_point_reports (user_id, topic_tag, weakness_score, recommendation, source_quiz_attempt_id)
            VALUES ($1, $2, $3, $4, $5)
            """,
            [
                (
                    user_id,
                    t["topic_tag"],
                    float(t["weakness_score"]),
                    t.get("recommendation"),
                    attempt_id,
                )
                for t in analysis.get("weak_topics", [])
            ],
        )

    return {
        "attempt_id": attempt_id,
        "score_pct": score_pct,
        "correct_count": correct_count,
        "total_count": total_count,
        "results": results,
        "wrong_answer_analysis": analysis,
    }

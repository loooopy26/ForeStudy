"""AI quiz routes for placement, study review, grading, and wrong-note review."""

import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import get_pool
from services import rag, study_agent

router = APIRouter(prefix="/api", tags=["AI quiz"])


class QuizCreateRequest(BaseModel):
    num_questions: int = Field(10, ge=1, le=25)
    difficulty: str = Field("normal", pattern="^(easy|normal|hard)$")
    focus_query: str | None = None
    user_id: str | None = None


class AnswerItem(BaseModel):
    question_id: str
    answer: str


class QuizSubmitRequest(BaseModel):
    answers: list[AnswerItem]
    user_id: str | None = None


class ReviewStartRequest(BaseModel):
    user_id: str | None = None
    time_limit_seconds_per_question: int = Field(120, ge=30, le=600)


class ReviewSubmitRequest(BaseModel):
    answer: str
    elapsed_seconds: int = Field(..., ge=0)


@router.post("/materials/{material_id}/quiz", status_code=201)
async def create_quiz(material_id: str, req: QuizCreateRequest):
    """Create the initial placement quiz: 10 multiple-choice questions."""
    return await _create_material_quiz(
        material_id,
        req,
        quiz_kind="placement",
        forced_num_questions=10,
        question_mix={"multiple_choice": 10},
        title_suffix="placement quiz",
    )


@router.post("/materials/{material_id}/review-quiz", status_code=201)
async def create_review_quiz(material_id: str, req: QuizCreateRequest):
    """Create the post-study review quiz: 20 MCQ + 5 short-answer questions."""
    return await _create_material_quiz(
        material_id,
        req,
        quiz_kind="study_review",
        forced_num_questions=25,
        question_mix={"multiple_choice": 20, "short_answer": 5},
        title_suffix="review quiz",
    )


async def _create_material_quiz(
    material_id: str,
    req: QuizCreateRequest,
    *,
    quiz_kind: str,
    forced_num_questions: int,
    question_mix: dict[str, int],
    title_suffix: str,
):
    pool = await get_pool()
    material = await pool.fetchrow(
        "SELECT id, user_id, title, processed_status FROM study_materials WHERE id = $1",
        material_id,
    )
    if material is None:
        raise HTTPException(404, "학습 자료를 찾을 수 없습니다")
    if material["processed_status"] != "ready":
        raise HTTPException(
            409,
            f"학습 자료 처리 상태가 '{material['processed_status']}'입니다. ready 상태에서 시도하세요.",
        )

    user_id = req.user_id or str(material["user_id"])
    weak_rows = await pool.fetch(
        """
        SELECT topic_tag FROM weak_point_reports
        WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 3
        """,
        user_id,
    )
    weak_topics = [row["topic_tag"] for row in weak_rows]

    query = req.focus_query or f"{material['title']} 핵심 개념"
    chunks = await rag.retrieve_chunks(material_id, query, top_k=8)
    if not chunks:
        raise HTTPException(409, "검색 가능한 학습 자료 청크가 없습니다")

    questions = await study_agent.generate_quiz(
        rag.format_context(chunks),
        num_questions=forced_num_questions,
        difficulty=req.difficulty,
        weak_topics=weak_topics or None,
        question_mix=question_mix,
    )
    if len(questions) < forced_num_questions:
        raise HTTPException(
            502,
            f"AI generated only {len(questions)} questions. Expected {forced_num_questions}.",
        )

    async with pool.acquire() as conn:
        async with conn.transaction():
            quiz_row = await conn.fetchrow(
                """
                INSERT INTO quizzes (user_id, study_material_id, quiz_date, title, difficulty, generated_by, status, quiz_type)
                VALUES ($1, $2, $3, $4, $5, 'ai', 'pending', $6) RETURNING id
                """,
                user_id,
                material_id,
                date.today(),
                f"{material['title']} {title_suffix}",
                req.difficulty,
                quiz_kind,
            )
            quiz_id = str(quiz_row["id"])
            out_questions = []
            for index, question in enumerate(questions[:forced_num_questions], start=1):
                q_row = await conn.fetchrow(
                    """
                    INSERT INTO quiz_questions
                        (quiz_id, question_order, question_text, question_type,
                         options, correct_answer, explanation, topic_tag)
                    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING id
                    """,
                    quiz_id,
                    index,
                    question["question_text"],
                    question.get("question_type", "multiple_choice"),
                    json.dumps(question.get("options"), ensure_ascii=False)
                    if question.get("options")
                    else None,
                    str(question["correct_answer"]),
                    question.get("explanation"),
                    question.get("topic_tag"),
                )
                out_questions.append(
                    {
                        "question_id": str(q_row["id"]),
                        "question_order": index,
                        "question_text": question["question_text"],
                        "question_type": question.get("question_type", "multiple_choice"),
                        "options": question.get("options"),
                    }
                )

    return {
        "quiz_id": quiz_id,
        "quiz_kind": quiz_kind,
        "difficulty": req.difficulty,
        "question_mix": question_mix,
        "questions": out_questions,
    }


@router.post("/quizzes/{quiz_id}/submit")
async def submit_quiz(quiz_id: str, req: QuizSubmitRequest):
    pool = await get_pool()
    await _ensure_wrong_answer_tables(pool)
    quiz = await pool.fetchrow(
        "SELECT id, user_id, study_material_id, COALESCE(quiz_type, 'study_review') AS quiz_type FROM quizzes WHERE id = $1",
        quiz_id,
    )
    if quiz is None:
        raise HTTPException(404, "퀴즈를 찾을 수 없습니다")

    q_rows = await pool.fetch(
        """
        SELECT id, question_order, question_text, question_type, options,
               correct_answer, explanation, topic_tag
        FROM quiz_questions WHERE quiz_id = $1 ORDER BY question_order
        """,
        quiz_id,
    )
    questions = {str(row["id"]): dict(row) for row in q_rows}
    submitted = {answer.question_id: answer.answer for answer in req.answers}

    results = []
    for question_id, question in questions.items():
        user_answer = submitted.get(question_id)
        if user_answer is None:
            is_correct = False
        elif question["question_type"] == "short_answer":
            is_correct = await study_agent.grade_short_answer(
                question["question_text"], question["correct_answer"], user_answer
            )
        else:
            is_correct = user_answer.strip().lower() == question["correct_answer"].strip().lower()

        results.append(
            {
                "question_id": question_id,
                "question_order": question["question_order"],
                "question_text": question["question_text"],
                "question_type": question["question_type"],
                "options": question["options"],
                "user_answer": user_answer,
                "correct_answer": question["correct_answer"],
                "is_correct": is_correct,
                "explanation": question["explanation"],
                "topic_tag": question["topic_tag"],
            }
        )

    correct_count = sum(1 for result in results if result["is_correct"])
    total_count = len(results)
    score_pct = round(correct_count / total_count * 100, 2) if total_count else 0.0
    user_id = req.user_id or str(quiz["user_id"])
    wrong_note_rows = []

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
                [
                    (attempt_id, result["question_id"], result["user_answer"], result["is_correct"])
                    for result in results
                ],
            )
            await conn.execute("UPDATE quizzes SET status = 'graded' WHERE id = $1", quiz_id)

            if quiz["quiz_type"] != "placement":
                for result in results:
                    if result["is_correct"]:
                        continue
                    note = await conn.fetchrow(
                        """
                        INSERT INTO wrong_answer_notes
                            (user_id, quiz_attempt_id, quiz_question_id, question_text,
                             user_answer, correct_answer, explanation, topic_tag, status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
                        ON CONFLICT (quiz_attempt_id, quiz_question_id) DO UPDATE SET
                            user_answer = EXCLUDED.user_answer,
                            correct_answer = EXCLUDED.correct_answer,
                            explanation = EXCLUDED.explanation,
                            topic_tag = EXCLUDED.topic_tag,
                            status = 'pending'
                        RETURNING id, status, created_at
                        """,
                        user_id,
                        attempt_id,
                        result["question_id"],
                        result["question_text"],
                        result["user_answer"],
                        result["correct_answer"],
                        result["explanation"],
                        result["topic_tag"],
                    )
                    wrong_note_rows.append(
                        {
                            "wrong_note_id": str(note["id"]),
                            "question_id": result["question_id"],
                            "question_text": result["question_text"],
                            "user_answer": result["user_answer"],
                            "correct_answer": result["correct_answer"],
                            "explanation": result["explanation"],
                            "topic_tag": result["topic_tag"],
                            "status": note["status"],
                        }
                    )

    wrong = [result for result in results if not result["is_correct"]]
    analysis = None
    if wrong and quiz["quiz_type"] != "placement":
        context = ""
        if quiz["study_material_id"]:
            topics = ", ".join(str(item["topic_tag"]) for item in wrong if item["topic_tag"])
            chunks = await rag.retrieve_chunks(
                str(quiz["study_material_id"]), topics or "핵심 개념", top_k=4
            )
            context = rag.format_context(chunks)
        analysis = await study_agent.analyze_wrong_answers(
            [
                {
                    "question_text": item["question_text"],
                    "correct_answer": item["correct_answer"],
                    "user_answer": item["user_answer"] or "(무응답)",
                    "topic_tag": item["topic_tag"] or "기타",
                }
                for item in wrong
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
                    topic["topic_tag"],
                    float(topic["weakness_score"]),
                    topic.get("recommendation"),
                    attempt_id,
                )
                for topic in analysis.get("weak_topics", [])
            ],
        )

    return {
        "attempt_id": attempt_id,
        "score_pct": score_pct,
        "correct_count": correct_count,
        "total_count": total_count,
        "quiz_type": quiz["quiz_type"],
        "results": results,
        "wrong_answer_notes": wrong_note_rows,
        "review": {
            "available": bool(wrong_note_rows),
            "time_limit_seconds_per_question": 120,
            "start_endpoint": f"/api/attempts/{attempt_id}/review/start" if wrong_note_rows else None,
        },
        "wrong_answer_analysis": analysis,
    }


@router.get("/attempts/{attempt_id}/wrong-notes")
async def get_wrong_answer_notes(attempt_id: str):
    pool = await get_pool()
    await _ensure_wrong_answer_tables(pool)
    rows = await pool.fetch(
        """
        SELECT
            n.id, n.quiz_attempt_id, n.quiz_question_id, n.question_text, q.question_type,
            q.options, n.user_answer, n.correct_answer, n.explanation, n.topic_tag,
            n.status, n.created_at, n.last_reviewed_at
        FROM wrong_answer_notes n
        JOIN quiz_questions q ON q.id = n.quiz_question_id
        WHERE n.quiz_attempt_id = $1
        ORDER BY q.question_order
        """,
        attempt_id,
    )
    return {"attempt_id": attempt_id, "wrong_notes": [_wrong_note_response(row) for row in rows]}


@router.post("/attempts/{attempt_id}/review/start", status_code=201)
async def start_wrong_answer_review(attempt_id: str, req: ReviewStartRequest):
    pool = await get_pool()
    await _ensure_wrong_answer_tables(pool)
    attempt = await pool.fetchrow("SELECT id, user_id FROM quiz_attempts WHERE id = $1", attempt_id)
    if attempt is None:
        raise HTTPException(404, "퀴즈 풀이 기록을 찾을 수 없습니다")

    user_id = req.user_id or str(attempt["user_id"])
    wrong_notes = await pool.fetch(
        """
        SELECT n.id, n.question_text, q.question_type, q.options, n.topic_tag, q.question_order
        FROM wrong_answer_notes n
        JOIN quiz_questions q ON q.id = n.quiz_question_id
        WHERE n.quiz_attempt_id = $1 AND n.status <> 'mastered'
        ORDER BY q.question_order
        """,
        attempt_id,
    )
    if not wrong_notes:
        raise HTTPException(409, "복습할 오답노트가 없습니다")

    async with pool.acquire() as conn:
        async with conn.transaction():
            session = await conn.fetchrow(
                """
                INSERT INTO wrong_answer_review_sessions
                    (user_id, source_quiz_attempt_id, total_questions,
                     time_limit_seconds_per_question, status)
                VALUES ($1, $2, $3, $4, 'in_progress')
                RETURNING id, started_at
                """,
                user_id,
                attempt_id,
                len(wrong_notes),
                req.time_limit_seconds_per_question,
            )
            session_id = str(session["id"])
            items = []
            for index, note in enumerate(wrong_notes, start=1):
                item = await conn.fetchrow(
                    """
                    INSERT INTO wrong_answer_review_items
                        (review_session_id, wrong_answer_note_id, item_order,
                         started_at, time_limit_seconds)
                    VALUES ($1, $2, $3, now(), $4)
                    RETURNING id, started_at
                    """,
                    session_id,
                    str(note["id"]),
                    index,
                    req.time_limit_seconds_per_question,
                )
                items.append(_review_item_prompt(item, note, index, req.time_limit_seconds_per_question))

    return {
        "review_session_id": session_id,
        "attempt_id": attempt_id,
        "started_at": session["started_at"],
        "time_limit_seconds_per_question": req.time_limit_seconds_per_question,
        "total_questions": len(items),
        "items": items,
    }


@router.get("/review-sessions/{session_id}")
async def get_wrong_answer_review_session(session_id: str):
    pool = await get_pool()
    await _ensure_wrong_answer_tables(pool)
    session = await pool.fetchrow(
        """
        SELECT id, user_id, source_quiz_attempt_id, started_at, completed_at,
               total_questions, time_limit_seconds_per_question, status
        FROM wrong_answer_review_sessions WHERE id = $1
        """,
        session_id,
    )
    if session is None:
        raise HTTPException(404, "복습 세션을 찾을 수 없습니다")

    rows = await pool.fetch(
        """
        SELECT
            i.id, i.item_order, i.started_at, i.submitted_at, i.time_limit_seconds,
            i.elapsed_seconds, i.user_answer AS review_answer, i.is_correct AS review_correct,
            n.id AS wrong_note_id, n.question_text, n.correct_answer, n.explanation,
            n.topic_tag, n.status AS note_status, q.question_type, q.options
        FROM wrong_answer_review_items i
        JOIN wrong_answer_notes n ON n.id = i.wrong_answer_note_id
        JOIN quiz_questions q ON q.id = n.quiz_question_id
        WHERE i.review_session_id = $1
        ORDER BY i.item_order
        """,
        session_id,
    )
    return {
        "review_session": dict(session),
        "items": [_review_item_response(row) for row in rows],
    }


@router.post("/review-sessions/{session_id}/items/{item_id}/submit")
async def submit_wrong_answer_review_item(session_id: str, item_id: str, req: ReviewSubmitRequest):
    pool = await get_pool()
    await _ensure_wrong_answer_tables(pool)
    row = await pool.fetchrow(
        """
        SELECT
            i.id, i.review_session_id, i.time_limit_seconds, n.id AS wrong_note_id,
            n.correct_answer, n.explanation, n.question_text, q.question_type
        FROM wrong_answer_review_items i
        JOIN wrong_answer_notes n ON n.id = i.wrong_answer_note_id
        JOIN quiz_questions q ON q.id = n.quiz_question_id
        WHERE i.id = $1 AND i.review_session_id = $2
        """,
        item_id,
        session_id,
    )
    if row is None:
        raise HTTPException(404, "복습 문항을 찾을 수 없습니다")

    timed_out = req.elapsed_seconds > row["time_limit_seconds"]
    if row["question_type"] == "short_answer":
        is_correct = await study_agent.grade_short_answer(
            row["question_text"], row["correct_answer"], req.answer
        )
    else:
        is_correct = req.answer.strip().lower() == row["correct_answer"].strip().lower()
    is_correct = bool(is_correct and not timed_out)
    note_status = "mastered" if is_correct else "reviewing"

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                UPDATE wrong_answer_review_items
                SET submitted_at = now(), elapsed_seconds = $1, user_answer = $2, is_correct = $3
                WHERE id = $4
                """,
                req.elapsed_seconds,
                req.answer,
                is_correct,
                item_id,
            )
            await conn.execute(
                """
                UPDATE wrong_answer_notes
                SET status = $1, last_reviewed_at = now()
                WHERE id = $2
                """,
                note_status,
                row["wrong_note_id"],
            )
            remaining = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM wrong_answer_review_items
                WHERE review_session_id = $1 AND submitted_at IS NULL
                """,
                session_id,
            )
            if remaining == 0:
                await conn.execute(
                    """
                    UPDATE wrong_answer_review_sessions
                    SET completed_at = now(), status = 'completed'
                    WHERE id = $1
                    """,
                    session_id,
                )

    return {
        "review_session_id": session_id,
        "item_id": item_id,
        "user_answer": req.answer,
        "correct_answer": row["correct_answer"],
        "is_correct": is_correct,
        "timed_out": timed_out,
        "elapsed_seconds": req.elapsed_seconds,
        "time_limit_seconds": row["time_limit_seconds"],
        "explanation": row["explanation"],
        "wrong_note_status": note_status,
    }


async def _ensure_wrong_answer_tables(pool) -> None:
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS wrong_answer_notes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            quiz_attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
            quiz_question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
            question_text TEXT NOT NULL,
            user_answer TEXT,
            correct_answer TEXT NOT NULL,
            explanation TEXT,
            topic_tag TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','reviewing','mastered')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_reviewed_at TIMESTAMPTZ,
            UNIQUE (quiz_attempt_id, quiz_question_id)
        );

        CREATE TABLE IF NOT EXISTS wrong_answer_review_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_quiz_attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at TIMESTAMPTZ,
            total_questions INT NOT NULL,
            time_limit_seconds_per_question INT NOT NULL DEFAULT 120,
            status TEXT NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress','completed','abandoned'))
        );

        CREATE TABLE IF NOT EXISTS wrong_answer_review_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            review_session_id UUID NOT NULL REFERENCES wrong_answer_review_sessions(id) ON DELETE CASCADE,
            wrong_answer_note_id UUID NOT NULL REFERENCES wrong_answer_notes(id) ON DELETE CASCADE,
            item_order INT NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            submitted_at TIMESTAMPTZ,
            time_limit_seconds INT NOT NULL DEFAULT 120,
            elapsed_seconds INT,
            user_answer TEXT,
            is_correct BOOLEAN,
            UNIQUE (review_session_id, wrong_answer_note_id)
        );
        """
    )


def _wrong_note_response(row) -> dict:
    return {
        "wrong_note_id": str(row["id"]),
        "attempt_id": str(row["quiz_attempt_id"]),
        "question_id": str(row["quiz_question_id"]),
        "question_text": row["question_text"],
        "question_type": row["question_type"],
        "options": row["options"],
        "user_answer": row["user_answer"],
        "correct_answer": row["correct_answer"],
        "explanation": row["explanation"],
        "topic_tag": row["topic_tag"],
        "status": row["status"],
        "created_at": row["created_at"],
        "last_reviewed_at": row["last_reviewed_at"],
    }


def _review_item_prompt(item, note, item_order: int, time_limit_seconds: int) -> dict:
    return {
        "review_item_id": str(item["id"]),
        "wrong_note_id": str(note["id"]),
        "item_order": item_order,
        "started_at": item["started_at"],
        "time_limit_seconds": time_limit_seconds,
        "question_text": note["question_text"],
        "question_type": note["question_type"],
        "options": note["options"],
        "topic_tag": note["topic_tag"],
    }


def _review_item_response(row) -> dict:
    submitted_at = row["submitted_at"]
    return {
        "review_item_id": str(row["id"]),
        "wrong_note_id": str(row["wrong_note_id"]),
        "item_order": row["item_order"],
        "started_at": row["started_at"],
        "submitted_at": submitted_at,
        "time_limit_seconds": row["time_limit_seconds"],
        "elapsed_seconds": row["elapsed_seconds"],
        "question_text": row["question_text"],
        "question_type": row["question_type"],
        "options": row["options"],
        "topic_tag": row["topic_tag"],
        "user_answer": row["review_answer"],
        "is_correct": row["review_correct"],
        "correct_answer": row["correct_answer"] if submitted_at else None,
        "explanation": row["explanation"] if submitted_at else None,
        "wrong_note_status": row["note_status"],
    }


@router.get("/attempts/{attempt_id}/answers")
async def get_attempt_answers(attempt_id: str, only: str = "all"):
    """응시(attempt) 채점 결과 조회. 맞은 것/틀린 것 모두 quiz_answers 에 저장돼 있어 함께 돌려준다.
    - only=all(기본): 전체, correct: 맞은 것만, wrong: 틀린 것만(오답 노트)
    - 객관식은 보기(options)까지 함께, 서술형은 options=null 로 반환.
    각 문항의 is_correct 로 정답/오답을 구분한다."""
    if only not in ("all", "correct", "wrong"):
        raise HTTPException(400, "only 는 all/correct/wrong 중 하나여야 합니다")

    pool = await get_pool()
    attempt = await pool.fetchrow(
        "SELECT id, score_pct, correct_count, total_count FROM quiz_attempts WHERE id = $1",
        attempt_id,
    )
    if attempt is None:
        raise HTTPException(404, "응시 기록을 찾을 수 없습니다")

    # only 값은 위에서 화이트리스트 검증했으므로 안전하게 조건만 덧붙인다.
    filter_sql = {"all": "", "correct": " AND a.is_correct = true", "wrong": " AND a.is_correct = false"}[only]
    rows = await pool.fetch(
        f"""
        SELECT q.id AS question_id, q.question_order, q.question_type, q.question_text,
               q.options, q.correct_answer, q.explanation, q.topic_tag,
               a.user_answer, a.is_correct
        FROM quiz_answers a
        JOIN quiz_questions q ON q.id = a.quiz_question_id
        WHERE a.quiz_attempt_id = $1{filter_sql}
        ORDER BY q.question_order
        """,
        attempt_id,
    )

    answers = []
    for r in rows:
        item = dict(r)
        item["question_id"] = str(item["question_id"])
        # options 는 JSONB. 코덱 미등록 시 문자열로 오므로 리스트로 복원 (서술형은 NULL)
        opts = item["options"]
        item["options"] = json.loads(opts) if isinstance(opts, str) else opts
        answers.append(item)

    return {
        "attempt_id": attempt_id,
        "score_pct": float(attempt["score_pct"]) if attempt["score_pct"] is not None else None,
        "correct_count": attempt["correct_count"],
        "total_count": attempt["total_count"],
        "returned": only,
        "answers": answers,
    }

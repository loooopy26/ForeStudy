# ForeStudy: source file for study_agent.
"""Study Agent helpers for summary, quiz generation, grading, and tutoring."""

import asyncio
import re
from datetime import date, timedelta
from math import ceil

from . import upstage

_SYSTEM = (
    "You are Forestudy's AI study coach. Answer in Korean. Use only the provided "
    "study-material context as evidence, and do not invent facts outside it."
)


async def summarize(material_title: str, sample_text: str) -> dict:
    prompt = f"""Analyze the study material titled "{material_title}".

{sample_text}

This summary is for exam study, so do not compress it into one vague paragraph.
Keep it detailed enough to study from directly: preserve every definition, number,
condition, example, and procedure that appears in the material.

Before summarizing, distinguish learning content from layout/navigation artifacts.

Ignore text that appears to be:
- page numbers, running headers, footers, section indexes, table-of-contents page references
- standalone numbers placed at line edges or after titles
- repeated document labels, chapter labels, copyright/footer text
- navigation-only entries that merely point to where content appears

Do not summarize a table of contents as if it were the actual learning content.
If the provided text is mostly a table of contents, produce only:
1. a brief structural overview of the material
2. the expected topics to study later
3. a warning that detailed concept summary requires the actual body pages

Keep numbers only when they are part of the actual concept, formula, condition, date, score, standard, procedure, or definition.
When unsure, keep the concept but remove page-reference-like numbers.

Line classification rule:
Classify extracted lines internally as one of:
- content: actual learning content
- structure: chapter/section heading
- artifact: page number, TOC page reference, header, footer, repeated label

Use content and structure for the summary.
Do not use artifact lines except when they are necessary to understand the document structure.

Korean output instruction:
요약 결과는 한국어로 작성한다.
본문 개념, 정의, 조건, 절차, 예시, 공식, 기준, 시험 포인트는 유지한다.
목차 페이지 번호, 우측 정렬된 페이지 참조 숫자, 반복되는 머리말/꼬리말, 단순 문서 장식 요소는 요약에 포함하지 않는다.

예시 판단:
- "1. 소프트웨어 설계 .... 12"에서 "12"는 페이지 참조일 가능성이 높으므로 제거한다.
- "TCP 포트 80", "정규화 1NF/2NF/3NF", "응답 시간 3초 이하" 같은 숫자는 개념 일부이므로 유지한다.
- 목차만 제공된 경우 세부 개념을 지어내지 말고, 교재 구조와 예상 학습 범위만 요약한다.
- 전체 교재 본문이 제공된 경우 본문 중심으로 자세히 요약하되, 반복 라벨과 페이지 번호는 제외한다.

Return JSON only:
{{
  "summary": "A Korean study note, broken into sections/topics that follow the material's own structure. Each section should have a short heading and spell out concrete definitions, numbers, examples, and procedures. Aim for roughly 1500-2500 Korean words total — detailed, but not exhaustive to the point of restating the entire source. Markdown is fine.",
  "key_concepts": [
    {{"concept": "core concept name", "description": "Korean definition plus concrete numbers/examples/comparisons drawn from the material (2~4 sentences)"}}
  ]
}}
Extract 5~10 key concepts."""
    # max_tokens 없이(무제한) 매우 길고 촘촘한 자료에 대해 응답 생성이 240초 타임아웃을
    # 넘겨 ingest가 실패하는 사례가 있었다 — 위 프롬프트의 분량 상한과 함께 하드 캡을 둔다.
    return await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        max_tokens=4000,
    )

async def generate_quiz(
    context: str,
    *,
    num_questions: int,
    difficulty: str,
    weak_topics: list[str] | None = None,
    question_mix: dict[str, int] | None = None,
    quiz_kind: str = "study_review",
    learner_profile: dict | None = None,
) -> list[dict]:
    """Generate a quiz matching question_mix exactly.

    Each question type is requested in its own model call instead of one mixed
    call. A single shared JSON example biases the model toward whatever shape
    that example shows (multiple_choice options), so mixed-type requests were
    silently coming back as all multiple_choice regardless of the requested
    mix. Splitting by type removes that ambiguity."""
    mix = question_mix or {"multiple_choice": num_questions}
    # Large single prompts often come back capped around 10 items, so split each
    # requested type into smaller model calls and merge the generated questions.
    batch_size = 10
    batch_requests = []
    for question_type, count in mix.items():
        remaining = count
        while remaining > 0:
            batch_requests.append((question_type, min(batch_size, remaining)))
            remaining -= batch_size

    batches = await asyncio.gather(
        *[
            _generate_quiz_batch(
                context,
                question_type=question_type,
                count=batch_count,
                difficulty=difficulty,
                weak_topics=weak_topics,
                quiz_kind=quiz_kind,
                learner_profile=learner_profile,
            )
            for question_type, batch_count in batch_requests
        ]
    )
    return [question for batch in batches for question in batch]


async def _generate_quiz_batch(
    context: str,
    *,
    question_type: str,
    count: int,
    difficulty: str,
    weak_topics: list[str] | None,
    quiz_kind: str,
    learner_profile: dict | None,
) -> list[dict]:
    weak_hint = (
        f"\nPrioritize these weak topics when relevant: {', '.join(weak_topics)}."
        if weak_topics
        else ""
    )

    if question_type == "multiple_choice":
        type_instruction = (
            "Every question's question_type must be exactly \"multiple_choice\". "
            "Provide exactly 4 options and set correct_answer to the exact option text. "
            "Each option must be a distinct, substantive answer choice written out in full — "
            "never a bare letter like \"A\"/\"B\"/\"C\"/\"D\", never a placeholder, and never "
            "duplicated or reworded from another option in the same question."
        )
        example_fields = '"question_type": "multiple_choice",\n      "options": ["option1", "option2", "option3", "option4"],\n      "correct_answer": "the exact matching option text",'
    elif question_type == "short_answer":
        type_instruction = (
            "Every question's question_type must be exactly \"short_answer\". "
            "Set options to an empty array [] and put a concise model answer in correct_answer. "
            "Do not generate multiple-choice options for these questions."
        )
        example_fields = '"question_type": "short_answer",\n      "options": [],\n      "correct_answer": "concise model answer",'
    else:
        type_instruction = (
            f"Every question's question_type must be exactly \"{question_type}\". "
            "Set options to [\"O\", \"X\"] and correct_answer to \"O\" or \"X\"."
        )
        example_fields = f'"question_type": "{question_type}",\n      "options": ["O", "X"],\n      "correct_answer": "O",'

    if quiz_kind == "placement":
        level_instruction = (
            "This is a placement test. Create a balanced set across easy, normal, and hard levels "
            "so the learner's starting mastery can be diagnosed."
        )
    else:
        level_instruction = (
            "This is a post-study review quiz. Adjust the difficulty to the learner profile below, "
            "while still checking weak topics.\n"
            f"{_format_profile_for_prompt(learner_profile)}"
        )

    prompt = f"""Create {count} {question_type} quiz questions from the study-material context below.
Overall requested difficulty: {difficulty}.{weak_hint}

{context}

{type_instruction}

{level_instruction}

Return JSON only:
{{
  "questions": [
    {{
      "question_text": "Korean question",
      {example_fields}
      "explanation": "Korean explanation with evidence from the material",
      "topic_tag": "topic keyword",
      "question_difficulty": "easy | normal | hard",
      "difficulty_score": 1,
      "difficulty_reason": "Korean reason why this question has that difficulty"
    }}
  ]
}}
The questions array length must be exactly {count}.
difficulty_score must be an integer from 1 to 100."""
    messages = [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]

    last_normalized: list[dict] = []
    for attempt in range(3):
        result = await upstage.chat_json(messages, temperature=0.5)
        questions = result["questions"][:count]
        normalized = [_normalize_question(question) for question in questions]
        for question in normalized:
            if question_type == "short_answer":
                question["question_type"] = "short_answer"
                question["options"] = []
            elif question_type == "multiple_choice":
                question["question_type"] = "multiple_choice"
                question["options"] = (question.get("options") or [])[:4]
            else:
                question["question_type"] = question.get("question_type") or question_type
        last_normalized = normalized
        broken = [q for q in normalized if not _is_question_well_formed(q)]
        if not broken and len(normalized) == count:
            return normalized
        # The model sometimes drops the "options" array for a question (more common on
        # "hard" items), returns duplicate/placeholder options, or returns fewer items
        # than requested. Retry generation instead of silently shipping a broken quiz.
    raise RuntimeError(
        f"AI가 {count}개의 {question_type} 문제를 3번 시도해도 유효하게 만들지 못했습니다 "
        "(중복되거나 비어있는 보기 포함)."
    )


def _is_question_well_formed(question: dict) -> bool:
    """퀴즈로 내보내기 전 최소한의 무결성 검사.

    사용자에게 보여주기 전에 걸러야 하는 실제 사례: 보기 두 개가 완전히 같은 문장인
    경우(선택 시 두 버튼이 동시에 체크됨), 보기가 "A"/"B" 같은 자리표시자만 있는 경우,
    correct_answer가 실제 보기 중 어느 것과도 일치하지 않아 채점이 항상 틀리게 되는 경우."""
    question_text = str(question.get("question_text") or "").strip()
    correct_answer = str(question.get("correct_answer") or "").strip()
    if len(question_text) < 5 or not correct_answer:
        return False

    question_type = question.get("question_type")
    if question_type == "multiple_choice":
        options = [str(o).strip() for o in (question.get("options") or [])]
        if len(options) < 2:
            return False
        if any(len(o) < 3 for o in options):
            return False
        if len({o.lower() for o in options}) != len(options):
            return False
        if correct_answer.lower() not in {o.lower() for o in options}:
            return False
    elif question_type == "short_answer":
        if len(correct_answer) < 2:
            return False
    else:
        options = [str(o).strip() for o in (question.get("options") or [])]
        if options and correct_answer not in options:
            return False
    return True


async def grade_short_answer(question: str, correct_answer: str, user_answer: str) -> bool:
    prompt = f"""Question: {question}
Model answer: {correct_answer}
Student answer: {user_answer}

Return JSON only: {{"correct": true or false}}
Mark true if the student's meaning matches the model answer, even if wording differs."""
    result = await upstage.chat_json([{"role": "user", "content": prompt}], temperature=0.0)
    return bool(result.get("correct"))


async def analyze_wrong_answers(wrong_items: list[dict], context: str) -> dict:
    wrong_text = "\n".join(
        f"- question: {item['question_text']} / correct: {item['correct_answer']} / "
        f"student: {item['user_answer']} / topic: {item['topic_tag']}"
        for item in wrong_items
    )
    prompt = f"""These are the learner's wrong answers.

{wrong_text}

Related study-material context:
{context}

Return JSON only:
{{
  "analysis": "Korean analysis of why the learner missed these questions",
  "weak_topics": [
    {{"topic_tag": "topic", "weakness_score": 0, "recommendation": "Korean recommendation"}}
  ]
}}"""
    return await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
    )


async def analyze_wrong_note(
    *,
    question_text: str,
    correct_answer: str,
    user_answer: str | None,
    explanation: str | None = None,
    topic_tag: str | None = None,
) -> str:
    """Explain why a single wrong answer was likely missed."""
    prompt = f"""Analyze this single wrong quiz answer for a Korean learner.

Question:
{question_text}

Learner answer:
{user_answer or "(미응답)"}

Correct answer:
{correct_answer}

Original explanation:
{explanation or "(none)"}

Topic:
{topic_tag or "general"}

Write feedback that will be shown immediately after grading.
Focus on the learner's actual wrong answer, not only on the correct answer.
Include:
- why the learner answer is wrong or incomplete
- the concept that should be reviewed
- common confusion points or traps
- one concrete caution or study tip for next time

Do not include citation labels or source markers such as "발췌 0", "발췌 43에서", "출처 1", "[0]", or "(p.1)".
Do not mention that this is based on an excerpt.

Return JSON only:
{{
  "mistake_analysis": "Korean feedback in 3~5 sentences. Directly compare the learner answer with the correct answer, explain the likely misconception, mention a confusing point or trap, and give a short study tip."
}}"""
    result = await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return result.get("mistake_analysis") or ""


async def evaluate_learning_level(
    *,
    quiz_type: str,
    quiz_difficulty: str,
    results: list[dict],
    previous_profile: dict | None = None,
) -> dict:
    result_text = "\n".join(
        (
            f"- order={item['question_order']}, type={item['question_type']}, "
            f"question_difficulty={item.get('question_difficulty') or 'normal'}, "
            f"difficulty_score={item.get('difficulty_score') or 50}, "
            f"topic={item.get('topic_tag') or 'general'}, correct={item['is_correct']}, "
            f"question={item['question_text']}"
        )
        for item in results
    )
    prompt = f"""Evaluate this learner's mastery from the quiz result.

Quiz type: {quiz_type}
Quiz overall difficulty: {quiz_difficulty}
Previous learner profile:
{_format_profile_for_prompt(previous_profile)}

Question results:
{result_text}

Return JSON only:
{{
  "mastery_score": 0,
  "mastery_level": "beginner | intermediate | advanced",
  "recommended_difficulty": "easy | normal | hard",
  "confidence_score": 0,
  "difficulty_breakdown": {{
    "easy": {{"correct": 0, "total": 0}},
    "normal": {{"correct": 0, "total": 0}},
    "hard": {{"correct": 0, "total": 0}}
  }},
  "strengths": ["Korean strength topic"],
  "weaknesses": ["Korean weakness topic"],
  "analysis": "Korean explanation of mastery and next quiz difficulty"
}}

Rules:
- Placement tests estimate the starting level. Do not mention wrong-answer notes.
- Review quizzes update the level based on whether the learner improved.
- Consider both correct count and the difficulty of questions answered correctly.
- If the learner mostly misses easy/normal questions, recommend easy.
- If the learner handles normal questions but misses hard questions, recommend normal.
- If the learner handles hard questions consistently, recommend hard."""
    result = await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.1,
    )
    return _normalize_level_evaluation(result)


async def generate_learning_plan(
    *,
    certification_name: str,
    material_title: str,
    current_date: str,
    material_summary: str | None,
    key_concepts: list | None,
    learning_evaluation: dict | None,
    quiz_results: list[dict],
    context: str,
) -> dict:
    concept_text = "\n".join(
        f"- {item.get('concept') or item.get('name')}: {item.get('description') or ''}"
        if isinstance(item, dict)
        else f"- {item}"
        for item in (key_concepts or [])[:12]
    )
    result_text = "\n".join(
        (
            f"- order={item.get('question_order')}, correct={item.get('is_correct')}, "
            f"difficulty={item.get('question_difficulty') or 'normal'}, "
            f"topic={item.get('topic_tag') or 'general'}, "
            f"question={item.get('question_text')}"
        )
        for item in quiz_results
    )
    prompt = f"""Create a personalized Korean study plan for a certification learner.

Certification: {certification_name}
Current date: {current_date}
Uploaded material title: {material_title}

Material summary:
{material_summary or "(none)"}

Key concepts:
{concept_text or "(none)"}

Placement test learning evaluation:
{_format_profile_for_prompt(learning_evaluation)}

Placement test results:
{result_text}

Study-material context:
{context}

You do not have live web browsing. If exact official exam dates are not present in the material,
do not pretend they are confirmed. Give an estimated schedule basis and tell the learner to adjust
the plan after confirming the official exam date.

Do not include citation labels or source markers such as "발췌 0", "발췌 43에서", "출처 1", "[0]", or "(p.1)"
anywhere in the output. Also never append a bare parenthetical number after a concept/topic name as a
reference tag, e.g. "캡슐화(033)" or "소프트웨어 공학의 기본 원칙(001)" — the numbers in the "--- 발췌 N ---"
context headers are internal excerpt indices for your own grounding only; never echo them, with or without
the word "발췌". Write goals, tasks, and checkpoints as plain study instructions, referring to concepts by
name only.

Return JSON only:
{{
  "certification_name": "certification name",
  "exam_schedule_note": "Korean note about official exam date confidence and what to verify",
  "learner_level_summary": "Korean summary of the learner's current level",
  "recommended_total_weeks": 4,
  "weekly_plan": [
    {{
      "week": 1,
      "theme": "Korean weekly theme",
      "goals": ["Korean goal"],
      "study_tasks": ["Korean task based on the uploaded material"],
      "review_tasks": ["Korean review task"],
      "checkpoint": "Korean checkpoint quiz/review instruction"
    }}
  ],
  "daily_routine": ["Korean daily routine item"],
  "weak_topic_strategy": ["Korean strategy for weak topics"],
  "adjustment_tips": ["Korean tip for changing the plan when the official exam date is confirmed"]
}}

Rules:
- Build the plan from the uploaded material and placement result.
- Keep it practical for a beginner unless the evaluation clearly says otherwise.
- Include review/quiz checkpoints every week.
- Make 4 to 8 weeks depending on learner level and material scope.
- Do not mention fine tuning, vLLM, or LangChain to the learner."""
    result = await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.25,
    )
    return _normalize_learning_plan(result, certification_name)


async def generate_daily_learning_plan(
    *,
    certification_name: str,
    material_title: str,
    current_date: str,
    target_exam_date: str,
    remaining_days: int,
    material_summary: str | None,
    key_concepts: list | None,
    learning_evaluation: dict | None,
    quiz_results: list[dict],
    context: str,
) -> dict:
    """남은 일수에 정확히 맞춘 일별 학습 플랜. 주차 수/일수를 모델이 임의로 고르지 않도록
    먼저 파이썬에서 주차·일수 배분을 계산한 뒤, 주차 스켈레톤 1회 + 주차별 일일 계획을
    asyncio.gather로 병렬 생성한다(각각 _generate_quiz_batch와 동일한 배치+검증+재시도 패턴)."""
    total_weeks = max(1, ceil(remaining_days / 7))
    day_counts = _distribute_days(remaining_days, total_weeks)

    concept_text = "\n".join(
        f"- {item.get('concept') or item.get('name')}: {item.get('description') or ''}"
        if isinstance(item, dict)
        else f"- {item}"
        for item in (key_concepts or [])[:12]
    )
    result_text = "\n".join(
        (
            f"- order={item.get('question_order')}, correct={item.get('is_correct')}, "
            f"difficulty={item.get('question_difficulty') or 'normal'}, "
            f"topic={item.get('topic_tag') or 'general'}, "
            f"question={item.get('question_text')}"
        )
        for item in quiz_results
    )

    skeleton = await _generate_weekly_skeleton(
        certification_name=certification_name,
        material_title=material_title,
        total_weeks=total_weeks,
        concept_text=concept_text,
        result_text=result_text,
        learning_evaluation=learning_evaluation,
        context=context,
    )

    start_date = date.fromisoformat(current_date)
    week_start_dates = []
    cursor = start_date
    for count in day_counts:
        week_start_dates.append(cursor)
        cursor += timedelta(days=count)

    weeks = await asyncio.gather(
        *[
            _generate_week_days(
                week=skeleton[i],
                day_count=day_counts[i],
                week_start_date=week_start_dates[i],
                certification_name=certification_name,
                material_title=material_title,
                concept_text=concept_text,
                context=context,
            )
            for i in range(total_weeks)
        ]
    )

    return {
        "certification_name": certification_name,
        "target_exam_date": target_exam_date,
        "total_days": remaining_days,
        "weeks": weeks,
    }


def _distribute_days(remaining_days: int, total_weeks: int) -> list[int]:
    """remaining_days를 total_weeks개 주차에 최대한 고르게 나눈다 (합이 정확히 remaining_days)."""
    base, remainder = divmod(remaining_days, total_weeks)
    return [base + 1 if i < remainder else base for i in range(total_weeks)]


async def _generate_weekly_skeleton(
    *,
    certification_name: str,
    material_title: str,
    total_weeks: int,
    concept_text: str,
    result_text: str,
    learning_evaluation: dict | None,
    context: str,
) -> list[dict]:
    prompt = f"""Create a {total_weeks}-week study plan skeleton (themes only, no daily detail yet)
for a certification learner preparing for "{certification_name}" using the uploaded material "{material_title}".

Key concepts:
{concept_text or "(none)"}

Placement test learning evaluation:
{_format_profile_for_prompt(learning_evaluation)}

Placement test results:
{result_text or "(none)"}

Study-material context:
{context}

Do not include citation labels or source markers such as "발췌 0", "발췌 43에서", "출처 1", "[0]", or "(p.1)"
anywhere in the output. Also never append a bare parenthetical number after a concept/topic name as a
reference tag, e.g. "캡슐화(033)" or "소프트웨어 공학의 기본 원칙(001)" — the numbers in the "--- 발췌 N ---"
context headers are internal excerpt indices for your own grounding only; never echo them, with or without
the word "발췌". Write themes as plain study topics, referring to concepts by name only.

Return JSON only:
{{
  "weeks": [
    {{"week_number": 1, "theme": "Korean weekly theme", "planned_hours": 8}}
  ]
}}
The weeks array length must be exactly {total_weeks}, numbered 1 to {total_weeks} in order."""
    messages = [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]

    for _ in range(3):
        result = await upstage.chat_json(messages, temperature=0.3)
        weeks = result.get("weeks")
        if isinstance(weeks, list) and len(weeks) == total_weeks:
            return [
                {
                    "week_number": index + 1,
                    "theme": _clean_source_labels(str(week.get("theme") or f"{index + 1}주차 학습").strip())
                    or f"{index + 1}주차 학습",
                    "planned_hours": float(week.get("planned_hours") or 0) or None,
                }
                for index, week in enumerate(weeks)
            ]
    raise RuntimeError(f"AI가 {total_weeks}주차 학습 플랜 개요를 유효하게 만들지 못했습니다.")


async def _generate_week_days(
    *,
    week: dict,
    day_count: int,
    week_start_date: date,
    certification_name: str,
    material_title: str,
    concept_text: str,
    context: str,
) -> dict:
    prompt = f"""Create exactly {day_count} daily study plans for week {week['week_number']}
("{week['theme']}") of a certification study plan for "{certification_name}", based on the
uploaded material "{material_title}".

Key concepts:
{concept_text or "(none)"}

Study-material context:
{context}

Do not include citation labels or source markers such as "발췌 0", "발췌 43에서", "출처 1", "[0]", or "(p.1)"
anywhere in the output. Also never append a bare parenthetical number after a concept/topic name as a
reference tag, e.g. "캡슐화(033)" or "소프트웨어 공학의 기본 원칙(001)" — the numbers in the "--- 발췌 N ---"
context headers are internal excerpt indices for your own grounding only; never echo them, with or without
the word "발췌". Write focus_topic, tasks, and checkpoint as plain study instructions, referring to
concepts by name only.

Return JSON only:
{{
  "days": [
    {{
      "day_offset": 0,
      "focus_topic": "Korean focus topic for this day",
      "planned_minutes": 60,
      "tasks": ["Korean study task"],
      "checkpoint": "Korean short review/self-check instruction for this day"
    }}
  ]
}}
The days array length must be exactly {day_count}, with day_offset from 0 to {day_count - 1} in order."""
    messages = [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]

    for _ in range(3):
        result = await upstage.chat_json(messages, temperature=0.4)
        days = result.get("days")
        if isinstance(days, list) and len(days) == day_count and all(_is_day_well_formed(d) for d in days):
            normalized_days = [
                {
                    "day_offset": index,
                    "date": (week_start_date + timedelta(days=index)).isoformat(),
                    "focus_topic": _clean_source_labels(str(day.get("focus_topic") or "").strip()),
                    "planned_minutes": int(day.get("planned_minutes") or 60),
                    "tasks": _clean_source_labels(_as_text_list(day.get("tasks"))),
                    "checkpoint": _clean_source_labels(str(day.get("checkpoint") or "").strip()),
                }
                for index, day in enumerate(days)
            ]
            return {
                "week_number": week["week_number"],
                "theme": week["theme"],
                "planned_hours": week.get("planned_hours"),
                "days": normalized_days,
            }
    raise RuntimeError(
        f"AI가 {week['week_number']}주차의 {day_count}일 분량 학습 계획을 유효하게 만들지 못했습니다."
    )


def _is_day_well_formed(day: dict) -> bool:
    if not isinstance(day, dict):
        return False
    focus_topic = str(day.get("focus_topic") or "").strip()
    return len(focus_topic) >= 2


async def generate_report(
    *,
    material_title: str,
    material_summary: str | None,
    attempt: dict | None,
    weak_points: list[dict],
) -> str:
    """학습 리포트 생성. routers/reports.py에서 이관 — 프롬프트는 그대로이며
    아직 _SYSTEM/JSON 모드를 적용하지 않았다 (톤 변화는 별도 승인 필요)."""
    quiz_part = (
        f"퀴즈 결과: {attempt['correct_count']}/{attempt['total_count']} ({attempt['score_pct']}점)\n"
        + "\n".join(
            f"- 취약 주제 {w['topic_tag']} (점수 {w['weakness_score']}): {w['recommendation']}"
            for w in weak_points
        )
        if attempt
        else "퀴즈 미응시"
    )
    prompt = f"""학습 자료 "{material_title}"에 대한 학습 리포트를 작성하세요.

자료 요약: {material_summary or '(요약 없음)'}

{quiz_part}

학생을 격려하는 어조로, 잘한 점과 보완할 점, 다음 학습 추천을 담아 5~7문장으로 작성하세요."""
    return await upstage.chat([{"role": "user", "content": prompt}])


async def tutor_reply(history: list[dict], context: str | None) -> str:
    system = _SYSTEM + (
        " You are now a 1:1 tutor. Prefer hints and Socratic questions over immediately "
        "revealing the answer, but if the student asks a direct factual question "
        "(a number, a definition, a specific value from the material), answer it directly "
        "and briefly instead of withholding it.\n"
        "Output ONLY the final reply shown to the student: natural conversational Korean, "
        "no step-by-step reasoning, no English, no phrases like 'Let me check' or 'Wait' "
        "or 'excerpt N says' — do not narrate your own thought process."
    )
    if context:
        system += f"\n\n[Study-material context]\n{context}"
    messages = [{"role": "system", "content": system}] + history
    return await upstage.chat(messages, temperature=0.4)


def _normalize_question(question: dict) -> dict:
    question_type = question.get("question_type", "multiple_choice")
    if question_type == "short_answer":
        question["options"] = []
    elif question_type == "ox":
        question["options"] = question.get("options") or ["O", "X"]
    else:
        question["question_type"] = "multiple_choice"
        question["options"] = (question.get("options") or [])[:4]
    if question.get("question_difficulty") not in ("easy", "normal", "hard"):
        question["question_difficulty"] = "normal"
    try:
        score = int(question.get("difficulty_score") or 50)
    except (TypeError, ValueError):
        score = 50
    question["difficulty_score"] = max(1, min(100, score))
    question["difficulty_reason"] = question.get("difficulty_reason") or None
    return question


def _normalize_level_evaluation(result: dict) -> dict:
    level = result.get("mastery_level")
    if level not in ("beginner", "intermediate", "advanced"):
        level = "intermediate"
    recommended = result.get("recommended_difficulty")
    if recommended not in ("easy", "normal", "hard"):
        recommended = "normal"
    try:
        mastery_score = float(result.get("mastery_score", 50))
    except (TypeError, ValueError):
        mastery_score = 50.0
    try:
        confidence_score = float(result.get("confidence_score", 50))
    except (TypeError, ValueError):
        confidence_score = 50.0
    return {
        "mastery_score": max(0.0, min(100.0, mastery_score)),
        "mastery_level": level,
        "recommended_difficulty": recommended,
        "confidence_score": max(0.0, min(100.0, confidence_score)),
        "difficulty_breakdown": result.get("difficulty_breakdown") or {},
        "strengths": result.get("strengths") or [],
        "weaknesses": result.get("weaknesses") or [],
        "analysis": result.get("analysis") or "",
    }


def _normalize_learning_plan(result: dict, certification_name: str) -> dict:
    weeks = result.get("weekly_plan")
    if not isinstance(weeks, list):
        weeks = []
    normalized_weeks = []
    for index, week in enumerate(weeks[:8], start=1):
        if not isinstance(week, dict):
            continue
        normalized_weeks.append(
            {
                "week": int(week.get("week") or index),
                "theme": _clean_source_labels(week.get("theme")) or f"{index}주차 학습",
                "goals": _clean_source_labels(_as_text_list(week.get("goals"))),
                "study_tasks": _clean_source_labels(_as_text_list(week.get("study_tasks"))),
                "review_tasks": _clean_source_labels(_as_text_list(week.get("review_tasks"))),
                "checkpoint": _clean_source_labels(week.get("checkpoint")) or "",
            }
        )
    return {
        "certification_name": result.get("certification_name") or certification_name,
        "exam_schedule_note": _clean_source_labels(result.get("exam_schedule_note")) or "공식 시험일을 확인한 뒤 학습 기간을 조정하세요.",
        "learner_level_summary": _clean_source_labels(result.get("learner_level_summary")) or "",
        "recommended_total_weeks": int(result.get("recommended_total_weeks") or len(normalized_weeks) or 4),
        "weekly_plan": normalized_weeks,
        "daily_routine": _clean_source_labels(_as_text_list(result.get("daily_routine"))),
        "weak_topic_strategy": _clean_source_labels(_as_text_list(result.get("weak_topic_strategy"))),
        "adjustment_tips": _clean_source_labels(_as_text_list(result.get("adjustment_tips"))),
    }


_SOURCE_LABEL_RE = re.compile(
    r"(?:발췌|출처)\s*\d+\s*(?:\([^)]+\))?\s*(?:의|에서|:)?\s*"
    r"|\[\d+\]\s*"
    r"|\(p\.\s*\d+\)\s*"
)


def _clean_source_labels(text):
    """RAG 컨텍스트의 '--- 발췌 N ---' 라벨이 프롬프트 지시를 어기고 출력에
    그대로 새어나오는 경우를 대비한 후처리 필터 (routers/quizzes.py의 동일 패턴)."""
    if text is None:
        return text
    if isinstance(text, list):
        return [_clean_source_labels(item) for item in text]
    return _SOURCE_LABEL_RE.sub("", str(text)).strip()


def _as_text_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if value:
        return [str(value)]
    return []


def _format_profile_for_prompt(profile: dict | None) -> str:
    if not profile:
        return "No previous learner profile."
    return (
        f"mastery_level={profile.get('mastery_level')}, "
        f"mastery_score={profile.get('mastery_score')}, "
        f"recommended_difficulty={profile.get('recommended_difficulty')}, "
        f"confidence_score={profile.get('confidence_score')}, "
        f"analysis={profile.get('ai_analysis') or profile.get('analysis') or ''}"
    )

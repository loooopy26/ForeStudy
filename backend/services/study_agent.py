# ForeStudy: source file for study_agent.
"""Study Agent helpers for summary, quiz generation, grading, and tutoring."""

import asyncio

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

Return JSON only:
{{
  "summary": "A Korean study note, broken into sections/topics that follow the material's own structure. Each section should have a short heading and spell out concrete definitions, numbers, examples, and procedures. No length limit — be as detailed as the material warrants. Markdown is fine.",
  "key_concepts": [
    {{"concept": "core concept name", "description": "Korean definition plus concrete numbers/examples/comparisons drawn from the material (2~4 sentences)"}}
  ]
}}
Extract 5~10 key concepts."""
    return await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
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
            "Provide exactly 4 options and set correct_answer to the exact option text."
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
        broken = [
            q for q in normalized
            if q["question_type"] == "multiple_choice" and len(q["options"]) < 2
        ]
        if not broken and len(normalized) == count:
            return normalized
        # The model sometimes drops the "options" array for a question (more common on
        # "hard" items) or returns fewer items than requested. Retry generation instead
        # of silently shipping an incomplete/unanswerable batch.
    return last_normalized


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
                "theme": week.get("theme") or f"{index}주차 학습",
                "goals": _as_text_list(week.get("goals")),
                "study_tasks": _as_text_list(week.get("study_tasks")),
                "review_tasks": _as_text_list(week.get("review_tasks")),
                "checkpoint": week.get("checkpoint") or "",
            }
        )
    return {
        "certification_name": result.get("certification_name") or certification_name,
        "exam_schedule_note": result.get("exam_schedule_note") or "공식 시험일을 확인한 뒤 학습 기간을 조정하세요.",
        "learner_level_summary": result.get("learner_level_summary") or "",
        "recommended_total_weeks": int(result.get("recommended_total_weeks") or len(normalized_weeks) or 4),
        "weekly_plan": normalized_weeks,
        "daily_routine": _as_text_list(result.get("daily_routine")),
        "weak_topic_strategy": _as_text_list(result.get("weak_topic_strategy")),
        "adjustment_tips": _as_text_list(result.get("adjustment_tips")),
    }


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

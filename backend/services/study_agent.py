"""Study Agent helpers for summary, quiz generation, grading, and tutoring."""

from . import upstage

_SYSTEM = (
    "You are Forestudy's AI study coach. Answer in Korean. Use only the provided "
    "study-material context as evidence, and do not invent facts outside it."
)


async def summarize(material_title: str, sample_text: str) -> dict:
    prompt = f"""다음은 학습 자료 "{material_title}"의 내용입니다.

{sample_text}

이 요약은 시험 공부를 위한 것입니다. 한 문단으로 뭉뚱그려 추상화하지 말고,
실제로 이 내용만 봐도 공부가 되도록 자료에 나온 정의, 수치, 조건, 예시, 절차를
빠짐없이 구체적으로 살려서 정리하세요.

자료를 분석해서 아래 형식의 JSON으로 답하세요.
{{
  "summary": "자료 구조를 따라 섹션/주제 단위로 나눈 학습 노트. 각 섹션은 소제목과 함께 핵심 정의·수치·예시·절차를 구체적으로 서술 (전체 분량 제한 없이 자료 내용에 맞춰 충분히 상세하게, 마크다운 사용 가능)",
  "key_concepts": [
    {{"concept": "핵심 개념명", "description": "정의와 함께 자료에 나온 구체적 수치·예시·비교 대상을 포함한 설명 (2~4문장)"}}
  ]
}}
핵심 개념은 5~10개를 추출하세요."""
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
) -> list[dict]:
    weak_hint = (
        f"\n사용자의 취약 주제는 {', '.join(weak_topics)} 입니다. 이 주제를 우선 출제하세요."
        if weak_topics
        else ""
    )
    if question_mix:
        mix_text = ", ".join(f"{question_type} {count}개" for question_type, count in question_mix.items())
        type_instruction = (
            f"문항 구성은 반드시 {mix_text}로 맞추세요. "
            "multiple_choice는 보기 4개를 제공하고 correct_answer는 보기 문자열 그대로 쓰세요. "
            "short_answer는 options를 빈 배열로 두고 서술형 모범 답안을 correct_answer에 쓰세요. "
            "ox 문항은 만들지 마세요."
        )
    else:
        type_instruction = (
            "객관식 위주로 내되 1~2개는 ox 또는 short_answer로 섞으세요. "
            "multiple_choice에만 options를 넣으세요."
        )

    prompt = f"""다음 학습 자료 발췌를 근거로 퀴즈 {num_questions}개를 만드세요. 난이도: {difficulty}.{weak_hint}

{context}

{type_instruction}

아래 형식의 JSON으로만 답하세요.
{{
  "questions": [
    {{
      "question_text": "문제",
      "question_type": "multiple_choice | ox | short_answer",
      "options": ["보기1", "보기2", "보기3", "보기4"],
      "correct_answer": "정답",
      "explanation": "해설. 자료 발췌 근거를 포함",
      "topic_tag": "문제가 다루는 주제 키워드"
    }}
  ]
}}
반드시 questions 배열 길이는 {num_questions}개여야 합니다."""
    result = await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.5,
    )
    questions = result["questions"][:num_questions]
    return [_normalize_question(question) for question in questions]


async def grade_short_answer(question: str, correct_answer: str, user_answer: str) -> bool:
    prompt = f"""문제: {question}
모범 답안: {correct_answer}
학생 답안: {user_answer}

학생 답안이 모범 답안과 의미상 일치하면 정답입니다. JSON으로 답하세요: {{"correct": true 또는 false}}"""
    result = await upstage.chat_json([{"role": "user", "content": prompt}], temperature=0.0)
    return bool(result.get("correct"))


async def analyze_wrong_answers(wrong_items: list[dict], context: str) -> dict:
    wrong_text = "\n".join(
        f"- 문제: {item['question_text']} / 정답: {item['correct_answer']} / 학생 답: {item['user_answer']} / 주제: {item['topic_tag']}"
        for item in wrong_items
    )
    prompt = f"""학생이 틀린 문제들입니다.

{wrong_text}

관련 학습 자료 발췌:
{context}

오답 패턴을 분석해 JSON으로 답하세요.
{{
  "analysis": "왜 틀렸는지, 어떤 개념이 부족한지 종합 분석",
  "weak_topics": [
    {{"topic_tag": "주제", "weakness_score": 0~100 숫자, "recommendation": "이 주제 보완 방법"}}
  ]
}}"""
    return await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
    )


async def tutor_reply(history: list[dict], context: str | None) -> str:
    system = _SYSTEM + (
        " You are now a 1:1 tutor. Do not reveal the answer immediately. Use hints "
        "and Socratic questions so the student can reason through it."
    )
    if context:
        system += f"\n\n[학습 자료 발췌]\n{context}"
    messages = [{"role": "system", "content": system}] + history
    return await upstage.chat(messages, temperature=0.7)


def _normalize_question(question: dict) -> dict:
    question_type = question.get("question_type", "multiple_choice")
    if question_type == "short_answer":
        question["options"] = []
    elif question_type == "ox":
        question["options"] = question.get("options") or ["O", "X"]
    else:
        question["question_type"] = "multiple_choice"
        question["options"] = (question.get("options") or [])[:4]
    return question

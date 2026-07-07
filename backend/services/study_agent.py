"""Study Agent: 요약/핵심개념, 퀴즈 생성, 주관식 채점, 오답 분석, 튜터 챗.

모든 생성형 작업은 RAG로 검색된 자료 발췌를 근거로 하며, 근거에 없는 내용은
지어내지 않도록 프롬프트에 명시한다 (환각 방지).
"""

from . import upstage

_SYSTEM = (
    "당신은 Forestudy의 AI 학습 코치입니다. 반드시 제공된 학습 자료 발췌에 근거해 "
    "답하고, 발췌에 없는 내용은 지어내지 마세요. 한국어로 답하세요."
)


async def summarize(material_title: str, sample_text: str) -> dict:
    """자료 요약 + 핵심 개념 추출. 반환: {summary, key_concepts: [..]}"""
    prompt = f"""다음은 학습 자료 "{material_title}"의 내용입니다.

{sample_text}

위 자료를 분석해서 아래 형식의 JSON으로 답하세요.
{{
  "summary": "자료 전체 요약 (5~8문장)",
  "key_concepts": [
    {{"concept": "핵심 개념명", "description": "1~2문장 설명"}}
  ]
}}
핵심 개념은 5~10개를 추출하세요."""
    return await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
    )


async def generate_quiz(
    context: str, *, num_questions: int, difficulty: str, weak_topics: list[str] | None = None
) -> list[dict]:
    """자료 발췌 기반 퀴즈 생성. 반환: [{question_text, question_type, options, correct_answer, explanation, topic_tag}]"""
    weak_hint = (
        f"\n사용자의 취약 주제는 {', '.join(weak_topics)} 입니다. 이 주제를 우선 출제하세요."
        if weak_topics
        else ""
    )
    prompt = f"""다음 학습 자료 발췌를 근거로 퀴즈 {num_questions}개를 만드세요. 난이도: {difficulty}.{weak_hint}

{context}

아래 형식의 JSON으로 답하세요.
{{
  "questions": [
    {{
      "question_text": "문제",
      "question_type": "multiple_choice | ox | short_answer",
      "options": ["보기1", "보기2", "보기3", "보기4"],
      "correct_answer": "정답 (객관식은 보기 문자열 그대로, OX는 O 또는 X)",
      "explanation": "해설 (자료 발췌 근거 포함)",
      "topic_tag": "문제가 다루는 주제 키워드"
    }}
  ]
}}
객관식 위주로 내되 1~2개는 OX나 단답형으로 섞으세요. options는 객관식에만 넣으세요."""
    result = await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.5,
    )
    return result["questions"][:num_questions]  # 모델이 개수를 초과 생성하는 경우 방어


async def grade_short_answer(question: str, correct_answer: str, user_answer: str) -> bool:
    """단답형 채점: 표현이 달라도 의미가 맞으면 정답 처리."""
    prompt = f"""문제: {question}
모범 답안: {correct_answer}
학생 답안: {user_answer}

학생 답안이 모범 답안과 의미상 일치하면 정답입니다. JSON으로 답하세요: {{"correct": true 또는 false}}"""
    result = await upstage.chat_json([{"role": "user", "content": prompt}], temperature=0.0)
    return bool(result.get("correct"))


async def analyze_wrong_answers(wrong_items: list[dict], context: str) -> dict:
    """오답 분석 리포트. wrong_items: [{question_text, correct_answer, user_answer, topic_tag}]
    반환: {analysis, weak_topics: [{topic_tag, weakness_score, recommendation}]}"""
    wrong_text = "\n".join(
        f"- 문제: {w['question_text']} / 정답: {w['correct_answer']} / 학생 답: {w['user_answer']} / 주제: {w['topic_tag']}"
        for w in wrong_items
    )
    prompt = f"""학생이 틀린 문제들입니다.

{wrong_text}

관련 학습 자료 발췌:
{context}

오답 패턴을 분석해 JSON으로 답하세요.
{{
  "analysis": "왜 틀렸는지, 어떤 개념이 부족한지 종합 분석 (학생을 탓하지 않는 어조)",
  "weak_topics": [
    {{"topic_tag": "주제", "weakness_score": 0~100 숫자, "recommendation": "이 주제 보완 방법"}}
  ]
}}"""
    return await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
    )


async def tutor_reply(history: list[dict], context: str | None) -> str:
    """튜터 챗봇 (선생-학생). 정답을 바로 주지 않고 소크라테스식으로 유도."""
    system = _SYSTEM + (
        " 당신은 지금 1:1 튜터입니다. 정답을 바로 알려주지 말고 힌트와 질문으로 "
        "학생이 스스로 생각하도록 유도하세요. 학생이 설명하면 이해도를 점검해 주세요."
    )
    if context:
        system += f"\n\n[학습 자료 발췌]\n{context}"
    messages = [{"role": "system", "content": system}] + history
    return await upstage.chat(messages, temperature=0.7)

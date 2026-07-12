# ForeStudy: source file for study_agent.
"""Study Agent helpers for summary, quiz generation, grading, and tutoring."""

import asyncio
import json
import re
from datetime import date, timedelta
from math import ceil

from . import rag, upstage

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
    # 4000으로는 한국어 1500~2500단어 요약 + key_concepts가 다 안 들어가 JSON이 중간에
    # 잘리는 경우가 실제로 발생해(생성 도중 Unterminated string 파싱 오류) 8000으로 올렸다.
    return await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        max_tokens=8000,
    )

async def generate_quiz(
    context: str,
    *,
    num_questions: int,
    difficulty: str,
    weak_topics: list[str] | None = None,
    question_mix: dict[str, int] | None = None,
    difficulty_mix: dict[str, dict[str, int]] | None = None,
    quiz_kind: str = "study_review",
    learner_profile: dict | None = None,
    plan_scope: dict | None = None,
) -> list[dict]:
    """Generate a quiz matching question_mix exactly.

    Each question type is requested in its own model call instead of one mixed
    call. A single shared JSON example biases the model toward whatever shape
    that example shows (multiple_choice options), so mixed-type requests were
    silently coming back as all multiple_choice regardless of the requested
    mix. Splitting by type removes that ambiguity.

    difficulty_mix (e.g. {"easy": {"multiple_choice": 9, "short_answer": 1}, ...})
    fixes exactly how many questions of each (difficulty tier, question type)
    pair come back — used by the placement test and review quiz so downstream
    logic (level calculation, a fixed quiz shape) can rely on a known count
    instead of the model's self-reported difficulty. When set, it fully
    replaces question_mix as the source of what to generate."""
    mix = question_mix or {"multiple_choice": num_questions}
    # Large single prompts often come back capped around 10 items, so split each
    # requested type into smaller model calls and merge the generated questions.
    # Smaller batches also shrink the blast radius of a malformed-option retry
    # (see _generate_quiz_batch): fewer questions per call means fewer chances
    # for one of them to come back with duplicate/empty options.
    batch_size = 5
    batch_requests: list[tuple[str, int, str | None]] = []
    if difficulty_mix:
        for tier, type_counts in difficulty_mix.items():
            for question_type, tier_count in type_counts.items():
                remaining = tier_count
                while remaining > 0:
                    batch_requests.append((question_type, min(batch_size, remaining), tier))
                    remaining -= batch_size
    else:
        for question_type, count in mix.items():
            remaining = count
            while remaining > 0:
                batch_requests.append((question_type, min(batch_size, remaining), None))
                remaining -= batch_size

    batches = await asyncio.gather(
        *[
            _generate_quiz_batch(
                context,
                question_type=question_type,
                count=batch_count,
                difficulty=difficulty,
                target_difficulty=target_difficulty,
                weak_topics=weak_topics,
                quiz_kind=quiz_kind,
                learner_profile=learner_profile,
                plan_scope=plan_scope,
            )
            for question_type, batch_count, target_difficulty in batch_requests
        ]
    )
    # difficulty_mix가 있으면 난이도 티어마다 별도 모델 호출이 나가는데(위 gather), 각 호출은
    # 서로의 결과를 모른 채 같은 context에서 가장 눈에 띄는 개념을 독립적으로 고른다. 그 결과
    # "팬인/팬아웃" 같은 주제가 easy/normal/hard에 각각 한 번씩, 총 3번 겹쳐 나오는 문제가
    # 실제로 재현됨 — topic_tag 기준으로 배치 간 중복을 찾아 겹치는 문제만 다른 주제로 다시
    # 생성한다.
    flat = [
        [question, question_type, target_difficulty]
        for (question_type, _batch_count, target_difficulty), batch in zip(batch_requests, batches)
        for question in batch
    ]
    if difficulty_mix:
        await _replace_duplicate_topics(
            flat,
            context=context,
            difficulty=difficulty,
            weak_topics=weak_topics,
            quiz_kind=quiz_kind,
            learner_profile=learner_profile,
            plan_scope=plan_scope,
        )
    return [entry[0] for entry in flat]


def _topic_key(topic_tag: str | None) -> str:
    return re.sub(r"[^\w가-힣]", "", (topic_tag or "").lower())


def _find_duplicate_indices(flat: list[list]) -> tuple[list[int], list[str]]:
    seen: dict[str, int] = {}
    duplicate_indices: list[int] = []
    for i, (question, _, _) in enumerate(flat):
        key = _topic_key(question.get("topic_tag"))
        if not key:
            continue
        if key in seen:
            duplicate_indices.append(i)
        else:
            seen[key] = i
    kept_topics = [flat[i][0].get("topic_tag") for i in seen.values() if flat[i][0].get("topic_tag")]
    return duplicate_indices, kept_topics


async def _replace_duplicate_topics(
    flat: list[list],
    *,
    context: str,
    difficulty: str,
    weak_topics: list[str] | None,
    quiz_kind: str,
    learner_profile: dict | None,
    plan_scope: dict | None,
    max_rounds: int = 3,
) -> None:
    """flat의 각 항목은 [question, question_type, target_difficulty]. topic_tag가 이미 다른
    문제에서 나온 것과 같은(정규화 후 일치) 항목을 찾아, 그 자리만 다른 주제로 교체한다.
    같은 context에서 유독 두드러지는 주제(예: SQLD 자료의 "관계대수")가 있으면 교체 호출도
    다시 그 주제로 쏠릴 수 있어서, 한 라운드 안에서는 순차로 돌며 그때그때 새로 고른 주제도
    회피 목록에 더하고, 그래도 남는 중복이 있으면 최대 max_rounds번까지 다시 검사한다."""
    for _round in range(max_rounds):
        duplicate_indices, kept_topics = _find_duplicate_indices(flat)
        if not duplicate_indices:
            return
        avoid_topics = list(kept_topics)
        for i in duplicate_indices:
            try:
                result = await _generate_quiz_batch(
                    context,
                    question_type=flat[i][1],
                    count=1,
                    difficulty=difficulty,
                    target_difficulty=flat[i][2],
                    weak_topics=weak_topics,
                    quiz_kind=quiz_kind,
                    learner_profile=learner_profile,
                    plan_scope=plan_scope,
                    avoid_topics=avoid_topics,
                )
            except RuntimeError:
                continue  # 교체 실패 시 원래 문제(주제는 겹치지만 유효한 문제)를 그대로 둔다
            if not result:
                continue
            flat[i][0] = result[0]
            new_topic = result[0].get("topic_tag")
            if new_topic:
                avoid_topics.append(new_topic)


async def _generate_quiz_batch(
    context: str,
    *,
    question_type: str,
    count: int,
    difficulty: str,
    weak_topics: list[str] | None,
    quiz_kind: str,
    learner_profile: dict | None,
    plan_scope: dict | None,
    target_difficulty: str | None = None,
    avoid_topics: list[str] | None = None,
) -> list[dict]:
    weak_hint = (
        f"\nPrioritize these weak topics when relevant: {', '.join(weak_topics)}."
        if weak_topics
        else ""
    )
    avoid_hint = (
        "\nThese topics are already covered by other questions in this same quiz — do NOT write "
        f"another question about any of them, pick a different concept from the context instead: "
        f"{', '.join(avoid_topics)}."
        if avoid_topics
        else ""
    )

    circular_answer_warning = (
        "Never let the correct_answer just repeat words already given in question_text — the "
        "question must require knowledge the learner has to supply, not just echo back a phrase "
        "the question itself already stated. For example, if question_text is \"Which principle "
        "states that a class should have only one responsibility?\", the correct_answer must be the "
        "specific name of that principle (e.g. \"Single Responsibility Principle\") — never a vague "
        "restatement of the question's own topic or category (e.g. never just \"a software "
        "engineering principle\" or \"the principle described above\"). This also applies to short "
        "phrases, not just long ones: if question_text is \"Which of the 4 core Agile values "
        "captures the meaning of 'valuing responding to change'?\", the correct_answer must NOT be "
        "just \"responding to change\" — that is the same phrase from the question with a particle "
        "attached, not an answer. Before finalizing correct_answer, check whether it (or a trivial "
        "rewording of it) already appears inside question_text; if so, rewrite the question so the "
        "answer must be recalled, not just copied.\n"
        "Special case — questions of the form \"Which of the N core values/principles/stages means "
        "X?\": this shape is the most common source of circular answers, so avoid it by default. "
        "If you use it anyway, X must be phrased using entirely different vocabulary from the named "
        "item itself (no shared multi-character phrase at all) — e.g. instead of asking which value "
        "\"means responding to change\", ask which value is about \"adjusting plans when new "
        "information emerges instead of rigidly following the original schedule\". If you cannot "
        "think of a genuinely different phrasing, do not use this question shape — write a direct "
        "definition or application question instead (e.g. \"What does the Agile value of responding "
        "to change mean in practice?\" with an explanatory answer, not the value's own name)."
    )

    if question_type == "multiple_choice":
        type_instruction = (
            "Every question's question_type must be exactly \"multiple_choice\". "
            "Provide exactly 4 options and set correct_answer to the exact option text. "
            "Each option must be a distinct, substantive answer choice written out in full — "
            "never a bare letter like \"A\"/\"B\"/\"C\"/\"D\", never a placeholder, and never "
            "duplicated or reworded from another option in the same question. Every option "
            "(including the correct one) must name a specific, concrete concept, term, or value — "
            f"never a vague paraphrase of the question's own topic. {circular_answer_warning}"
        )
        example_fields = '"question_type": "multiple_choice",\n      "options": ["option1", "option2", "option3", "option4"],\n      "correct_answer": "the exact matching option text",'
    elif question_type == "short_answer":
        type_instruction = (
            "Every question's question_type must be exactly \"short_answer\". "
            "Set options to an empty array [] and put a concise model answer in correct_answer. "
            f"Do not generate multiple-choice options for these questions. {circular_answer_warning}"
        )
        example_fields = '"question_type": "short_answer",\n      "options": [],\n      "correct_answer": "concise model answer",'
    else:
        type_instruction = (
            f"Every question's question_type must be exactly \"{question_type}\". "
            "Set options to [\"O\", \"X\"] and correct_answer to \"O\" or \"X\"."
        )
        example_fields = f'"question_type": "{question_type}",\n      "options": ["O", "X"],\n      "correct_answer": "O",'

    if target_difficulty:
        level_instruction = (
            f"Every question must be exactly \"{target_difficulty}\" difficulty — generate all "
            f"{count} questions at this difficulty level only, never mix in other levels."
        )
    else:
        level_instruction = (
            "This is a post-study review quiz. Adjust the difficulty to the learner profile below, "
            "while still checking weak topics.\n"
            f"{_format_profile_for_prompt(learner_profile)}"
        )

    plan_instruction = ""
    if plan_scope:
        task_text = "\n".join(f"- {task}" for task in plan_scope.get("tasks", [])) or "- (no detailed tasks)"
        plan_instruction = f"""
Today's required learning-plan scope:
- Focus topic: {plan_scope.get('focus_topic') or '(none)'}
- Planned tasks:
{task_text}

Every question must directly assess this scope. Do not ask about unrelated parts of the uploaded
material. Use the focus topic and tasks to decide what the learner should demonstrate, and only use
facts supported by the study-material context below.
"""

    prompt = f"""Create {count} {question_type} quiz questions from the study-material context below.
Overall requested difficulty: {difficulty}.{weak_hint}{avoid_hint}

{plan_instruction}

{context}

{type_instruction}

{level_instruction}

Return JSON only:
{{
  "questions": [
    {{
      "question_text": "Korean question",
      {example_fields}
      "explanation": "Korean learner-facing explanation of why the answer is correct",
      "topic_tag": "topic keyword",
      "question_difficulty": "easy | normal | hard",
      "difficulty_score": 1,
      "difficulty_reason": "Korean reason why this question has that difficulty"
    }}
  ]
}}
The questions array length must be exactly {count}.
difficulty_score must be an integer from 1 to 100.
For explanation, write only a natural Korean explanation of the correct answer. Never mention or
copy context headers, excerpts, citations, source labels, pages, or markers such as "발췌", "출처",
"[0]", or "(p.1)"."""
    messages = [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
    current_messages = messages

    max_attempts = 8
    last_normalized: list[dict] = []
    for attempt in range(max_attempts):
        result = await upstage.chat_json(current_messages, temperature=0.5)
        raw_questions = result.get("questions")
        if not isinstance(raw_questions, list) or not raw_questions:
            # 드물게 모델이 JSON은 유효하지만 "questions" 키 자체를 빠뜨리거나 빈 배열로
            # 돌려주는 경우가 있다(재현 확인됨) — 예전엔 여기서 바로 KeyError로 요청 전체가
            # 죽었는데, 다른 검증 실패와 동일하게 재시도 루프를 타도록 고친다.
            if attempt < max_attempts - 1:
                current_messages = messages + [
                    {"role": "assistant", "content": json.dumps(result, ensure_ascii=False)},
                    {
                        "role": "user",
                        "content": (
                            "That response did not include a valid non-empty \"questions\" array. "
                            f"Return the JSON again with exactly {count} questions in the "
                            "\"questions\" array as specified."
                        ),
                    },
                ]
                continue
            raise RuntimeError(
                f"AI가 {count}개의 {question_type} 문제를 {max_attempts}번 시도해도 유효하게 "
                "만들지 못했습니다 (questions 배열 누락)."
            )
        questions = raw_questions[:count]
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
            if target_difficulty:
                # 난이도 티어별 개수를 정확히 보장해야 하므로, 모델이 스스로 매긴 난이도
                # 태그를 신뢰하지 않고 요청한 티어로 강제 확정한다.
                question["question_difficulty"] = target_difficulty
        last_normalized = normalized
        broken = [q for q in normalized if not _is_question_well_formed(q)]
        if not broken and len(normalized) == count:
            return normalized
        # The model sometimes drops the "options" array for a question (more common on
        # "hard" items), returns duplicate/placeholder options, or returns fewer items than
        # requested — or repeats a circular answer. Retrying with the exact same prompt tends
        # to reproduce the same mistake (it's a real observed pattern, not just bad luck), so
        # point out precisely what was wrong with the rejected question(s) and ask the model to
        # fix that specific issue instead of blindly resubmitting the same prompt.
        if attempt < max_attempts - 1 and broken:
            broken_examples = "\n".join(
                f"- question_text: \"{q.get('question_text', '')}\" / "
                f"correct_answer: \"{q.get('correct_answer', '')}\""
                for q in broken[:3]
            )
            current_messages = messages + [
                {"role": "assistant", "content": json.dumps(result, ensure_ascii=False)},
                {
                    "role": "user",
                    "content": (
                        f"{len(broken)} of those questions are invalid — most likely because "
                        "correct_answer just repeats a phrase already in question_text (a circular "
                        "answer the learner doesn't actually need to know anything to guess), or "
                        "because options are duplicated/empty/placeholder text. The problem ones:\n"
                        f"{broken_examples}\n"
                        f"Return the full corrected JSON again with all {count} questions, fixing "
                        "this specific problem in every question (not just the ones listed above)."
                    ),
                },
            ]
    raise RuntimeError(
        f"AI가 {count}개의 {question_type} 문제를 {max_attempts}번 시도해도 유효하게 만들지 못했습니다 "
        "(중복되거나 비어있는 보기 포함)."
    )


def _is_circular_answer(question_text: str, answer: str) -> bool:
    """정답이 질문 문장 속 표현을 그대로 되풀이하기만 하는 경우를 걸러낸다.

    실제 발견된 사례들:
    - "소프트웨어 공학의 기본 원칙 중 '~하다'는 내용은 무엇을 설명하는가?" 라는
      질문에 정답이 그냥 "소프트웨어 공학의 기본 원칙"이었던 경우
    - "애자일 개발의 4가지 핵심 가치 중 '변화 대응을 중시한다'는 의미를 담고
      있는 가치는 무엇인가요?" 라는 질문에 정답이 그냥 "변화 대응"이었던 경우
      (질문 속 표현에 조사만 붙였을 뿐 사실상 같은 말)
    두 경우 다 질문이 이미 답을 그대로 말해준 것이나 다름없어서 학습자가 구체적인
    개념을 몰라도 맞힐 수 있고, 오답 해설도 억지스러워진다. 공백을 제거한 정답
    전체가 질문 문장 안에 그대로 들어있으면(=정답이 질문에서 새로운 정보를 전혀
    안 더한 경우) 순환 답변으로 간주한다. 4글자 미만은 우연히 겹칠 수 있어 제외한다."""
    normalized_answer = re.sub(r"\s+", "", answer)
    normalized_question = re.sub(r"\s+", "", question_text)
    return len(normalized_answer) >= 4 and normalized_answer in normalized_question


def _is_question_well_formed(question: dict) -> bool:
    """퀴즈로 내보내기 전 최소한의 무결성 검사.

    사용자에게 보여주기 전에 걸러야 하는 실제 사례: 보기 두 개가 완전히 같은 문장인
    경우(선택 시 두 버튼이 동시에 체크됨), 보기가 "A"/"B" 같은 자리표시자만 있는 경우,
    correct_answer가 실제 보기 중 어느 것과도 일치하지 않아 채점이 항상 틀리게 되는 경우,
    정답이 질문 문장을 그대로 되풀이하기만 하는 경우."""
    question_text = str(question.get("question_text") or "").strip()
    correct_answer = str(question.get("correct_answer") or "").strip()
    if len(question_text) < 5 or not correct_answer:
        return False
    if _is_circular_answer(question_text, correct_answer):
        return False

    question_type = question.get("question_type")
    if question_type == "multiple_choice":
        options = [str(o).strip() for o in (question.get("options") or [])]
        if len(options) < 2:
            return False
        # 자리표시자("A"/"B"/"1" 같은 한 글자)만 걸러내는 게 목적이었는데 기준이 3자였던
        # 탓에 "XP", "칸반", "CI", "QA"처럼 실제로 유효한 2글자 용어 보기까지 매번
        # 잘못 걸러지고 있었다(실제 발견된 사례: options에 "칸반"/"XP"가 섞여 있으면
        # 문제 자체가 멀쩡해도 매번 재시도 5~8번을 다 태우다 실패했다). 한 글자
        # 자리표시자만 거르도록 기준을 2자로 낮춘다.
        if any(len(o) < 2 for o in options):
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


async def explain_correct_answer(
    *,
    question_text: str,
    correct_answer: str,
    explanation: str | None = None,
    topic_tag: str | None = None,
) -> str:
    """Create a concise, learner-facing explanation for a correctly answered question."""
    prompt = f"""Write a clear Korean explanation for a quiz question the learner answered correctly.

Question:
{question_text}

Correct answer:
{correct_answer}

Topic:
{topic_tag or "general"}

Reference explanation (use only for factual grounding; do not copy its format):
{explanation or "(none)"}

Explain why this answer is correct and the key concept to remember in 2–3 natural Korean sentences.
Do not mention the learner's answer, sources, excerpts, pages, citations, or reference material.
Never output labels or markers such as "발췌", "출처", "[0]", "(p.1)", or any page number.

Return JSON only:
{{"explanation": "Korean learner-facing explanation"}}"""
    result = await upstage.chat_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.2,
    )
    return _clean_source_labels(result.get("explanation"))


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


# 배치고사 난이도별 배점 — routers/quizzes.py의 PLACEMENT_DIFFICULTY_MIX(쉬움 4·보통 4·어려움 2)
# 기준 만점 20점(4*1 + 4*2 + 2*4). AI 판단이 아니라 이 점수 합계로 수준을 결정한다.
_PLACEMENT_POINTS = {"easy": 1, "normal": 2, "hard": 4}


def _evaluate_placement_level(results: list[dict]) -> dict:
    """배치고사는 AI가 수준을 판단하지 않고, 난이도별 배점 합계를 만점 대비 비율로
    환산해 결정론적으로 초보/숙련/전문가를 나눈다."""
    breakdown = {tier: {"correct": 0, "total": 0} for tier in _PLACEMENT_POINTS}
    score = 0
    max_score = 0
    for item in results:
        tier = item.get("question_difficulty") or "normal"
        if tier not in breakdown:
            tier = "normal"
        breakdown[tier]["total"] += 1
        max_score += _PLACEMENT_POINTS[tier]
        if item["is_correct"]:
            breakdown[tier]["correct"] += 1
            score += _PLACEMENT_POINTS[tier]

    ratio = score / max_score if max_score else 0.0
    if ratio <= 0.5:
        mastery_level, recommended_difficulty = "beginner", "easy"
    elif ratio <= 0.8:
        mastery_level, recommended_difficulty = "intermediate", "normal"
    else:
        mastery_level, recommended_difficulty = "advanced", "hard"

    return _normalize_level_evaluation(
        {
            "mastery_score": round(ratio * 100),
            "mastery_level": mastery_level,
            "recommended_difficulty": recommended_difficulty,
            "confidence_score": 100,
            "difficulty_breakdown": breakdown,
            "strengths": [],
            "weaknesses": [],
            "analysis": (
                f"배치고사 점수 {score}/{max_score}점 "
                f"(쉬움 {_PLACEMENT_POINTS['easy']}점·보통 {_PLACEMENT_POINTS['normal']}점·"
                f"어려움 {_PLACEMENT_POINTS['hard']}점 배점 기준)."
            ),
        }
    )


async def evaluate_learning_level(
    *,
    quiz_type: str,
    quiz_difficulty: str,
    results: list[dict],
    previous_profile: dict | None = None,
) -> dict:
    if quiz_type == "placement":
        return _evaluate_placement_level(results)

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
    material_id: str,
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
    먼저 파이썬에서 주차·일수 배분을 계산한 뒤, 주차 스켈레톤을 1회 생성한다.

    주차별 일일 계획은 스켈레톤 생성에 쓴 것과 같은 전역 context를 재사용하지 않고, 그 주차의
    theme으로 RAG를 다시 검색해 주차마다 다른 자료 발췌를 사용한다 — 모든 주차가 동일한 상위 8개
    청크만 우려먹어서 서로 다른 주차인데도 내용이 거의 그대로 반복되던 문제의 원인 중 하나였다.

    주차별 일일 계획은 asyncio.gather 병렬 생성이 아니라 순차(sequential) 생성한다 — 병렬로 하면
    각 주차가 다른 주차의 실제 일별 주제를 전혀 모른 채 동시에 생성되어, 서로 다른 주차인데도
    같은 소주제(예: '결합도와 응집도')가 똑같은 깊이로 중복 등장하는 문제가 있었다. 순차 생성하며
    이전 주차들의 실제 일별 focus_topic 목록을 다음 주차 프롬프트에 넘겨, 겹치는 주제는 더 깊은
    난이도로 다루도록 유도한다. 주차 수가 많을수록 느려지는 대가가 있지만 1회성 백그라운드 생성이라
    품질을 우선한다."""
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
    all_week_themes = "\n".join(f"{w['week_number']}주차: {w['theme']}" for w in skeleton)

    start_date = date.fromisoformat(current_date)
    week_start_dates = []
    cursor = start_date
    for count in day_counts:
        week_start_dates.append(cursor)
        cursor += timedelta(days=count)

    weeks = []
    prior_days_summary = ""
    for i in range(total_weeks):
        week_result = await _generate_week_days(
            week=skeleton[i],
            day_count=day_counts[i],
            week_start_date=week_start_dates[i],
            certification_name=certification_name,
            material_id=material_id,
            material_title=material_title,
            concept_text=concept_text,
            all_week_themes=all_week_themes,
            prior_days_summary=prior_days_summary,
        )
        weeks.append(week_result)
        prior_days_summary += "\n".join(
            f"- {week_result['week_number']}주차 {day['day_offset'] + 1}일차: {day['focus_topic']}"
            for day in week_result["days"]
        ) + "\n"

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
    material_id: str,
    material_title: str,
    concept_text: str,
    all_week_themes: str,
    prior_days_summary: str,
) -> dict:
    week_chunks = await rag.retrieve_chunks(material_id, week["theme"], top_k=6)
    context = rag.format_context(week_chunks)
    prompt = f"""Create exactly {day_count} daily study plans for week {week['week_number']}
("{week['theme']}") of a certification study plan for "{certification_name}", based on the
uploaded material "{material_title}".

Full plan overview (every week's theme, for context only):
{all_week_themes or "(none)"}

Days already planned in earlier weeks (day + focus_topic, already generated and fixed — you cannot
change these, only build on top of them):
{prior_days_summary or "(none yet, this is the first week)"}

Key concepts:
{concept_text or "(none)"}

Study-material context:
{context}

Structure the {day_count} days as a progression, not a repeated restatement of the same content:
- This week's days must stay inside this week's own theme above — do not restate a sub-topic that
  clearly belongs to a different week's theme in the plan overview.
- Each day should focus on a distinct, narrowly-scoped slice of a topic, not the whole topic restated.
  Example of what NOT to do: Day A focus_topic "SOLID 원칙" with tasks defining all 5 principles, then
  Day B focus_topic "SOLID 원칙과 객체지향 설계" that ALSO defines all 5 principles with examples — this
  is a duplicate, even though the titles differ. Example of the CORRECT way to split the same broad
  topic across two days: Day A focus_topic "SRP·OCP 개념과 판단 기준" (only those two principles,
  definitions + how to judge them), Day B focus_topic "LSP·ISP·DIP 적용과 리팩터링 실습" (the remaining
  three principles, applied to refactoring an existing design) — each day's tasks only ever touch the
  narrow slice named in its own focus_topic, never the full topic again.
- Before reusing any topic, check the "days already planned in earlier weeks" list above. If a topic
  from that list overlaps this week's theme, this week's day(s) covering it must be scoped to a
  DIFFERENT, narrower slice than that earlier day already used (different sub-principles, a specific
  procedure, a comparison, numeric conditions, edge cases, or a worked example) — never the same full
  topic restated under a slightly reworded title. If a topic from that list is unrelated to this
  week's theme, ignore it.

Do not include citation labels or source markers such as "발췌 0", "발췌 43에서", "출처 1", "[0]", or "(p.1)"
anywhere in the output. Also never append a bare parenthetical number after a concept/topic name as a
reference tag, e.g. "캡슐화(033)" or "소프트웨어 공학의 기본 원칙(001)" — the numbers in the "--- 발췌 N ---"
context headers are internal excerpt indices for your own grounding only; never echo them, with or without
the word "발췌". Write focus_topic and tasks as plain study instructions, referring to concepts by name only.

For each day, also create an AI learning guide:
- summary: In 3–5 natural Korean sentences, explain what concept the learner will study today, why it
  matters, and how it connects to the material. Write for a learner reading this before study; do not
  copy the textbook or merely list facts.
- study_tip: In 2–3 natural Korean sentences, give concrete ways to study this topic effectively, such
  as linking concepts, using examples, memorization cues, or solving practice questions. Avoid generic
  encouragement such as "study hard".
- focus_topic, summary, and study_tip must never contain source numbers, page numbers, or citations.

Return JSON only:
{{
  "days": [
    {{
      "day_offset": 0,
      "focus_topic": "Korean focus topic for this day",
      "planned_minutes": 60,
      "summary": "Korean AI learning guide in 3-5 sentences",
      "study_tip": "Korean study tip in 2-3 sentences"
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
                    "checkpoint": "",
                    "summary": _clean_source_labels(str(day.get("summary") or "").strip()),
                    "study_tip": _clean_source_labels(str(day.get("study_tip") or "").strip()),
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


def _build_tutor_messages(history: list[dict], context: str | None, plan_scope: dict | None) -> list[dict]:
    system = _SYSTEM + (
        " You are now a 1:1 tutor. Prefer hints and Socratic questions over immediately "
        "revealing the answer, but if the student asks a direct factual question "
        "(a number, a definition, a specific value from the material), answer it directly "
        "and briefly instead of withholding it.\n"
        "Output ONLY the final reply shown to the student: natural conversational Korean, "
        "no step-by-step reasoning, no English, no phrases like 'Let me check' or 'Wait' "
        "or 'excerpt N says' — do not narrate your own thought process."
    )
    if plan_scope:
        tasks = ", ".join(str(task) for task in plan_scope.get("tasks") or [] if str(task).strip())
        system += (
            "\n\n[Today's daily learning plan]\n"
            f"Focus topic: {plan_scope.get('focus_topic') or 'Not specified'}\n"
            f"Tasks: {tasks or 'Not specified'}\n"
            "Keep the conversation focused on this plan. Explain the focus topic, help with its "
            "tasks, and use examples related to it. If the student asks about an unrelated topic, "
            "briefly answer only when possible, then guide them back to today's focus."
        )
    if context:
        system += f"\n\n[Study-material context]\n{context}"
    return [{"role": "system", "content": system}] + history


async def tutor_reply_stream(history: list[dict], context: str | None, plan_scope: dict | None = None):
    """튜터 챗봇 답변을 완성된 문자열이 아니라 텍스트 조각 단위로 하나씩 yield한다 —
    routers/tutor.py가 이걸 그대로 SSE로 흘려보낸다."""
    messages = _build_tutor_messages(history, context, plan_scope)
    async for delta in upstage.chat_stream(messages, temperature=0.4):
        yield delta


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

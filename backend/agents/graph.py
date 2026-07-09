"""Super Graph 구성.

담당: 여러 에이전트 노드를 하나의 StateGraph로 묶고, state["task"]를 기준으로
결정론적으로 라우팅하는 진입점(Super Graph)을 만든다. 체크포인터는 사용하지
않는다 — 학습자 상태(대화 로그, 숙련도 프로필 등)는 이미 Postgres 테이블에
영속화되어 있고, 그래프는 요청 1건당 1회 실행되고 끝나기 때문이다.
"""

from langgraph.graph import END, START, StateGraph

from agents.nodes.analysis import (
    analyze_wrong_answers_node,
    analyze_wrong_note_node,
    evaluate_learning_level_node,
)
from agents.nodes.ingest_summarizer import summarize_node
from agents.nodes.planner import generate_learning_plan_node
from agents.nodes.quiz import generate_quiz_node, grade_short_answer_node
from agents.nodes.report import generate_report_node
from agents.nodes.tutor import tutor_node
from agents.state import AgentState, new_state

_TASK_NODES = {
    "tutor_reply": tutor_node,
    "generate_quiz": generate_quiz_node,
    "grade_short_answer": grade_short_answer_node,
    "analyze_wrong_answers": analyze_wrong_answers_node,
    "analyze_wrong_note": analyze_wrong_note_node,
    "evaluate_learning_level": evaluate_learning_level_node,
    "generate_learning_plan": generate_learning_plan_node,
    "summarize_material": summarize_node,
    "generate_report": generate_report_node,
}


def _route_by_task(state: AgentState) -> str:
    return state["task"]


def build_graph():
    graph = StateGraph(AgentState)
    for name, node in _TASK_NODES.items():
        graph.add_node(name, node)
        graph.add_edge(name, END)
    graph.add_conditional_edges(START, _route_by_task, list(_TASK_NODES))
    return graph.compile()


_compiled_graph = build_graph()


async def run_tutor_reply(history: list[dict], context: str | None) -> str:
    state = new_state("tutor_reply", {"history": history}, context)
    result = await _compiled_graph.ainvoke(state)
    return result["output"]["reply"]


async def run_generate_quiz(
    context: str,
    *,
    num_questions: int,
    difficulty: str,
    weak_topics: list[str] | None = None,
    question_mix: dict[str, int] | None = None,
    quiz_kind: str = "study_review",
    learner_profile: dict | None = None,
) -> list[dict]:
    state = new_state(
        "generate_quiz",
        {
            "num_questions": num_questions,
            "difficulty": difficulty,
            "weak_topics": weak_topics,
            "question_mix": question_mix,
            "quiz_kind": quiz_kind,
            "learner_profile": learner_profile,
        },
        context,
    )
    result = await _compiled_graph.ainvoke(state)
    return result["output"]["questions"]


async def run_grade_short_answer(question: str, correct_answer: str, user_answer: str) -> bool:
    state = new_state(
        "grade_short_answer",
        {"question": question, "correct_answer": correct_answer, "user_answer": user_answer},
    )
    result = await _compiled_graph.ainvoke(state)
    return result["output"]["correct"]


async def run_analyze_wrong_answers(wrong_items: list[dict], context: str) -> dict:
    state = new_state("analyze_wrong_answers", {"wrong_items": wrong_items}, context)
    result = await _compiled_graph.ainvoke(state)
    return result["output"]


async def run_analyze_wrong_note(
    *,
    question_text: str,
    correct_answer: str,
    user_answer: str | None,
    explanation: str | None = None,
    topic_tag: str | None = None,
) -> str:
    state = new_state(
        "analyze_wrong_note",
        {
            "question_text": question_text,
            "correct_answer": correct_answer,
            "user_answer": user_answer,
            "explanation": explanation,
            "topic_tag": topic_tag,
        },
    )
    result = await _compiled_graph.ainvoke(state)
    return result["output"]["mistake_analysis"]


async def run_evaluate_learning_level(
    *,
    quiz_type: str,
    quiz_difficulty: str,
    results: list[dict],
    previous_profile: dict | None = None,
) -> dict:
    state = new_state(
        "evaluate_learning_level",
        {
            "quiz_type": quiz_type,
            "quiz_difficulty": quiz_difficulty,
            "results": results,
            "previous_profile": previous_profile,
        },
    )
    result = await _compiled_graph.ainvoke(state)
    return result["output"]


async def run_generate_learning_plan(
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
    state = new_state(
        "generate_learning_plan",
        {
            "certification_name": certification_name,
            "material_title": material_title,
            "current_date": current_date,
            "material_summary": material_summary,
            "key_concepts": key_concepts,
            "learning_evaluation": learning_evaluation,
            "quiz_results": quiz_results,
        },
        context,
    )
    result = await _compiled_graph.ainvoke(state)
    return result["output"]


async def run_summarize(material_title: str, sample_text: str) -> dict:
    state = new_state(
        "summarize_material", {"material_title": material_title, "sample_text": sample_text}
    )
    result = await _compiled_graph.ainvoke(state)
    return result["output"]


async def run_generate_report(
    *,
    material_title: str,
    material_summary: str | None,
    attempt: dict | None,
    weak_points: list[dict],
) -> str:
    state = new_state(
        "generate_report",
        {
            "material_title": material_title,
            "material_summary": material_summary,
            "attempt": attempt,
            "weak_points": weak_points,
        },
    )
    result = await _compiled_graph.ainvoke(state)
    return result["output"]["report_text"]

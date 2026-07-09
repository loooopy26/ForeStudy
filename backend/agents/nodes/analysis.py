"""오답 분석/숙련도 평가 에이전트 노드.

담당: services.study_agent의 analyze_wrong_answers / analyze_wrong_note /
evaluate_learning_level을 그래프 노드로 감싼다.
"""

from agents.logging_utils import log_node
from agents.state import AgentState
from services import study_agent


async def analyze_wrong_answers_node(state: AgentState) -> AgentState:
    payload = state["input"]
    result = await study_agent.analyze_wrong_answers(payload["wrong_items"], state["context"])
    state["output"] = result
    log_node(state, "analyze_wrong_answers_node", wrong_item_count=len(payload["wrong_items"]))
    return state


async def analyze_wrong_note_node(state: AgentState) -> AgentState:
    payload = state["input"]
    analysis = await study_agent.analyze_wrong_note(
        question_text=payload["question_text"],
        correct_answer=payload["correct_answer"],
        user_answer=payload.get("user_answer"),
        explanation=payload.get("explanation"),
        topic_tag=payload.get("topic_tag"),
    )
    state["output"] = {"mistake_analysis": analysis}
    log_node(state, "analyze_wrong_note_node")
    return state


async def evaluate_learning_level_node(state: AgentState) -> AgentState:
    payload = state["input"]
    result = await study_agent.evaluate_learning_level(
        quiz_type=payload["quiz_type"],
        quiz_difficulty=payload["quiz_difficulty"],
        results=payload["results"],
        previous_profile=payload.get("previous_profile"),
    )
    state["output"] = result
    log_node(state, "evaluate_learning_level_node", mastery_level=result.get("mastery_level"))
    return state

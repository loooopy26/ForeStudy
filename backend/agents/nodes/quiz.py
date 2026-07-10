"""퀴즈 생성/채점 에이전트 노드.

담당: services.study_agent.generate_quiz / grade_short_answer를 그래프 노드로 감싼다.
"""

from agents.logging_utils import log_node
from agents.state import AgentState
from services import study_agent


async def generate_quiz_node(state: AgentState) -> AgentState:
    payload = state["input"]
    questions = await study_agent.generate_quiz(
        state["context"],
        num_questions=payload["num_questions"],
        difficulty=payload["difficulty"],
        weak_topics=payload.get("weak_topics"),
        question_mix=payload.get("question_mix"),
        quiz_kind=payload.get("quiz_kind", "study_review"),
        learner_profile=payload.get("learner_profile"),
        plan_scope=payload.get("plan_scope"),
    )
    state["output"] = {"questions": questions}
    log_node(state, "generate_quiz_node", question_count=len(questions))
    return state


async def grade_short_answer_node(state: AgentState) -> AgentState:
    payload = state["input"]
    correct = await study_agent.grade_short_answer(
        payload["question"], payload["correct_answer"], payload["user_answer"]
    )
    state["output"] = {"correct": correct}
    log_node(state, "grade_short_answer_node", correct=correct)
    return state

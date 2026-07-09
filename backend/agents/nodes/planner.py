"""학습 플랜 생성 에이전트 노드.

담당: services.study_agent.generate_learning_plan을 그래프 노드로 감싼다.
"""

from agents.logging_utils import log_node
from agents.state import AgentState
from services import study_agent


async def generate_learning_plan_node(state: AgentState) -> AgentState:
    payload = state["input"]
    plan = await study_agent.generate_learning_plan(
        certification_name=payload["certification_name"],
        material_title=payload["material_title"],
        current_date=payload["current_date"],
        material_summary=payload.get("material_summary"),
        key_concepts=payload.get("key_concepts"),
        learning_evaluation=payload.get("learning_evaluation"),
        quiz_results=payload["quiz_results"],
        context=state["context"],
    )
    state["output"] = plan
    log_node(state, "generate_learning_plan_node", weeks=len(plan.get("weekly_plan", [])))
    return state


async def generate_daily_learning_plan_node(state: AgentState) -> AgentState:
    payload = state["input"]
    plan = await study_agent.generate_daily_learning_plan(
        certification_name=payload["certification_name"],
        material_id=payload["material_id"],
        material_title=payload["material_title"],
        current_date=payload["current_date"],
        target_exam_date=payload["target_exam_date"],
        remaining_days=payload["remaining_days"],
        material_summary=payload.get("material_summary"),
        key_concepts=payload.get("key_concepts"),
        learning_evaluation=payload.get("learning_evaluation"),
        quiz_results=payload["quiz_results"],
        context=state["context"],
    )
    state["output"] = plan
    log_node(state, "generate_daily_learning_plan_node", weeks=len(plan.get("weeks", [])))
    return state

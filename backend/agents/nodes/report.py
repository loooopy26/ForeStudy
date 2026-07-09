"""학습 리포트 생성 에이전트 노드.

담당: services.study_agent.generate_report를 그래프 노드로 감싼다.
"""

from agents.logging_utils import log_node
from agents.state import AgentState
from services import study_agent


async def generate_report_node(state: AgentState) -> AgentState:
    payload = state["input"]
    report_text = await study_agent.generate_report(
        material_title=payload["material_title"],
        material_summary=payload.get("material_summary"),
        attempt=payload.get("attempt"),
        weak_points=payload.get("weak_points") or [],
    )
    state["output"] = {"report_text": report_text}
    log_node(state, "generate_report_node")
    return state

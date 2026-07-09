"""자료 요약 에이전트 노드.

담당: services.study_agent.summarize를 그래프 노드로 감싼다. services.ingest의
백그라운드 업로드 파이프라인에서 호출된다.
"""

from agents.logging_utils import log_node
from agents.state import AgentState
from services import study_agent


async def summarize_node(state: AgentState) -> AgentState:
    payload = state["input"]
    result = await study_agent.summarize(payload["material_title"], payload["sample_text"])
    state["output"] = result
    log_node(state, "summarize_node", key_concept_count=len(result.get("key_concepts", [])))
    return state

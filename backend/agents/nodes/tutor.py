"""튜터 챗봇 에이전트 노드.

담당: services.study_agent.tutor_reply를 그래프 노드로 감싼다. 프롬프트/로직은
study_agent.py 그대로이며 이 노드는 상태 입출력 배선만 담당한다.
"""

from agents.logging_utils import log_node
from agents.state import AgentState
from services import study_agent


async def tutor_node(state: AgentState) -> AgentState:
    history = state["input"]["history"]
    context = state.get("context")
    reply = await study_agent.tutor_reply(history, context)
    state["output"] = {"reply": reply}
    log_node(state, "tutor_node", has_context=bool(context), history_len=len(history))
    return state

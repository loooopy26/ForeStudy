"""노드 실행 추적용 구조화 로깅.

담당: 각 에이전트 노드가 실행될 때 state["logs"]에 기록을 남기고, 동시에
stdlib logging으로도 남겨서 uvicorn 콘솔에서 그래프 실행 흐름을 볼 수 있게 한다.
"""

import logging

from agents.state import AgentState

logger = logging.getLogger("agents")


def log_node(state: AgentState, node_name: str, **fields) -> None:
    entry = {"node": node_name, **fields}
    state.setdefault("logs", []).append(entry)
    logger.info("agent node=%s %s", node_name, fields)

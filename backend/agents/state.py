"""공유 그래프 상태 정의.

담당: 모든 에이전트 노드가 주고받는 AgentState 타입과 초기 상태 생성 헬퍼.
"""

from typing import TypedDict


class AgentState(TypedDict, total=False):
    task: str
    input: dict
    output: dict | None
    context: str | None
    logs: list[dict]


def new_state(task: str, input: dict, context: str | None = None) -> AgentState:
    return AgentState(task=task, input=input, output=None, context=context, logs=[])

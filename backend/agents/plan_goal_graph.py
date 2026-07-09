"""시험 목표 대화 전용 tool-calling 그래프."""

import json
from typing import Annotated, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langchain_core.messages import convert_to_openai_messages

from agents.tools import TOOL_SCHEMAS, build_tool_dispatch
from db import get_pool
from services import upstage


class GoalAgentState(TypedDict, total=False):
    messages: Annotated[list[dict], add_messages]
    user_id: str
    certification_name: str
    iterations: int
    output: dict


_SYSTEM_PROMPT = """You are Forestudy's certification goal planning agent.
Answer in Korean.

Goal:
- Help the learner set a target exam date for the certification.
- Use tools when needed. Do not pretend you have built-in browsing.

Tool flow:
1. First call get_exam_goal for the certification.
2. If a goal exists, summarize it and ask whether the learner wants to keep or update it.
3. If no goal exists, call search_exam_schedule. Read the returned search snippets and infer the most likely exam date candidates.
4. Clearly say the date is based on search snippets, not official confirmation, and ask the learner to confirm or correct it.
5. Only call save_exam_goal after the learner confirms or gives a specific date.

When asking for confirmation, keep it short and practical.
"""


async def _agent_node(state: GoalAgentState) -> GoalAgentState:
    history = convert_to_openai_messages(state["messages"])
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "system", "content": f"Current certification_name: {state['certification_name']}"},
        *history,
    ]
    response = await upstage.chat_with_tools(messages, tools=TOOL_SCHEMAS, temperature=0.2)
    return {
        "messages": [response],
        "iterations": state.get("iterations", 0) + 1,
        "output": {
            "reply": response.get("content") or "",
            "tool_calls": response.get("tool_calls") or [],
        },
    }


async def _tools_node(state: GoalAgentState) -> GoalAgentState:
    pool = await get_pool()
    dispatch = build_tool_dispatch(pool, state["user_id"], state["certification_name"])
    last_message = state["messages"][-1]
    tool_calls = _extract_tool_calls(last_message)
    messages = []
    for tool_call in tool_calls:
        result = await dispatch(tool_call["name"], tool_call.get("arguments") or "{}")
        messages.append(
            {
                "role": "tool",
                "tool_call_id": tool_call.get("id"),
                "name": tool_call["name"],
                "content": json.dumps(result, ensure_ascii=False, default=str),
            }
        )
    return {"messages": messages}


def _route_after_agent(state: GoalAgentState) -> str:
    if state.get("iterations", 0) >= 4:
        return END
    last_message = state["messages"][-1]
    if _extract_tool_calls(last_message):
        return "tools"
    return END


def _extract_tool_calls(message) -> list[dict]:
    if isinstance(message, dict):
        raw_calls = message.get("tool_calls") or []
        calls = []
        for raw in raw_calls:
            function = raw.get("function") or {}
            calls.append(
                {
                    "id": raw.get("id"),
                    "name": function.get("name", ""),
                    "arguments": function.get("arguments") or "{}",
                }
            )
        return calls

    calls = []
    for raw in getattr(message, "tool_calls", []) or []:
        calls.append(
            {
                "id": raw.get("id"),
                "name": raw.get("name", ""),
                "arguments": raw.get("args", {}),
            }
        )
    return calls


def _build_graph():
    graph = StateGraph(GoalAgentState)
    graph.add_node("agent", _agent_node)
    graph.add_node("tools", _tools_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", _route_after_agent, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")
    return graph.compile(checkpointer=InMemorySaver())


_compiled_graph = _build_graph()


async def run_goal_agent_turn(
    *,
    user_id: str,
    certification_name: str,
    message: str,
    thread_id: str | None = None,
) -> dict:
    thread_id = thread_id or f"plan-goal-{user_id}-{certification_name}"
    state: GoalAgentState = {
        "messages": [{"role": "user", "content": message}],
        "user_id": user_id,
        "certification_name": certification_name,
        "iterations": 0,
    }
    result = await _compiled_graph.ainvoke(
        state,
        config={"configurable": {"thread_id": thread_id}},
    )
    return {
        "thread_id": thread_id,
        "reply": result.get("output", {}).get("reply", ""),
        "tool_calls": result.get("output", {}).get("tool_calls", []),
    }

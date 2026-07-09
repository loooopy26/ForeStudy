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

Tool flow (hard budget: you get at most one get_exam_goal call and at most ONE search_exam_schedule
call before you must reply in plain text — there is no third tool call available):
1. First call get_exam_goal for the certification.
2. If a goal exists, summarize it and ask whether the learner wants to keep or update it.
3. If no goal exists, call search_exam_schedule exactly once.
4. On your very next turn after that search, you MUST produce a plain-text reply — do not call
   search_exam_schedule or any tool again, even if the snippets look incomplete or you are unsure.
   Pick your best estimate from whatever snippets you got (or say you found no usable date), clearly
   mark it as unconfirmed, and ask the learner to confirm or provide the exact date themselves
   (YYYY-MM-DD 형식으로 알려주세요).
5. As soon as the learner confirms a date or gives their own specific date, call save_exam_goal
   immediately in that same turn — do not ask any follow-up question first (e.g. do not ask about
   current_level before saving). current_level is optional; omit it unless the learner already stated
   it, it defaults to "beginner" automatically. Never tell the learner the date is saved unless you
   actually called save_exam_goal in this turn.

Never call the same tool twice, and never call search_exam_schedule more than once per conversation
even with different arguments (e.g. a different year). Two tool calls total (get_exam_goal, then
search_exam_schedule) is the maximum before you owe the learner a text reply.

CRITICAL — never invent a date. save_exam_goal's target_exam_date must always be a date that is
explicitly present in the conversation: either a specific candidate date you already stated from
search results (which the learner then confirmed), or a specific date the learner typed themselves.
Never use today's date, a placeholder/format-example date, or any other guess as if it were a real
answer. If the learner replies with a vague confirmation like "네 맞아요" but no specific date has
been stated by anyone yet in this conversation, do NOT call save_exam_goal — reply asking them to
type the exact date (YYYY-MM-DD).

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


_FALLBACK_REPLY = "검색 결과로 정확한 시험일을 확인하지 못했어요. 목표 시험일을 YYYY-MM-DD 형식으로 직접 입력해 주세요."


async def _force_close_node(state: GoalAgentState) -> GoalAgentState:
    """반복 한도에 걸렸는데 마지막 응답이 아직 실행되지 않은 tool_call을 갖고 있는 경우를 처리한다.
    그 tool_call들을 실행하지 않은 채로 그냥 끝내면, 다음 사용자 턴에서 히스토리에
    '응답 없는 tool_call'이 남아 이후 대화가 전부 꼬인다(실제로 재현 확인함) —
    각 tool_call에 더미 tool 응답을 채워 히스토리를 유효한 상태로 마무리한다."""
    last_message = state["messages"][-1]
    tool_calls = _extract_tool_calls(last_message)
    messages = [
        {
            "role": "tool",
            "tool_call_id": call.get("id"),
            "name": call.get("name"),
            "content": json.dumps({"note": "반복 한도 초과로 실행되지 않았습니다"}, ensure_ascii=False),
        }
        for call in tool_calls
    ]
    messages.append({"role": "assistant", "content": _FALLBACK_REPLY})
    return {
        "messages": messages,
        "output": {"reply": _FALLBACK_REPLY, "tool_calls": []},
    }


def _route_after_agent(state: GoalAgentState) -> str:
    last_message = state["messages"][-1]
    has_tool_calls = bool(_extract_tool_calls(last_message))
    if state.get("iterations", 0) >= 5:
        return "force_close" if has_tool_calls else END
    if has_tool_calls:
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
    graph.add_node("force_close", _force_close_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges(
        "agent", _route_after_agent, {"tools": "tools", "force_close": "force_close", END: END}
    )
    graph.add_edge("tools", "agent")
    graph.add_edge("force_close", END)
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
    output = result.get("output", {})
    # force_close 노드가 못 잡는 예외적인 경우까지 대비한 마지막 안전망 — 빈 말풍선 방지.
    reply = output.get("reply") or _FALLBACK_REPLY
    return {
        "thread_id": thread_id,
        "reply": reply,
        "tool_calls": output.get("tool_calls", []),
    }

"""시험 목표 에이전트가 사용할 tool schema와 실행기."""

import asyncio
import json
from datetime import date

import asyncpg

from services import exam_goal_service, web_search


TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_exam_goal",
            "description": "저장된 자격증 시험 목표일과 현재 수준을 조회한다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "certification_name": {
                        "type": "string",
                        "description": "조회할 자격증명",
                    }
                },
                "required": ["certification_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_exam_schedule",
            "description": (
                "웹 검색 결과 스니펫으로 자격증 시험일정 후보를 찾는다. "
                "기준 연도와 그다음 연도 결과를 한 번에 함께 반환한다 "
                "(올해 시험이 이미 끝났거나 검색되지 않을 경우를 대비)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "certification_name": {"type": "string", "description": "검색할 자격증명"},
                    "year": {"type": "integer", "description": "검색 기준 연도. 없으면 현재 연도"},
                },
                "required": ["certification_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_exam_goal",
            "description": "사용자가 확인하거나 수정한 시험 목표일을 저장한다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "certification_name": {"type": "string", "description": "저장할 자격증명"},
                    "target_exam_date": {
                        "type": "string",
                        "description": "YYYY-MM-DD 형식의 목표 시험일",
                    },
                    "current_level": {
                        "type": "string",
                        "enum": ["beginner", "intermediate", "advanced"],
                        "description": "학습자 수준. 모르면 beginner",
                    },
                },
                "required": ["certification_name", "target_exam_date"],
            },
        },
    },
]


def build_tool_dispatch(pool: asyncpg.Pool, user_id: str, certification_name: str | None = None):
    async def dispatch(name: str, arguments: str | dict) -> dict:
        if isinstance(arguments, str):
            args = json.loads(arguments or "{}")
        else:
            args = arguments
        locked_certification_name = certification_name or args.get("certification_name") or ""

        if name == "get_exam_goal":
            return await exam_goal_service.get_exam_goal(
                pool,
                user_id=user_id,
                certification_name=locked_certification_name,
            )
        if name == "search_exam_schedule":
            base_year = args.get("year") or date.today().year
            next_year = base_year + 1
            current_query = f"{base_year}년 {locked_certification_name} 시험일정"
            next_query = f"{next_year}년 {locked_certification_name} 시험일정"
            # 한 대화당 이 툴은 한 번만 호출 가능하므로, 올해 일정이 이미 지났거나
            # 검색이 안 되는 경우에 대비해 다음 연도 결과까지 한 번에 같이 가져온다.
            current_results, next_results = await asyncio.gather(
                web_search.search(current_query, max_results=5),
                web_search.search(next_query, max_results=5),
            )
            return {
                "today": date.today().isoformat(),
                "current_year": base_year,
                "current_year_query": current_query,
                "current_year_results": current_results,
                "next_year": next_year,
                "next_year_query": next_query,
                "next_year_results": next_results,
            }
        if name == "save_exam_goal":
            return await exam_goal_service.save_exam_goal(
                pool,
                user_id=user_id,
                certification_name=locked_certification_name,
                target_exam_date=date.fromisoformat(args["target_exam_date"]),
                current_level=args.get("current_level"),
            )
        return {"error": f"unknown tool: {name}"}

    return dispatch

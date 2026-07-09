"""시험 목표 에이전트가 사용할 tool schema와 실행기."""

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
            "description": "웹 검색 결과 스니펫으로 자격증 시험일정 후보를 찾는다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "certification_name": {"type": "string", "description": "검색할 자격증명"},
                    "year": {"type": "integer", "description": "검색할 연도. 없으면 현재 연도"},
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
            year = args.get("year") or date.today().year
            results = await web_search.search(
                f"{year}년 {locked_certification_name} 시험일정",
                max_results=5,
            )
            return {"query": f"{year}년 {locked_certification_name} 시험일정", "results": results}
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

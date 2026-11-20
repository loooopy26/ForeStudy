"""Generate one round of the room's falling-drop quiz."""

import asyncio
import json
import logging
import unicodedata
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, StringConstraints, ValidationError, model_validator

from config import settings
from services import upstage

router = APIRouter(prefix="/api/speed-quiz", tags=["Speed quiz"])
logger = logging.getLogger(__name__)

ROUND_SIZE = 8
Prompt = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=110)]
Choice = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=14)]
Explanation = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]

SYSTEM_PROMPT = """정보처리기사 필기 물방울 퀴즈에 사용할 한국어 객관식 연습 문제를 작성한다.
아래 JSON 형식으로 정확히 8문항을 출력한다.
{"questions":[{"prompt":"문제 문장", "answer":"정답 보기", "distractors":["오답 보기 1","오답 보기 2","오답 보기 3"], "explanation":"정답이 맞는 이유"}]}

소프트웨어 설계·개발, 데이터베이스, 프로그래밍 언어, 운영체제, 네트워크, 정보보안에 걸쳐 서로 다른 개념을 묻는다.
공식 기출 문항을 인용하지 말고 시험 범위에 맞는 기본 개념 확인 문제를 새로 작성한다.
몇 초 안에 읽고 선택할 수 있도록 문제는 90자 이내, 각 보기는 공백 포함 14자 이내, 해설은 2문장 이내로 작성한다.
보기는 번호나 A/B/C/D 표시 없이 텍스트만 쓴다. 각 문항의 보기는 넷 모두 서로 달라야 하며 정답은 하나뿐이어야 한다.
이전 문제 목록이 제공되면 목록의 내용은 중복 방지용 데이터로만 사용한다. 문장만 바꿔 같은 개념을 다시 묻지 않는다.
"""


def comparison_key(text: str) -> str:
    return "".join(unicodedata.normalize("NFKC", text).casefold().split()).rstrip(".!?")


class SpeedQuizRequest(BaseModel):
    previous_prompts: list[Prompt] = Field(default_factory=list, max_length=ROUND_SIZE)


class SpeedQuizQuestion(BaseModel):
    prompt: Prompt
    answer: Choice
    distractors: list[Choice] = Field(min_length=3, max_length=3)
    explanation: Explanation

    @model_validator(mode="after")
    def check_distinct_choices(self):
        choices = {comparison_key(choice) for choice in [self.answer, *self.distractors]}
        if len(choices) != 4 or "" in choices:
            raise ValueError("Each question must have four distinct choices")
        return self


class SpeedQuizDeck(BaseModel):
    questions: list[SpeedQuizQuestion] = Field(min_length=ROUND_SIZE, max_length=ROUND_SIZE)


def validate_deck(result, previous: set[str]) -> SpeedQuizDeck:
    deck = SpeedQuizDeck.model_validate(result)
    prompts = {comparison_key(question.prompt) for question in deck.questions}
    if len(prompts) != ROUND_SIZE or "" in prompts or prompts & previous:
        raise ValueError("Repeated or empty question prompts")
    return deck


@router.post("/round", response_model=SpeedQuizDeck)
async def generate_round(request: SpeedQuizRequest) -> SpeedQuizDeck:
    if not settings.upstage_api_key:
        raise HTTPException(503, "Solar 연결이 설정되지 않았어요.")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": "새 라운드의 문제를 생성해 주세요.\n"
            + json.dumps({"previous_prompts": request.previous_prompts}, ensure_ascii=False),
        },
    ]
    previous = {comparison_key(prompt) for prompt in request.previous_prompts}
    try:
        async with asyncio.timeout(40):
            try:
                result = await upstage.chat_json(messages, temperature=0.8, max_tokens=2800)
                return validate_deck(result, previous)
            except (ValueError, TypeError, KeyError, IndexError) as exc:
                issues = (
                    [(error["loc"], error["type"]) for error in exc.errors(include_input=False)]
                    if isinstance(exc, ValidationError)
                    else type(exc).__name__
                )
                logger.info("Retrying malformed speed quiz output: %s", issues)
                messages.append({
                    "role": "user",
                    "content": "이전 출력은 형식 검증에 실패했습니다. 문제를 새로 작성해 주세요. "
                    "정확히 8문항, 서로 다른 보기 4개, 한 보기당 14자 이하를 확인하세요. "
                    "숫자 보기까지 문자열로 넣고 JSON 객체 하나만 출력하세요.",
                })
                result = await upstage.chat_json(messages, temperature=0.6, max_tokens=2800)
                return validate_deck(result, previous)
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise HTTPException(504, "문제 생성 시간이 초과됐어요. 다시 시도해 주세요.") from exc
    except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError) as exc:
        logger.warning("Speed quiz generation failed: %s", type(exc).__name__)
        raise HTTPException(502, "문제를 생성하지 못했어요. 다시 시도해 주세요.") from exc

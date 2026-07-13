"""API 요청/응답 데이터 형식 모음.

담당: 회원가입, 도서관 타이머, 상태창/리포트, AI 아이템 생성, 위치/시험 당일 어시스턴트
탭의 데이터 구조 정의. (AI 도서관/퀴즈/퀘스트/상점/방/캐릭터 등 나머지는 각자 라우터
파일 안에 로컬 모델로 정의돼 있거나, cert_goals/goods/quest_progress처럼 Pydantic
모델 없이 dict를 그대로 반환한다.)
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


# Auth: 회원가입/로그인 화면에서 사용하는 요청과 응답입니다.
class UserRegisterRequest(BaseModel):
    email: str = Field(..., example="student@example.com")
    password: str = Field(..., min_length=4, example="1234")
    nickname: str = Field(..., example="성실한 학습자")


class UserLoginRequest(BaseModel):
    email: str = Field(..., example="student@example.com")
    password: str = Field(..., example="1234")


class UserResponse(BaseModel):
    id: str  # users.id 는 UUID (문자열로 직렬화)
    email: str
    nickname: str
    level: int
    current_xp: int = 0
    dotori: int  # 도토리(재화) 점수 = users.dotori


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"
    message: str


class QuestRewardRequest(BaseModel):
    exp: int = Field(..., ge=0)
    dotori: int = Field(..., ge=0)


class DotoriSpendRequest(BaseModel):
    amount: int = Field(..., ge=0)


# Timer: 도서관 공부 시작, 이탈/정지, 종료 이벤트를 기록합니다.
# 시간 측정은 프론트에서 하고, 백엔드는 그 값을 받아 DB에 저장만 합니다.
# user_id/session_id는 로그인 계정 기준 Postgres UUID입니다.
class TimerStartRequest(BaseModel):
    user_id: str = Field(..., example="00000000-0000-0000-0000-000000000000")
    material_id: str | None = Field(None, example="material-uuid")


class TimerStartResponse(BaseModel):
    session_id: str
    user_id: str
    started_at: datetime
    status: str


class TimerPauseRequest(BaseModel):
    session_id: str = Field(..., example="00000000-0000-0000-0000-000000000000")
    segment_minutes: int = Field(..., ge=0, example=15, description="프론트에서 측정한, 시작(또는 직전 재개) 이후 이번 구간 동안 집중한 분")
    reason: str = Field("leave_library", example="leave_library")


class TimerPauseResponse(BaseModel):
    session_id: str
    user_id: str
    paused_at: datetime
    segment_minutes: int
    total_studied_minutes: int
    status: str
    reason: str


class TimerEndRequest(BaseModel):
    session_id: str = Field(..., example="00000000-0000-0000-0000-000000000000")
    studied_minutes: int = Field(..., ge=0, example=40, description="프론트에서 측정한 총 공부 시간(분)")
    max_uninterrupted_minutes: int = Field(..., ge=0, example=40, description="프론트에서 측정한, 이탈 없이 이어간 최대 구간(분)")


class TimerEndResponse(BaseModel):
    session_id: str
    user_id: str
    started_at: datetime
    ended_at: datetime
    studied_minutes: int
    max_uninterrupted_minutes: int
    reward_token: int
    status: str
    final_quiz_recommended: bool
    next_action: str


# Stats/Reports: 공부 시간, 연속 학습일, 퀴즈 점수 기반 능력치입니다.
class StatsResponse(BaseModel):
    user_id: str
    focus: int
    comprehension: int
    persistence: int
    growth_score: int
    pass_rate: float
    total_study_minutes: int
    current_streak_days: int
    recent_quiz_average: float
    ai_feedback: str
    agent: str = "Status Agent + Evaluator"


# AI 아이템 생성 응답에서 쓰는 아이템 모양 (예전 상점 더미 라우터와 공유하던 모양을 그대로 유지).
class ShopItemResponse(BaseModel):
    item_id: int
    name: str
    item_type: str
    price_token: int
    theme_required: str | None = None
    image_url: str | None = None  # AI로 생성된 커스텀 아이템만 값이 있음


# 아이템 생성: 도토리를 소모해 자연어 설명을 이미지로 변환하고 곧바로 인벤토리에 등록합니다.
# user_id는 화면별 더미 인벤토리(SQLite, 로그인 없는 MVP)에 쓰는 고정 데모 id.
# real_user_id가 있으면(로그인한 유저) 도토리는 그 대신 PostgreSQL users.dotori에서 차감한다 —
# 두 값이 가리키는 "도토리"가 서로 다른 저장소라 하나로 합치지 않고 명시적으로 분리했다.
class GenerateItemRequest(BaseModel):
    user_id: int = Field(..., example=1)
    real_user_id: str | None = Field(None, example="c1bc4aa9-7446-4f32-84fd-7a304d3a61e7")
    prompt: str = Field(..., min_length=1, example="포근한 나무 책상")


class GeneratedItemResponse(BaseModel):
    user_id: int
    item: ShopItemResponse
    remaining_token: int
    message: str


# Location: TMAP 기반 주변 학습장소 추천 / 시험 당일 어시스턴트 (프론트 미연결, 백엔드 전용)
TransportMode = Literal["walk", "car", "transit"]

DEFAULT_STUDY_PLACE_KEYWORDS = ["도서관", "스터디카페", "카페", "대학 도서관", "프린트"]
DEFAULT_TRANSPORT_MODES: list[TransportMode] = ["walk", "car", "transit"]


class Coordinate(BaseModel):
    latitude: float = Field(..., example=37.5665)
    longitude: float = Field(..., example=126.9780)


class NearbyStudyPlacesRequest(BaseModel):
    latitude: float = Field(..., example=37.5665)
    longitude: float = Field(..., example=126.9780)
    radius_meters: int = Field(3000, gt=0, le=20000, example=3000)
    query: str | None = Field(
        None,
        example="가까운 공부하기 좋은 카페 알려줘",
        description="자연어 요청. 있으면 LLM(또는 규칙 기반)이 의도를 분석해 keywords 대신 사용할 검색어를 추출한다.",
    )
    keywords: list[str] = Field(default_factory=lambda: list(DEFAULT_STUDY_PLACE_KEYWORDS))
    transport_modes: list[TransportMode] = Field(default_factory=lambda: list(DEFAULT_TRANSPORT_MODES))
    debug: bool = Field(False, description="true면 각 경로 응답에 TMAP 원본(raw)을 포함한다")


class PlaceSearchRequest(BaseModel):
    """장소/주소 검색 (출발지 선택용). 중심 좌표가 있으면 주변 우선, 없으면 전국 검색."""

    query: str = Field(..., min_length=1, example="강남역")
    latitude: float | None = Field(None, example=37.5665)
    longitude: float | None = Field(None, example=126.9780)
    count: int = Field(10, ge=1, le=20)


class ExamInfoRequest(BaseModel):
    certification_name: str = Field(..., example="정보처리기사")
    exam_site_name: str = Field(..., example="서울국가자격시험장")
    exam_site_address: str = Field(..., example="서울특별시 중구 세종대로 110")
    coordinate: Coordinate | None = Field(
        None,
        description="장소 검색에서 확정한 시험장 좌표. 있으면 주소 지오코딩보다 우선해 같은 장소로 경로를 계산한다.",
    )
    exam_date: str = Field(..., example="2026-07-20", description="YYYY-MM-DD")
    exam_start_time: str = Field(..., example="09:00", description="HH:MM")


class ExamDayAssistantRequest(BaseModel):
    # 출발지는 좌표(origin) 또는 주소(origin_address) 중 하나로 지정한다.
    # 둘 다 있으면 좌표를 우선하고, 주소는 라우터에서 TMAP 지오코딩으로 좌표 변환한다.
    origin: Coordinate | None = None
    origin_address: str | None = Field(
        None,
        example="서울특별시 강남구 테헤란로 212",
        description="출발지 주소. origin(좌표)이 없을 때 TMAP 지오코딩으로 좌표 변환해 사용한다.",
    )
    exam: ExamInfoRequest
    buffer_minutes: int = Field(30, ge=0, le=180, example=30)
    transport_modes: list[TransportMode] = Field(default_factory=lambda: list(DEFAULT_TRANSPORT_MODES))
    debug: bool = Field(False, description="true면 각 경로 응답에 TMAP 원본(raw)을 포함한다")

    @model_validator(mode="after")
    def _require_origin_or_address(self):
        if self.origin is None and not (self.origin_address and self.origin_address.strip()):
            raise ValueError("origin(좌표) 또는 origin_address(출발지 주소) 중 하나는 필요합니다.")
        return self

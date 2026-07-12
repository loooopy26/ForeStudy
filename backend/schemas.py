"""API 요청/응답 데이터 형식 모음.

담당: 회원가입, 홈, 마을, 도서관, 퀘스트, 퀴즈, 리포트, 상점, 내 방, 캐릭터 탭의 데이터 구조 정의.
프론트 탭: 전체 탭 공통.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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
    dotori: int  # 도토리(재화) 점수 = users.dotori


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"
    message: str


# Goals: 사용자가 준비할 자격증 목표와 학습 기간을 설정합니다.
class GoalCreate(BaseModel):
    user_id: int = Field(..., example=1)
    certificate_name: str = Field(..., example="정보처리기사")
    period_days: int = Field(..., gt=0, example=14)
    difficulty: str = Field(..., example="초급")
    current_level: str = Field(..., example="입문")


class GoalResponse(GoalCreate):
    id: int
    message: str = "목표가 저장되었습니다."


# Library: AI 도서관 화면에서 학습 자료 분석 결과를 보여줍니다.
class LibraryAnalyzeRequest(BaseModel):
    user_id: int = Field(..., example=1)
    material_title: str = Field(..., example="정보처리기사 소프트웨어 설계 요약")
    material_type: str = Field("text", example="PDF")
    content: str = Field(..., example="요구사항 확인, 화면 설계, 애플리케이션 설계")


class LibraryAnalyzeResponse(BaseModel):
    material_id: int
    summary: str
    key_concepts: list[str]
    recommended_quiz_count: int
    study_report: str
    agent: str = "RAG + Study Agent"


# Quests: 퀘스트 게시판의 하루 퀘스트 생성과 완료 처리입니다.
class QuestGenerateRequest(BaseModel):
    user_id: int = Field(..., example=1)
    goal_id: int = Field(..., example=1)


class QuestResponse(BaseModel):
    title: str
    description: str
    quest_type: str
    target_value: int
    reward_token: int
    difficulty: str = "normal"


class QuestCompleteRequest(BaseModel):
    user_id: int = Field(..., example=1)
    quest_type: str = Field(..., example="study_time")
    achieved_value: int = Field(..., ge=0, example=40)
    target_value: int = Field(..., gt=0, example=40)
    reward_token: int = Field(..., ge=0, example=30)


class QuestCompleteResponse(BaseModel):
    user_id: int
    quest_type: str
    completed: bool
    progress_percent: float
    reward_token: int
    message: str


# Timer: 도서관 공부 시작, 이탈/정지, 종료 이벤트를 기록합니다.
# 시간 측정은 프론트에서 하고, 백엔드는 그 값을 받아 DB에 저장만 합니다.
class TimerStartRequest(BaseModel):
    user_id: int = Field(..., example=1)
    material_id: str | None = Field(None, example="material-uuid")


class TimerStartResponse(BaseModel):
    session_id: int
    user_id: int
    started_at: datetime
    status: str


class TimerPauseRequest(BaseModel):
    session_id: int = Field(..., example=1)
    segment_minutes: int = Field(..., ge=0, example=15, description="프론트에서 측정한, 시작(또는 직전 재개) 이후 이번 구간 동안 집중한 분")
    reason: str = Field("leave_library", example="leave_library")


class TimerPauseResponse(BaseModel):
    session_id: int
    user_id: int
    paused_at: datetime
    segment_minutes: int
    total_studied_minutes: int
    status: str
    reason: str


class TimerEndRequest(BaseModel):
    session_id: int = Field(..., example=1)
    studied_minutes: int = Field(..., ge=0, example=40, description="프론트에서 측정한 총 공부 시간(분)")
    max_uninterrupted_minutes: int = Field(..., ge=0, example=40, description="프론트에서 측정한, 이탈 없이 이어간 최대 구간(분)")


class TimerEndResponse(BaseModel):
    session_id: int
    user_id: int
    started_at: datetime
    ended_at: datetime
    studied_minutes: int
    max_uninterrupted_minutes: int
    reward_token: int
    status: str
    final_quiz_recommended: bool
    next_action: str


# Quiz: AI 퀴즈 생성, 제출, 자동 채점 결과입니다.
class QuizGenerateRequest(BaseModel):
    user_id: int = Field(..., example=1)
    goal_id: int = Field(..., example=1)
    count: int = Field(5, ge=1, le=10, example=5)


class QuizQuestion(BaseModel):
    question_id: int
    question: str
    choices: list[str]


class QuizGenerateResponse(BaseModel):
    quiz_id: int
    user_id: int
    goal_id: int
    questions: list[QuizQuestion]


class QuizAnswer(BaseModel):
    question_id: int
    selected_choice: str


class QuizSubmitRequest(BaseModel):
    user_id: int = Field(..., example=1)
    quiz_id: int = Field(..., example=1)
    answers: list[QuizAnswer]


class QuizSubmitResponse(BaseModel):
    quiz_id: int
    user_id: int
    total_questions: int
    correct_count: int
    score_percent: float
    reward_token: int
    passed: bool


# Stats/Reports: 공부 시간, 연속 학습일, 퀴즈 점수 기반 능력치입니다.
class StatsResponse(BaseModel):
    user_id: int
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


# Rewards: 성장 시스템의 레벨, EXP, 토큰, 업적, 테마 해금 상태입니다.
class RewardsResponse(BaseModel):
    user_id: int
    level: int
    exp: int
    token: int
    achievements: list[str]
    unlocked_themes: list[str]
    agent: str = "Growth Agent"


# Shop: 상점 화면의 아이템 목록과 구매 결과입니다.
class ShopItemResponse(BaseModel):
    item_id: int
    name: str
    item_type: str
    price_token: int
    theme_required: str | None = None
    image_url: str | None = None  # AI로 생성된 커스텀 아이템만 값이 있음


class PurchaseItemRequest(BaseModel):
    user_id: int = Field(..., example=1)
    item_id: int = Field(..., example=1)


class PurchaseItemResponse(BaseModel):
    user_id: int
    item: ShopItemResponse
    remaining_token: int
    message: str


# Room: 내 방 꾸미기 화면에서 구매한 아이템을 배치합니다.
class RoomResponse(BaseModel):
    user_id: int
    equipped_items: list[ShopItemResponse]
    natural_language_prompt: str | None = None


class RoomDecorateRequest(BaseModel):
    user_id: int = Field(..., example=1)
    item_ids: list[int] = Field(default_factory=list, example=[1, 2])
    prompt: str | None = Field(None, example="책상 옆에 초록 식물을 배치해줘")


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


# Dashboard/Village: 홈 화면과 마을 허브 화면에서 한 번에 보여줄 요약 데이터입니다.
class DashboardQuest(BaseModel):
    title: str
    target_minutes: int
    progress_percent: float
    exp_reward: int
    token_reward: int


class DashboardResponse(BaseModel):
    user_id: int
    nickname: str
    level: int
    exp: int
    next_level_exp: int
    token: int
    gem: int
    streak_days: int
    stats: StatsResponse
    today_quest: DashboardQuest


class VillageLocation(BaseModel):
    key: str
    name: str
    path: str
    unlocked: bool


class VillageResponse(BaseModel):
    user_id: int
    token: int
    gem: int
    locations: list[VillageLocation]
    weekly_exam: str
    weekly_progress_percent: float


# Achievements/Character: 업적 화면과 캐릭터 장착 화면에 사용합니다.
class AchievementResponse(BaseModel):
    title: str
    description: str
    progress_current: int
    progress_target: int
    completed: bool
    reward_token: int


class CharacterResponse(BaseModel):
    user_id: int
    level: int
    token: int
    gem: int
    equipped_items: list[ShopItemResponse]
    owned_item_ids: list[int]


class CharacterEquipRequest(BaseModel):
    user_id: int = Field(..., example=1)
    item_ids: list[int] = Field(default_factory=list, example=[1])


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


class ExamInfoRequest(BaseModel):
    certification_name: str = Field(..., example="정보처리기사")
    exam_site_name: str = Field(..., example="서울국가자격시험장")
    exam_site_address: str = Field(..., example="서울특별시 중구 세종대로 110")
    exam_date: str = Field(..., example="2026-07-20", description="YYYY-MM-DD")
    exam_start_time: str = Field(..., example="09:00", description="HH:MM")


class ExamDayAssistantRequest(BaseModel):
    origin: Coordinate
    exam: ExamInfoRequest
    buffer_minutes: int = Field(30, ge=0, le=180, example=30)
    transport_modes: list[TransportMode] = Field(default_factory=lambda: list(DEFAULT_TRANSPORT_MODES))
    debug: bool = Field(False, description="true면 각 경로 응답에 TMAP 원본(raw)을 포함한다")

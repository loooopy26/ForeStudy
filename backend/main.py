"""Forestudy 백엔드 시작 파일.

담당: 전체 FastAPI 앱 실행, CORS 설정, 화면별 API 라우터 연결.
프론트 탭: 전체 앱 공통 진입점.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import settings
from database import init_db
from db import close_pool
from routers import (
    auth,
    cert_goals,
    exam_day,
    goods,
    item_generation,
    learning_plans,
    location,
    materials,
    quest_progress,
    quizzes,
    reports,
    stats,
    timer,
    tutor,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_pool()


# FastAPI 앱 기본 설정입니다.
app = FastAPI(
    title="Forestudy Backend",
    description="Game-based certificate study management API MVP",
    version="0.2.0",
    lifespan=lifespan,
)

init_db()

# MVP 단계에서는 프론트 개발 주소가 바뀔 수 있어 CORS를 전체 허용합니다.
# 배포 단계에서는 allow_origins를 실제 프론트 도메인으로 제한하는 것이 좋습니다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# AI로 생성한 아이템 이미지(배경 투명 PNG)를 프론트에서 <img src="{API_BASE}/generated-items/...">로
# 바로 쓸 수 있도록 정적 파일로 서빙합니다.
app.mount(
    "/generated-items",
    StaticFiles(directory=settings.generated_items_dir),
    name="generated-items",
)

# AI 질문(튜터 챗)에 첨부한 사진을 프론트에서 <img src="{API_BASE}/tutor-chat-images/...">로
# 바로 쓸 수 있도록 정적 파일로 서빙합니다.
app.mount(
    "/tutor-chat-images",
    StaticFiles(directory=settings.tutor_chat_images_dir),
    name="tutor-chat-images",
)


# 서버가 정상 실행 중인지 확인하는 가장 단순한 체크 API입니다.
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Forestudy backend is running"}


# 브라우저에서 루트 주소로 들어왔을 때 안내용 JSON을 반환합니다.
@app.get("/")
def root():
    return {
        "message": "Forestudy backend is running",
        "docs": "http://127.0.0.1:8000/docs",
        "health": "http://127.0.0.1:8000/health",
    }


def register_router(router):
    # 현재 FastAPI 버전에서 include_router가 지연 등록 객체로 남는 경우가 있어
    # MVP 실행 안정성을 위해 라우터의 실제 path operation을 직접 앱에 붙입니다.
    app.router.routes.extend(router.routes)


# 화면/기능 단위 라우터 등록 구간입니다.
# 예전에 팀원이 화면별로 미리 만들어뒀던 더미 라우터(dashboard/village/shop/room/
# character/quests/rewards/achievements/goals/growth_reports)는 로그인 계정과
# 무관한 SQLite/인메모리 스텁이었고 프론트에서 한 번도 호출하지 않아 제거했습니다.
# 같은 기능은 각각 cert_goals/goods/quest_progress/stats가 실제로 담당합니다.
for api_router in [
    auth.router,
    materials.router,
    cert_goals.router,
    learning_plans.router,
    quest_progress.router,
    timer.router,
    quizzes.router,
    tutor.router,
    reports.router,
    stats.router,
    goods.router,
    item_generation.router,
    location.router,
    exam_day.router,
]:
    register_router(api_router)

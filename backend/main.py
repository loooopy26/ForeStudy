"""Forestudy 백엔드 시작 파일.

담당: 전체 FastAPI 앱 실행, CORS 설정, 화면별 API 라우터 연결.
프론트 탭: 전체 앱 공통 진입점.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from db import close_pool
from routers import (
    achievements,
    auth,
    character,
    certifications,
    dashboard,
    goals,
    growth_reports,
    learning_plans,
    location,
    materials,
    quests,
    quizzes,
    reports,
    rewards,
    room,
    shop,
    stats,
    timer,
    tutor,
    village,
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
# AI 도서관/AI 퀴즈/튜터 챗봇/학습 리포트는 Upstage+pgvector로 실제 동작하는
# materials/quizzes/tutor/reports를 사용하고, 팀원이 만든 library/quiz 더미
# 라우터는 등록하지 않습니다 (같은 기능의 인메모리 스텁이라 중복).
for api_router in [
    auth.router,
    goals.router,
    dashboard.router,
    village.router,
    materials.router,
    learning_plans.router,
    quests.router,
    timer.router,
    quizzes.router,
    tutor.router,
    reports.router,
    growth_reports.router,
    stats.router,
    rewards.router,
    achievements.router,
    shop.router,
    room.router,
    character.router,
    certifications.router,
    location.router,
]:
    register_router(api_router)

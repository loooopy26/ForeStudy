from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import close_pool
from routers import goals, materials, quests, quizzes, reports, tutor


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_pool()


app = FastAPI(
    title="QuestStudy AI Backend",
    description="Game-based certificate study management API MVP",
    version="0.1.0",
    lifespan=lifespan,
)

# 프론트/다른 서비스와 합치기 전 개발용 CORS 전체 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "QuestStudy AI backend is running"}


app.include_router(goals.router)
app.include_router(quests.router)
app.include_router(materials.router)
app.include_router(quizzes.router)
app.include_router(tutor.router)
app.include_router(reports.router)

from fastapi import FastAPI

from routers import goals, quests

app = FastAPI(
    title="QuestStudy AI Backend",
    description="Game-based certificate study management API MVP",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {"status": "ok", "message": "QuestStudy AI backend is running"}


app.include_router(goals.router)
app.include_router(quests.router)

# QuestStudy / Forestudy 백엔드

FastAPI 백엔드. 두 파트가 합쳐져 있습니다.

- **AI 퀘스트 게시판** (`routers/goals.py`, `routers/quests.py`, `services/quest_service.py`) — 목표 등록, 일일 퀘스트 생성 (현재 인메모리 더미, DB/AI 연동 예정)
- **AI 도서관** (`routers/materials.py`, `quizzes.py`, `tutor.py`, `reports.py` + `services/upstage.py`, `chunking.py`, `rag.py`, `ingest.py`, `study_agent.py`) — RAG + Study Agent 파이프라인

자료 업로드 → Document Parse 파싱 → 섹션 청킹 → 임베딩(solar-embedding-2, 1024차원) →
pgvector 저장 → 요약/핵심개념 → AI 퀴즈 생성/자동 채점 → 오답(약점) 분석 → 학습 리포트 → 튜터 챗봇

## 준비

1. **PostgreSQL + pgvector**
   ```sql
   CREATE DATABASE forestudy;
   -- forestudy DB에 접속 후
   \i db/schema.sql   -- 리포지토리 루트의 db/schema.sql (pgvector 확장 포함)
   ```
   pgvector 미설치 시: https://github.com/pgvector/pgvector (Docker는 `pgvector/pgvector:pg17` 이미지 사용)

2. **환경 변수** — `backend/.env` (`.env.example` 참고, git에는 올라가지 않음)
   ```
   UPSTAGE_API_KEY=up_...
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/forestudy
   ```

3. **실행**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   # http://localhost:8000/docs
   ```

## API 흐름

| 파트 | 메서드 | 경로 | 설명 |
|---|---|---|---|
| 퀘스트 | POST | `/goals` | 학습 목표 등록 |
| 퀘스트 | POST | `/quests/generate` | 목표 기반 오늘의 퀘스트 생성 (더미) |
| 도서관 | POST | `/api/materials` | 파일 업로드 (multipart: `file`, `title?`, `user_id?`) → 202 + `material_id` |
| 도서관 | GET | `/api/materials/{id}` | `processed_status`가 `ready` 될 때까지 폴링. 요약/핵심개념 포함 |
| 도서관 | POST | `/api/materials/{id}/quiz` | 퀴즈 생성 `{num_questions, difficulty}` → 문항(정답 미포함) |
| 도서관 | POST | `/api/quizzes/{id}/submit` | 답안 제출 `{answers:[{question_id, answer}]}` → 채점+해설+오답분석 |
| 도서관 | POST | `/api/reports` | 학습 리포트 생성 `{study_material_id, quiz_attempt_id?}` |
| 도서관 | POST/GET | `/api/tutor/sessions`, `.../messages` | 약점 재학습 튜터 챗 |
| 도서관(디버그) | GET | `/api/materials/{id}/search?query=` | RAG 검색 미리보기 |

`user_id`를 안 보내면 도서관 쪽 엔드포인트는 데모 유저를 자동 생성합니다 (인증 연동 전 임시. `db.py`의 `get_or_create_demo_user`).

## 구조

```
backend/
├── main.py              # FastAPI 앱 진입점 — 모든 라우터 등록
├── config.py             # 환경 변수 (.env)
├── db.py                 # asyncpg 커넥션 풀 (AI 도서관 파트에서 사용)
├── schemas.py             # 퀘스트 게시판 Pydantic 모델
├── routers/
│   ├── goals.py, quests.py           # 퀘스트 게시판
│   └── materials.py, quizzes.py, tutor.py, reports.py   # AI 도서관
├── services/
│   ├── quest_service.py              # 퀘스트 게시판 로직
│   └── upstage.py, chunking.py, rag.py, ingest.py, study_agent.py   # AI 도서관 RAG 파이프라인
└── uploads/               # 업로드 파일 저장 (git 제외)
```

## 다음 통합 작업

- 퀘스트 게시판을 인메모리 → DB(`db/schema.sql`의 `quests`, `curricula` 등)로 전환
- 퀴즈 완료(`quizzes.submit_quiz`) → 퀘스트 진행도/XP 지급 연동 훅 추가
- 인증 붙이면 도서관 쪽 데모 유저 로직을 실제 user_id로 교체

## 참고 (Upstage API)

- Chat: `POST /v1/chat/completions`, `solar-pro2` (JSON Mode 사용 중)
- Embeddings: `solar-embedding-2-passage`(저장) / `-query`(검색), **1024차원**, 배치 최대 100개
- Document Parse: `POST /v1/document-digitization`, `model=document-parse`, 동기 최대 100페이지
- 임베딩 차원을 바꾸면 `db/schema.sql`의 `VECTOR(1024)`도 함께 변경할 것

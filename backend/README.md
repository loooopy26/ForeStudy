# Forestudy 백엔드

FastAPI 백엔드. 팀원이 만든 화면별 MVP API 전체와 실제 동작하는 AI 도서관(RAG) 스택이 하나의 앱으로 합쳐져 있습니다.

- **화면별 MVP API** (`auth`, `goals`, `quests`, `dashboard`, `village`, `timer`, `stats`, `growth_reports`, `rewards`, `achievements`, `shop`, `room`, `character`) — 인메모리(`services/memory_store.py`) 기반 더미 구현. 프론트 개발/화면 연결용
- **AI 도서관** (`materials`, `quizzes`, `tutor`, `reports` + `services/upstage.py`, `chunking.py`, `rag.py`, `ingest.py`, `study_agent.py`) — Upstage Solar + pgvector로 실제 동작하는 RAG 파이프라인

자료 업로드 → Document Parse 파싱 → 섹션 청킹 → 임베딩(solar-embedding-2, 1024차원) →
pgvector 저장 → 요약/핵심개념 → AI 퀴즈 생성/자동 채점 → 오답(약점) 분석 → 학습 리포트 → 튜터 챗봇

## 준비

1. **PostgreSQL + pgvector**
   ```sql
   CREATE DATABASE forestudy;
   -- forestudy DB에 접속 후
   \i db/schema.sql   -- 리포지토리 루트의 db/schema.sql (pgvector 확장 포함)
   ```
   pgvector 미설치 시: https://github.com/pgvector/pgvector
   - Windows에서 직접 빌드하려면 PostgreSQL 설치 시 함께 깔리는 헤더(`include/server`)와 MSVC(Visual Studio C++ 빌드 도구)가 필요합니다: `nmake /f Makefile.win` → `nmake /f Makefile.win install` (Program Files 하위라 관리자 권한 필요)
   - Docker 쓸 수 있으면 `pgvector/pgvector:pg17` 이미지가 더 간단합니다

2. **환경 변수** — `backend/.env` (`.env.example` 참고, git에는 올라가지 않음)
   ```
   UPSTAGE_API_KEY=up_...
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/forestudy
   ```
   `UPSTAGE_API_KEY`는 선택값입니다 — 없어도 앱은 정상 기동하고, AI 도서관 쪽 엔드포인트를 실제 호출할 때만 에러가 납니다. 화면별 MVP API(더미)는 키 없이도 그대로 동작합니다.

3. **실행**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   # http://localhost:8000/docs
   ```

## API 목록

| 파트 | 메서드 | 경로 | 설명 | 구현 상태 |
|---|---|---|---|---|
| 인증 | POST | `/auth/register`, `/auth/login` | 회원가입/로그인 | 더미 |
| 인증 | GET | `/auth/me/{user_id}` | 내 정보 조회 | 더미 |
| 퀘스트 | POST | `/goals` | 학습 목표 등록 | 더미 |
| 퀘스트 | POST | `/quests/generate`, `/quests/complete` | 오늘의 퀘스트 생성/완료 처리 | 더미 |
| 홈 | GET | `/dashboard/{user_id}` | 홈 요약 | 더미 |
| 상태창 | GET | `/stats/{user_id}` | 집중력/이해도/지속성/합격률 | 더미 |
| 리포트 | GET | `/reports/{user_id}` | AI 분석 리포트 (능력치 기반) | 더미 |
| 도서관 타이머 | POST | `/timer/start`, `/timer/pause`, `/timer/end` | 공부시간 타이머 | 더미 |
| 성장 | GET | `/village/{user_id}` | 숲/마을 성장 상태 | 더미 |
| 업적/보상 | GET | `/achievements/{user_id}`, `/rewards/{user_id}` | 업적/보상 목록 | 더미 |
| 상점 | GET | `/shop/items`, POST | `/shop/purchase` | 상점 아이템 조회/구매 | 더미 |
| 내 방 | GET | `/room/{user_id}`, POST `/room/decorate` | 방 조회/꾸미기 | 더미 |
| 캐릭터 | GET | `/character/{user_id}`, POST `/character/equip` | 캐릭터 조회/장착 | 더미 |
| **AI 도서관** | POST | `/api/materials` | 파일 업로드 (multipart: `file`, `title?`, `user_id?`) → 202 + `material_id` | **실제 동작** |
| **AI 도서관** | GET | `/api/materials/{id}` | `processed_status`가 `ready` 될 때까지 폴링. 요약/핵심개념 포함 | **실제 동작** |
| **AI 도서관** | POST | `/api/materials/{id}/quiz` | 퀴즈 생성 `{num_questions, difficulty}` → 문항(정답 미포함) | **실제 동작** |
| **AI 도서관** | POST | `/api/quizzes/{id}/submit` | 답안 제출 `{answers:[{question_id, answer}]}` → 채점+해설+오답분석 | **실제 동작** |
| **AI 도서관** | POST | `/api/reports` | 학습 리포트 생성 `{study_material_id, quiz_attempt_id?}` | **실제 동작** |
| **AI 도서관** | POST/GET | `/api/tutor/sessions`, `.../messages` | 약점 재학습 튜터 챗 | **실제 동작** |
| AI 도서관(디버그) | GET | `/api/materials/{id}/search?query=` | RAG 검색 미리보기 | **실제 동작** |

`user_id`를 안 보내면 AI 도서관 엔드포인트는 데모 유저를 자동 생성합니다 (인증 연동 전 임시. `db.py`의 `get_or_create_demo_user`).

> `/reports/{user_id}` (능력치 기반 성장 리포트, 더미)와 `/api/reports` (학습자료 요약+오답분석 리포트, 실제 동작)는 이름은 비슷하지만 서로 다른 기능입니다. 라우터 파일도 각각 `growth_reports.py` / `reports.py`로 분리되어 있습니다.

## 구조

```
backend/
├── main.py                # FastAPI 앱 진입점 — 모든 라우터 등록 (register_router 패턴)
├── config.py               # 환경 변수 (.env)
├── db.py                   # asyncpg 커넥션 풀 (AI 도서관 파트에서 사용)
├── schemas.py               # 화면별 MVP API의 Pydantic 모델
├── routers/
│   ├── auth.py, goals.py, quests.py, dashboard.py, village.py, timer.py,
│   │   stats.py, growth_reports.py, rewards.py, achievements.py,
│   │   shop.py, room.py, character.py     # 화면별 MVP API (더미)
│   └── materials.py, quizzes.py, tutor.py, reports.py   # AI 도서관 (실제 동작)
├── services/
│   ├── memory_store.py + *_service.py (auth/quest/dashboard/village/timer/
│   │   stat/reward/achievement/shop/room/character)   # 화면별 MVP 로직 (인메모리)
│   └── upstage.py, chunking.py, rag.py, ingest.py, study_agent.py   # AI 도서관 RAG 파이프라인
└── uploads/                 # 업로드 파일 저장 (git 제외)
```

## 다음 통합 작업

- 화면별 MVP API를 인메모리(`memory_store.py`) → DB(`db/schema.sql`)로 전환
- 퀴즈 완료(`quizzes.submit_quiz`) → 퀘스트 진행도/XP 지급 연동 훅 추가
- 인증 붙이면 AI 도서관 쪽 데모 유저 로직을 실제 user_id로 교체하고, 화면별 API들도 `auth`가 발급한 사용자와 연결

## 참고 (Upstage API)

- Chat: `POST /v1/chat/completions`, `solar-pro2` (JSON Mode 사용 중)
- Embeddings: `solar-embedding-2-passage`(저장) / `-query`(검색), **1024차원**, 배치 최대 100개
- Document Parse: `POST /v1/document-digitization`, `model=document-parse`, 동기 최대 100페이지
- 임베딩 차원을 바꾸면 `db/schema.sql`의 `VECTOR(1024)`도 함께 변경할 것

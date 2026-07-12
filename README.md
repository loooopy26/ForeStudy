# Forestudy

Forestudy는 AI와 게임형 성장 요소를 결합한 학습 지원 웹 애플리케이션입니다. 학습 자료를 바탕으로 퀴즈를 풀고, 오답·학습 기록을 분석하며, 목표와 퀘스트를 통해 꾸준한 학습을 돕습니다.

## 주요 기능

- PDF 학습 자료 업로드, 요약, 핵심 개념 추출 및 RAG 기반 AI 튜터
- AI 퀴즈 생성·채점, 오답 노트 및 복습 세션
- 학습 타이머, 일별 학습 계획, 퀘스트·보상·성장 현황
- 상점·인벤토리, 방 꾸미기, 고양이 아바타 의상 착용과 레벨업 성장 연출
- TMAP 기반 주변 학습 장소 추천과 시험 당일 이동 어시스턴트
- 자연어 요청으로 아이템 이미지를 생성하는 AI 아이템 공방 (로그인 시 실제 계정 도토리 차감)

## 기술 구성

- Frontend: React, Vite
- Backend: FastAPI, SQLAlchemy, asyncpg
- AI: Upstage Solar, LangGraph, pgvector RAG
- Location: TMAP API, Naver Search API(선택)
- Database: PostgreSQL + pgvector

## 실행 방법

### 1. 백엔드 설정

Python 3.11 이상과 PostgreSQL을 준비한 뒤 환경 파일을 만듭니다.

```powershell
cd backend
Copy-Item .env.example .env
```

`.env`에서 필요한 값을 설정합니다.

```env
# AI 자료 분석 및 튜터 기능에 필요
UPSTAGE_API_KEY=up_xxxxxxxxxxxxxxxxxxxxxxxx

# 주변 학습 장소 추천과 시험 당일 어시스턴트에 필요
TMAP_APP_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# PostgreSQL + pgvector
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/forestudy

# 선택: 장소 후기 기반 시설 조건 확인에 사용
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
```

`UPSTAGE_API_KEY`, `TMAP_APP_KEY`, Naver 키는 해당 기능을 사용할 때만 필요합니다. 키가 없어도 서버는 실행되며, 관련 API 호출에서 설정 안내를 반환합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

백엔드 API 문서는 `http://localhost:8000/docs`에서 확인할 수 있습니다.

### 2. 프론트엔드 실행

새 터미널에서 실행합니다.

```powershell
cd frontend
npm install
npm run dev
```

Vite가 출력하는 주소(기본 `http://localhost:5173`)로 접속합니다. API 서버 주소를 바꿔야 할 때는 `frontend/.env`에 아래처럼 설정합니다.

```env
VITE_API_BASE_URL=http://localhost:8000
```

## 위치 기반 기능

`TMAP_APP_KEY`를 설정하면 다음 API와 화면이 활성화됩니다.

- `POST /api/location/nearby-study-places`: 현재 위치와 자연어 요청을 기반으로 학습 장소를 추천합니다.
- `POST /api/location/exam-day-assistant`: 시험장 주소를 좌표로 변환하고, 도보·자동차·대중교통별 이동 시간과 권장 출발 시각을 계산합니다.
- `GET /api/location/health`: TMAP 키 설정 여부를 확인합니다.

Naver Search API 키는 “조용한”, “24시간”, “넓은 좌석” 같은 시설 조건을 장소 후기에서 추가 확인할 때만 사용합니다.

## 디렉터리 구조

```text
Forestudy/
├── backend/       # FastAPI API, AI/RAG, TMAP 및 아이템 생성 서비스
├── frontend/      # React/Vite 사용자 인터페이스
└── db/schema.sql  # PostgreSQL + pgvector 스키마
```

상세 백엔드 API 설명은 [backend/README.md](backend/README.md)에서 확인할 수 있습니다.

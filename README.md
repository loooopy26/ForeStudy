# Forestudy

Forestudy는 PDF 학습 자료와 AI 학습 도구, 게임형 성장 요소를 결합한 학습 지원 웹 애플리케이션입니다. 학습 자료를 바탕으로 문제를 만들고 채점·오답 분석·학습 계획을 지원하며, 시험 당일에는 출발지와 시험장을 기준으로 이동 계획을 안내합니다.

## 주요 기능

- PDF 학습 자료 업로드, 요약, 핵심 개념 추출 및 RAG 기반 AI 튜터
- AI 문제 생성·채점, 오답 노트 및 복습 추천
- 학습 통계, 일별 학습 계획, 시험 준비 현황 관리
- 일간·주간·보너스 퀘스트 게시판과 업적 시스템, 완료 시 도토리·경험치 보상 수령
- 상점·인벤토리·꾸미기 등 학습 보상 기반 성장 요소
- TMAP 기반 주변 학습 장소 추천과 시험 당일 이동 시간 안내
- 장소명 또는 도로명 주소로 출발지와 시험장을 검색하거나, 지도에서 출발지 선택

## 기술 구성

| 영역 | 사용 기술 |
| --- | --- |
| Frontend | React, Vite |
| Backend | FastAPI, SQLAlchemy, asyncpg |
| AI | Upstage Solar, LangGraph, pgvector RAG |
| 위치·경로 | TMAP API, Google Routes API, Naver Search API(선택) |
| Database | PostgreSQL + pgvector |

## 실행 방법

### 1. 백엔드

Python 3.11 이상과 PostgreSQL을 준비한 뒤 환경 변수를 설정합니다.

```powershell
cd backend
Copy-Item .env.example .env
```

`.env`에 사용하는 서비스의 키와 데이터베이스 연결 정보를 입력합니다.

```env
UPSTAGE_API_KEY=up_xxxxxxxxxxxxxxxxxxxxxxxx
TMAP_APP_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_MAPS_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/forestudy

# 선택: 장소 상세 조건 검색에 사용
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
```

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API 문서는 `http://localhost:8000/docs`에서 확인할 수 있습니다.

### 2. 프론트엔드

새 PowerShell 창에서 실행합니다.

```powershell
cd frontend
npm install
npm run dev
```

기본 주소는 `http://localhost:5173`입니다. 백엔드 주소가 다르면 `frontend/.env`에 다음 값을 설정합니다.

```env
VITE_API_BASE_URL=http://localhost:8000
```

## 시험 당일 도우미

시험 당일 도우미는 시험장과 출발지를 입력받아 교통수단별 이동 시간, 권장 출발 시각, 경로 안내를 제공합니다.

1. 시험장명 또는 주소를 검색해 정확한 시험장을 선택합니다. 검색 결과의 좌표를 그대로 사용해 주소 재변환에 따른 위치 오차를 줄입니다.
2. 출발지는 현재 위치, 장소·주소 검색, 지도 클릭 중 하나로 지정할 수 있습니다.
3. TMAP으로 경로 시간과 거리를 계산하고, 설정한 버퍼 시간을 포함해 권장 출발 시각을 안내합니다.

주요 엔드포인트:

- `POST /api/location/search-places`: 장소명·주소 검색
- `POST /api/location/nearby-study-places`: 주변 학습 장소 추천
- `POST /api/location/exam-day-assistant`: 시험 당일 이동 계획 생성
- `GET /api/location/health`: 위치 API 설정 상태 확인
- `POST /api/exam-day/plans`: 시험 당일 계획 저장
- `GET /api/exam-day/plans`, `GET /api/exam-day/plans/{plan_id}`: 저장한 계획 조회
- `POST /api/exam-day/plans/{plan_id}/assistant`: 저장한 계획 기반 안내 실행
- `DELETE /api/exam-day/plans/{plan_id}`: 저장한 계획 삭제

`TMAP_APP_KEY`가 필요하며, `GOOGLE_MAPS_API_KEY`를 설정하면 대중교통 구간은 Google Routes API를 우선 사용합니다. 키가 없거나 외부 API를 사용할 수 없으면 관련 API는 설정 안내 또는 대체 결과를 반환합니다.

## 디렉터리 구조

```text
Forestudy/
├── backend/       # FastAPI API, AI/RAG, TMAP 등 서비스
├── frontend/      # React/Vite 사용자 인터페이스
└── db/schema.sql  # PostgreSQL + pgvector 스키마
```

백엔드 API 상세는 [backend/README.md](backend/README.md)에서 확인할 수 있습니다.

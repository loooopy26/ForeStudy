from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # 선택값으로 둔다: 이 키가 없어도 goals/quests 등 Upstage와 무관한 라우터는
    # 정상 기동해야 하므로, 앱 시작 시점이 아니라 실제 Upstage 호출 시점에 검증한다.
    upstage_api_key: str | None = None
    database_url: str = "postgresql://postgres:postgres@localhost:5432/forestudy"

    # TMAP API (위치 기반 학습장소 추천 / 시험 당일 어시스턴트). 없어도 서버는 기동되고
    # /api/location 호출 시점에만 명확한 에러로 알린다 (routers/location.py, services/tmap.py).
    tmap_app_key: str | None = None
    tmap_base_url: str = "https://apis.openapi.sk.com"

    # Google Routes API is used for public-transit routes when configured.
    # TMAP remains responsible for POI search, walking, and driving routes.
    google_maps_api_key: str | None = None

    # Naver Search API (블로그 검색). 주변 학습장소 추천에서 TMAP이 못 주는 속성(넓다/조용하다 등)
    # 조건을 실제 후기로 확인할 때 쓴다 (routers/location.py, services/naver.py). 없으면 해당
    # 속성 확인 기능만 조용히 건너뛴다.
    naver_client_id: str | None = None
    naver_client_secret: str | None = None

    upstage_base_url: str = "https://api.upstage.ai/v1"
    upstage_chat_model: str = "solar-pro3"
    upstage_embedding_passage_model: str = "solar-embedding-2-passage"
    upstage_embedding_query_model: str = "solar-embedding-2-query"
    upstage_doc_parse_model: str = "document-parse"

    upload_dir: Path = BASE_DIR / "uploads"
    # Upstage Document Parse 사전 검증용. 동기 API는 50MB, 비동기 API는 200MB까지 지원
    # (50MB 초과 시 services/upstage.py에서 자동으로 비동기 API로 전환)
    max_upload_mb: int = 200

    # AI 생성 아이템 이미지(배경 투명화된 PNG) 저장 위치. main.py에서 /generated-items로 정적 서빙한다.
    generated_items_dir: Path = BASE_DIR / "uploads" / "generated_items"

    # AI 질문(튜터 챗)에 첨부한 사진 저장 위치. main.py에서 /tutor-chat-images로 정적 서빙해
    # 채팅창에 썸네일로 보여준다.
    tutor_chat_images_dir: Path = BASE_DIR / "uploads" / "tutor_chat_images"

    # 청킹: 한국어 기준 대략 2~3자 = 1토큰, 임베딩 8k 컨텍스트 내에서 여유 있게
    chunk_max_chars: int = 1600
    chunk_overlap_chars: int = 200
    rag_top_k: int = 6


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)
settings.generated_items_dir.mkdir(parents=True, exist_ok=True)
settings.tutor_chat_images_dir.mkdir(parents=True, exist_ok=True)

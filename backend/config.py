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

    upstage_base_url: str = "https://api.upstage.ai/v1"
    upstage_chat_model: str = "solar-pro3"
    upstage_embedding_passage_model: str = "solar-embedding-2-passage"
    upstage_embedding_query_model: str = "solar-embedding-2-query"
    upstage_doc_parse_model: str = "document-parse"

    upload_dir: Path = BASE_DIR / "uploads"
    # Upstage Document Parse 사전 검증용. 동기 API는 50MB, 비동기 API는 200MB까지 지원
    # (50MB 초과 시 services/upstage.py에서 자동으로 비동기 API로 전환)
    max_upload_mb: int = 200

    # 청킹: 한국어 기준 대략 2~3자 = 1토큰, 임베딩 8k 컨텍스트 내에서 여유 있게
    chunk_max_chars: int = 1600
    chunk_overlap_chars: int = 200
    rag_top_k: int = 6


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)

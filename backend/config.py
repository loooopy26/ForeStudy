from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    upstage_api_key: str
    database_url: str = "postgresql://postgres:postgres@localhost:5432/forestudy"

    upstage_base_url: str = "https://api.upstage.ai/v1"
    upstage_chat_model: str = "solar-pro2"
    upstage_embedding_passage_model: str = "solar-embedding-2-passage"
    upstage_embedding_query_model: str = "solar-embedding-2-query"
    upstage_doc_parse_model: str = "document-parse"

    upload_dir: Path = BASE_DIR / "uploads"

    # 청킹: 한국어 기준 대략 2~3자 = 1토큰, 임베딩 8k 컨텍스트 내에서 여유 있게
    chunk_max_chars: int = 1600
    chunk_overlap_chars: int = 200
    rag_top_k: int = 6


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)

"""SQLite database connection setup.

Screen: shared by backend APIs that need local persistence.
Role: provide SQLAlchemy engine, DB session, and table initialization.
"""

from collections.abc import Generator
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
sqlite_path = Path(os.getenv("SQLITE_DATABASE_PATH", BASE_DIR / "forestudy.db"))
sqlite_path.parent.mkdir(parents=True, exist_ok=True)
SQLALCHEMY_DATABASE_URL = f"sqlite:///{sqlite_path.as_posix()}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

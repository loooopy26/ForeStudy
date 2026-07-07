"""asyncpg 커넥션 풀. 앱 시작 시가 아니라 첫 사용 시점에 연결한다
(DB 없이도 /docs, /health 확인 가능하도록)."""

import asyncpg

from config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def vector_literal(embedding: list[float]) -> str:
    """pgvector 입력용 문자열. 쿼리에서 ::vector 로 캐스팅해 사용한다."""
    return "[" + ",".join(f"{x:.8f}" for x in embedding) + "]"


async def get_or_create_demo_user(conn: asyncpg.Connection) -> str:
    """user_id 없이 호출됐을 때 사용할 데모 유저. 팀원 인증 붙이면 제거 예정."""
    row = await conn.fetchrow(
        """
        INSERT INTO users (email, password_hash, nickname)
        VALUES ('demo@forestudy.local', 'demo', '데모유저')
        ON CONFLICT (email) DO UPDATE SET updated_at = now()
        RETURNING id
        """
    )
    return str(row["id"])

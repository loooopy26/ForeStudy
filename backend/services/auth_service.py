"""회원가입/로그인 처리 서비스.

담당 탭: 로그인, 회원가입.
역할: 유저 계정을 PostgreSQL users 테이블(UUID id)에 저장/조회, 비밀번호 해시, 더미 access_token 발급.
      레벨/도토리(dotori) 값은 users 테이블 컬럼(level, dotori)에서 그대로 읽는다.
      (서버를 재시작해도 가입한 유저가 유지되도록 메모리가 아닌 DB에 저장한다.)
"""

import hashlib
import hmac
import secrets

import asyncpg
from fastapi import HTTPException

from db import get_or_create_demo_user, get_pool

# PBKDF2-HMAC-SHA256: 표준 라이브러리만으로 솔트 + 반복 해싱을 적용한다.
# 저장 형식: "pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>"
_HASH_ALGO = "pbkdf2_sha256"
_ITERATIONS = 200_000

# 조회할 계정 컬럼 (비밀번호 해시는 검증용으로 login 에서만 추가로 가져온다).
_USER_FIELDS = "id, email, nickname, level, current_xp, dotori"


async def register_user(email: str, password: str, nickname: str) -> dict:
    # 회원가입 화면에서 호출합니다. users 테이블에 새 계정을 만듭니다.
    normalized_email = email.lower()
    _validate_email(normalized_email)

    pool = await get_pool()
    try:
        row = await pool.fetchrow(
            f"""
            INSERT INTO users (email, password_hash, nickname)
            VALUES ($1, $2, $3)
            RETURNING {_USER_FIELDS}
            """,
            normalized_email,
            _hash_password(password),
            nickname,
        )
    except asyncpg.UniqueViolationError:
        # email 컬럼 UNIQUE 제약 위반 = 이미 가입된 이메일
        raise HTTPException(status_code=400, detail="Email already registered")

    return {
        "user": _to_user_response(row),
        "access_token": _create_dummy_token(),
        "message": "회원가입이 완료되었습니다.",
    }


async def login_user(email: str, password: str) -> dict:
    # 로그인 화면에서 호출합니다. 이메일로 계정을 찾고 비밀번호 해시를 검증합니다.
    normalized_email = email.lower()
    _validate_email(normalized_email)

    pool = await get_pool()
    row = await pool.fetchrow(
        f"SELECT {_USER_FIELDS}, password_hash FROM users WHERE email = $1",
        normalized_email,
    )
    # 존재 여부와 비밀번호 오류를 같은 메시지로 응답해 계정 존재를 노출하지 않는다.
    if row is None or not _verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "user": _to_user_response(row),
        "access_token": _create_dummy_token(),
        "message": "로그인에 성공했습니다.",
    }


async def get_demo_user() -> dict:
    # 로그인 화면 없이 도토리/레벨 등을 보여줘야 하는 화면(홈)에서 사용.
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await get_or_create_demo_user(conn)
        row = await conn.fetchrow(f"SELECT {_USER_FIELDS} FROM users WHERE id = $1", user_id)
    return _to_user_response(row)


async def get_user(user_id: str) -> dict:
    # 로그인 유지 확인이나 화면 초기 데이터 요청 시 사용할 수 있습니다. user_id 는 UUID 문자열.
    pool = await get_pool()
    try:
        row = await pool.fetchrow(
            f"SELECT {_USER_FIELDS} FROM users WHERE id = $1",
            user_id,
        )
    except (asyncpg.DataError, ValueError):
        # UUID 형식이 아닌 잘못된 id 가 들어온 경우
        raise HTTPException(status_code=404, detail="User not found")
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_user_response(row)


async def spend_dotori(user_id: str, amount: int) -> int:
    """로그인한 실제 유저(UUID)의 users.dotori를 원자적으로 차감하고 남은 잔액을 반환한다.
    AI 아이템 생성처럼 실제 계정 재화를 쓰는 기능에서 사용 — WHERE 절에 잔액 조건을
    같이 걸어 두 요청이 동시에 들어와도(동시성) 잔액이 음수로 내려가지 않는다."""
    pool = await get_pool()
    try:
        row = await pool.fetchrow(
            "UPDATE users SET dotori = dotori - $1 WHERE id = $2 AND dotori >= $1 RETURNING dotori",
            amount,
            user_id,
        )
    except (asyncpg.DataError, ValueError):
        raise HTTPException(status_code=404, detail="User not found")
    if row is None:
        # UPDATE가 0행에 적용됨 = 유저가 없거나 잔액 부족. 어느 쪽인지 구분해 메시지를 정확히 낸다.
        exists = await pool.fetchval("SELECT 1 FROM users WHERE id = $1", user_id)
        if not exists:
            raise HTTPException(status_code=404, detail="User not found")
        raise ValueError("도토리가 부족합니다.")
    return row["dotori"]


async def refund_dotori(user_id: str, amount: int) -> None:
    """spend_dotori로 차감한 뒤 이어지는 작업(예: 이미지 생성)이 실패했을 때 되돌려준다.
    잔액 조건 없이 그냥 더하기만 하면 되므로 spend_dotori보다 단순하다."""
    pool = await get_pool()
    await pool.execute("UPDATE users SET dotori = dotori + $1 WHERE id = $2", amount, user_id)


async def grant_quest_reward(user_id: str, exp: int, dotori: int) -> dict:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT level, current_xp FROM users WHERE id = $1", user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    level, current_xp = int(row["level"]), int(row["current_xp"]) + exp
    while current_xp >= level * 100:
        current_xp -= level * 100
        level += 1
    updated = await pool.fetchrow(
        f"UPDATE users SET level = $1, current_xp = $2, dotori = dotori + $3 WHERE id = $4 RETURNING {_USER_FIELDS}",
        level, current_xp, dotori, user_id,
    )
    return _to_user_response(updated)


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"{_HASH_ALGO}${_ITERATIONS}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$")
        if algo != _HASH_ALGO:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    # 타이밍 공격 방지를 위해 상수 시간 비교
    return hmac.compare_digest(digest.hex(), hash_hex)


def _validate_email(email: str) -> None:
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email format")


def _create_dummy_token() -> str:
    return secrets.token_urlsafe(24)


def _to_user_response(user: asyncpg.Record) -> dict:
    return {
        "id": str(user["id"]),          # UUID → 문자열
        "email": user["email"],
        "nickname": user["nickname"],
        "level": user["level"],
        "current_xp": user["current_xp"],
        "dotori": user["dotori"],  # 도토리(재화) 점수
    }

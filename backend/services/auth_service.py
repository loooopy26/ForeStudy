import hashlib
import secrets

from fastapi import HTTPException

from services import memory_store
from services.memory_store import users, users_by_email
from services.reward_service import get_rewards


def register_user(email: str, password: str, nickname: str) -> dict:
    # MVP 회원가입입니다. DB 연동 전까지 메모리에 사용자 정보를 저장합니다.
    normalized_email = email.lower()
    _validate_email(normalized_email)
    if normalized_email in users_by_email:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = memory_store.next_user_id
    memory_store.next_user_id += 1

    users[user_id] = {
        "id": user_id,
        "email": normalized_email,
        "password_hash": _hash_password(password),
        "nickname": nickname,
    }
    users_by_email[normalized_email] = user_id
    rewards = get_rewards(user_id)

    return {
        "user": _to_user_response(users[user_id], rewards),
        "access_token": _create_dummy_token(),
        "message": "회원가입이 완료되었습니다.",
    }


def login_user(email: str, password: str) -> dict:
    # MVP 로그인입니다. 실제 서비스에서는 JWT와 보안 설정을 더 강화해야 합니다.
    normalized_email = email.lower()
    _validate_email(normalized_email)
    user_id = users_by_email.get(normalized_email)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = users[user_id]
    if user["password_hash"] != _hash_password(password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {
        "user": _to_user_response(user, get_rewards(user_id)),
        "access_token": _create_dummy_token(),
        "message": "로그인에 성공했습니다.",
    }


def get_user(user_id: int) -> dict:
    # 로그인 유지 확인이나 화면 초기 데이터 요청 시 사용할 수 있습니다.
    if user_id not in users:
        raise HTTPException(status_code=404, detail="User not found")
    return _to_user_response(users[user_id], get_rewards(user_id))


def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _validate_email(email: str) -> None:
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email format")


def _create_dummy_token() -> str:
    return secrets.token_urlsafe(24)


def _to_user_response(user: dict, rewards: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "nickname": user["nickname"],
        "level": rewards["level"],
        "token": rewards["token"],
    }

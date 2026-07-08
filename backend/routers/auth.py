"""회원가입/로그인 API 라우터.

담당 탭: 로그인, 회원가입, 사용자 세션 확인.
주요 API: POST /auth/register, POST /auth/login, GET /auth/me/{user_id}, GET /auth/demo
"""

from fastapi import APIRouter

from schemas import AuthResponse, UserLoginRequest, UserRegisterRequest, UserResponse
from services.auth_service import get_demo_user, get_user, login_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(request: UserRegisterRequest):
    # 회원가입 화면에서 호출합니다.
    return await register_user(
        email=request.email,
        password=request.password,
        nickname=request.nickname,
    )


@router.get("/demo", response_model=UserResponse)
async def read_demo_user():
    # 로그인 없이 도토리 등 실제 값을 보여줘야 하는 화면(홈)에서 사용하는 데모 유저.
    return await get_demo_user()


@router.post("/login", response_model=AuthResponse)
async def login(request: UserLoginRequest):
    # 로그인 화면에서 호출합니다.
    return await login_user(email=request.email, password=request.password)


@router.get("/me/{user_id}", response_model=UserResponse)
async def read_me(user_id: str):
    # 현재 사용자 정보를 다시 조회할 때 사용합니다. user_id 는 UUID 문자열입니다.
    return await get_user(user_id=user_id)

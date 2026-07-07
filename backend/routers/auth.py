from fastapi import APIRouter

from schemas import AuthResponse, UserLoginRequest, UserRegisterRequest, UserResponse
from services.auth_service import get_user, login_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(request: UserRegisterRequest):
    # 회원가입 화면에서 호출합니다.
    return register_user(
        email=request.email,
        password=request.password,
        nickname=request.nickname,
    )


@router.post("/login", response_model=AuthResponse)
def login(request: UserLoginRequest):
    # 로그인 화면에서 호출합니다.
    return login_user(email=request.email, password=request.password)


@router.get("/me/{user_id}", response_model=UserResponse)
def read_me(user_id: int):
    # 현재 사용자 정보를 다시 조회할 때 사용합니다.
    return get_user(user_id=user_id)

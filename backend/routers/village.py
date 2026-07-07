"""마을 허브 API 라우터.

담당 탭: 마을 화면, 도서관/퀘스트 게시판/상점/내 방/캐릭터 이동 버튼.
주요 API: GET /village/{user_id}
"""

from fastapi import APIRouter

from schemas import VillageResponse
from services.village_service import get_village

router = APIRouter(prefix="/village", tags=["village"])


@router.get("/{user_id}", response_model=VillageResponse)
def read_village(user_id: int):
    return get_village(user_id=user_id)

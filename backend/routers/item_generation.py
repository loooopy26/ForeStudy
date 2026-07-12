"""AI 아이템 생성 API 라우터.

담당 탭: 상점 / 내 방, 도토리로 자연어 입력을 이미지로 변환해 나만의 아이템 생성.
주요 API: POST /items/generate
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import GenerateItemRequest, GeneratedItemResponse
from services.item_generation_service import generate_custom_item

router = APIRouter(prefix="/items", tags=["item-generation"])


@router.post("/generate", response_model=GeneratedItemResponse)
async def generate_item(request: GenerateItemRequest, db: Session = Depends(get_db)):
    return await generate_custom_item(
        db=db, user_id=request.user_id, prompt=request.prompt, real_user_id=request.real_user_id
    )

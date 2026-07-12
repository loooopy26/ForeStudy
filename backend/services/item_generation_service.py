"""AI 아이템 생성 서비스.

담당 탭: 상점/내 방.
역할: 도토리를 소모해 사용자의 자연어 설명을 배경 투명 PNG 이미지로 변환하고,
DB(generated_items)에 영속화한 뒤 구매 절차 없이 곧바로 인벤토리에 등록합니다
(내 방에 바로 배치 가능, 서버를 재시작해도 아이템이 유지됩니다).
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from services import auth_service
from services.generated_item_repository import create_generated_item, save_image_file, to_item_dict
from services.image_service import generate_item_image
from services.memory_store import user_inventories, user_rewards
from services.reward_service import spend_token

CUSTOM_ITEM_COST_TOKEN = 15


async def generate_custom_item(db: Session, user_id: int, prompt: str, real_user_id: str | None = None) -> dict:
    # real_user_id(로그인한 유저)가 있으면 화면에 보이는 진짜 도토리(PostgreSQL users.dotori)를
    # 차감한다. 없으면(로그인 없는 MVP 데모 화면) 기존처럼 SQLite 쪽 더미 토큰(user_rewards)을 쓴다.
    # 인벤토리(user_inventories)/생성 이미지 레코드(GeneratedItem)는 다른 더미 화면(내 방/캐릭터)도
    # 같이 참조하는 int user_id 기준으로 그대로 남겨둔다 — 실제 로그인 연동은 재화 차감에만 우선 적용.
    if real_user_id:
        try:
            remaining = await auth_service.spend_dotori(real_user_id, CUSTOM_ITEM_COST_TOKEN)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        try:
            remaining = spend_token(user_id, CUSTOM_ITEM_COST_TOKEN)["token"]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        image_prompt, image_bytes = await generate_item_image(prompt)
        image_url = save_image_file(image_bytes)
    except Exception as exc:
        # 생성 실패 시 도토리 환불
        if real_user_id:
            await auth_service.refund_dotori(real_user_id, CUSTOM_ITEM_COST_TOKEN)
        else:
            user_rewards[user_id]["token"] += CUSTOM_ITEM_COST_TOKEN
        raise HTTPException(status_code=502, detail=f"이미지 생성에 실패했습니다: {exc}") from exc

    db_item = create_generated_item(
        db,
        user_id=user_id,
        name=prompt[:20],
        prompt=image_prompt,
        image_url=image_url,
        price_token=CUSTOM_ITEM_COST_TOKEN,
    )
    item = to_item_dict(db_item)
    user_inventories.setdefault(user_id, set()).add(item["item_id"])

    return {
        "user_id": user_id,
        "item": item,
        "remaining_token": remaining,
        "message": f"'{item['name']}' 아이템을 생성했습니다.",
    }

"""AI 생성 아이템 저장소.

담당 탭: 상점/내 방.
역할: 배경 투명화된 아이템 이미지를 디스크에 저장하고, generated_items 테이블에
영속화한다. 서버를 재시작해도 생성한 아이템이 사라지지 않도록 하기 위함.
"""

import uuid

from sqlalchemy.orm import Session

from config import settings
from models import GeneratedItem

# shop_items(memory_store.py)의 고정 id(1, 2, 3)와 겹치지 않도록 오프셋을 둔다.
_ITEM_ID_OFFSET = 1000


def save_image_file(image_bytes: bytes) -> str:
    """PNG를 디스크에 저장하고, 프론트에서 바로 쓸 수 있는 정적 서빙 URL 경로를 반환한다."""
    filename = f"{uuid.uuid4().hex}.png"
    (settings.generated_items_dir / filename).write_bytes(image_bytes)
    return f"/generated-items/{filename}"


def create_generated_item(
    db: Session, *, user_id: int, name: str, prompt: str, image_url: str, price_token: int
) -> GeneratedItem:
    item = GeneratedItem(
        user_id=user_id,
        name=name,
        prompt=prompt,
        image_url=image_url,
        price_token=price_token,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def get_generated_item(db: Session, *, user_id: int, item_id: int) -> GeneratedItem | None:
    db_id = item_id - _ITEM_ID_OFFSET
    if db_id <= 0:
        return None
    item = db.get(GeneratedItem, db_id)
    if item is None or item.user_id != user_id:
        return None
    return item


def to_item_dict(item: GeneratedItem) -> dict:
    return {
        "item_id": _ITEM_ID_OFFSET + item.id,
        "name": item.name,
        "item_type": "custom",
        "price_token": item.price_token,
        "theme_required": None,
        "image_url": item.image_url,
    }

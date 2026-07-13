"""SQLite table models.

Screen: 상점 / 내 방 — AI로 생성한 커스텀 아이템만 SQLite에 영속화한다.
Role: 이전에는 로그인 계정과 무관한 데모 유저/목표/퀴즈/타이머 모델도 여기 있었지만,
그 화면들은 전부 실제 사용되지 않는 더미 라우터였어서 제거했다 (main.py 참고).
GeneratedItem만 실제로 쓰인다 — services/generated_item_repository.py 참고.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class GeneratedItem(Base):
    """AI로 생성한 상점/방 꾸미기 아이템. 서버 재시작 후에도 유지되도록 DB에 저장한다."""

    __tablename__ = "generated_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)  # Solar가 만든 최종 이미지 생성 프롬프트
    image_url: Mapped[str] = mapped_column(String(255), nullable=False)  # /generated-items/{file}.png
    price_token: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

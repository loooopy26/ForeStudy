"""AI 아이템 생성이 쓰는 공용 메모리 상태.

담당 탭: 상점 / 내 방 (AI 커스텀 아이템 생성 경로).
역할: 로그인 없이도 동작하는 데모 경로(item_generation_service.py의 real_user_id 없는
분기)에서 쓰는 더미 토큰/인벤토리. 서버를 재시작하면 초기화된다.
주의: 예전에는 여기에 화면별 더미 라우터(퀘스트/상점/캐릭터/방/업적 등)가 쓰던 상태도
같이 있었지만, 그 라우터들이 전부 미사용 코드라 제거되면서 이 두 값만 남았다.
"""

from typing import Any

user_rewards: dict[int, dict[str, Any]] = {}
user_inventories: dict[int, set[int]] = {}

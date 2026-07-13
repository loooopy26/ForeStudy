"""상점/내 방/캐릭터 꾸미기 서비스.

담당 탭: 상점, 내 방, 캐릭터.
로그인 계정(UUID) 기준으로 보유 아이템/AI 커스텀 아이템/장착 상태/방 배치를 저장한다
(예전에는 frontend/src/goods.js가 이 전부를 localStorage에만 저장해 기기가 바뀌면 사라졌다).
"""

import asyncio
import json
import uuid

from fastapi import HTTPException

from db import get_pool
from services.auth_service import spend_dotori

_EQUIP_SLOTS = ("outfit", "hat", "pants", "bag", "accessory")

_DEFAULT_ROOM = {"wallpaper": None, "floor": None, "placed": []}


def _validate_user_id(user_id: str) -> None:
    """잘못된 형식의 user_id로 쿼리를 날리면 asyncpg.DataError가 그대로 500으로 새어나간다
    — 다른 라우터들처럼 미리 검증해 깔끔한 404로 바꾼다."""
    try:
        uuid.UUID(str(user_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="User not found") from exc


async def get_goods_state(user_id: str) -> dict:
    _validate_user_id(user_id)
    pool = await get_pool()
    # 서로 독립적인 조회라 동시에 실행한다 — 하나의 화면/구매/장착 응답마다 4번 순차 왕복하는
    # 대신 1번의 왕복 시간만큼만 걸리게 한다.
    owned_rows, custom_rows, equipped_rows, room_row = await asyncio.gather(
        pool.fetch("SELECT item_id FROM user_owned_items WHERE user_id = $1", user_id),
        pool.fetch("SELECT data FROM user_custom_items WHERE user_id = $1 ORDER BY created_at", user_id),
        pool.fetch("SELECT slot, item_id FROM user_equipped_items WHERE user_id = $1", user_id),
        pool.fetchrow("SELECT wallpaper, floor, placed FROM user_rooms WHERE user_id = $1", user_id),
    )

    equipped = {slot: None for slot in _EQUIP_SLOTS}
    for row in equipped_rows:
        equipped[row["slot"]] = row["item_id"]

    if room_row is None:
        room = dict(_DEFAULT_ROOM)
    else:
        placed = room_row["placed"]
        room = {
            "wallpaper": room_row["wallpaper"],
            "floor": room_row["floor"],
            "placed": json.loads(placed) if isinstance(placed, str) else (placed or []),
        }

    return {
        "owned": [row["item_id"] for row in owned_rows],
        "customItems": [json.loads(row["data"]) if isinstance(row["data"], str) else row["data"] for row in custom_rows],
        "equipped": equipped,
        "room": room,
    }


async def buy_item(user_id: str, item_id: str, price: int) -> dict:
    _validate_user_id(user_id)
    if price < 0:
        raise HTTPException(status_code=400, detail="유효하지 않은 가격입니다")
    pool = await get_pool()
    # 소유권 행을 먼저 원자적으로 선점한다(INSERT ... ON CONFLICT DO NOTHING) — "이미 보유했는지
    # 확인 후 결제"를 두 단계로 나누면 같은 아이템에 대한 동시 구매 요청이 둘 다 확인 단계를
    # 통과해 도토리가 두 번 빠져나갈 수 있다. 이 행을 실제로 넣은 요청만 결제를 진행한다.
    inserted = await pool.fetchval(
        "INSERT INTO user_owned_items (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1",
        user_id,
        item_id,
    )
    if not inserted:
        dotori = await pool.fetchval("SELECT dotori FROM users WHERE id = $1", user_id)
        return {"owned": True, "dotori": dotori}

    try:
        remaining = await spend_dotori(user_id, price)
    except ValueError as exc:
        # 결제가 실패하면 방금 선점한 소유권도 되돌린다.
        await pool.execute(
            "DELETE FROM user_owned_items WHERE user_id = $1 AND item_id = $2", user_id, item_id
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"owned": True, "dotori": remaining}


async def add_custom_item(user_id: str, item: dict) -> dict:
    _validate_user_id(user_id)
    item_id = item.get("id")
    if not item_id:
        raise HTTPException(status_code=400, detail="item.id가 필요합니다")
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO user_custom_items (user_id, item_id, data)
                VALUES ($1, $2, $3::jsonb)
                ON CONFLICT (user_id, item_id) DO UPDATE SET data = EXCLUDED.data
                """,
                user_id,
                item_id,
                json.dumps(item, ensure_ascii=False),
            )
            await conn.execute(
                "INSERT INTO user_owned_items (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                user_id,
                item_id,
            )
    return await get_goods_state(user_id)


async def remove_custom_item(user_id: str, item_id: str) -> dict:
    _validate_user_id(user_id)
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM user_custom_items WHERE user_id = $1 AND item_id = $2", user_id, item_id
            )
            await conn.execute(
                "DELETE FROM user_owned_items WHERE user_id = $1 AND item_id = $2", user_id, item_id
            )
            await conn.execute(
                "DELETE FROM user_equipped_items WHERE user_id = $1 AND item_id = $2", user_id, item_id
            )
            room = await conn.fetchrow("SELECT wallpaper, floor, placed FROM user_rooms WHERE user_id = $1", user_id)
            if room is not None:
                placed = room["placed"]
                placed = json.loads(placed) if isinstance(placed, str) else (placed or [])
                next_placed = [p for p in placed if p.get("id") != item_id]
                await conn.execute(
                    """
                    UPDATE user_rooms
                    SET wallpaper = CASE WHEN wallpaper = $2 THEN NULL ELSE wallpaper END,
                        floor = CASE WHEN floor = $2 THEN NULL ELSE floor END,
                        placed = $3::jsonb,
                        updated_at = now()
                    WHERE user_id = $1
                    """,
                    user_id,
                    item_id,
                    json.dumps(next_placed, ensure_ascii=False),
                )
    return await get_goods_state(user_id)


async def set_equipped(user_id: str, slot: str, item_id: str | None) -> dict:
    _validate_user_id(user_id)
    if slot not in _EQUIP_SLOTS:
        raise HTTPException(status_code=400, detail=f"알 수 없는 슬롯입니다: {slot}")
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO user_equipped_items (user_id, slot, item_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id
        """,
        user_id,
        slot,
        item_id,
    )
    return await get_goods_state(user_id)


async def save_room(user_id: str, wallpaper: str | None, floor: str | None, placed: list[dict]) -> dict:
    _validate_user_id(user_id)
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO user_rooms (user_id, wallpaper, floor, placed, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, now())
        ON CONFLICT (user_id) DO UPDATE
            SET wallpaper = EXCLUDED.wallpaper, floor = EXCLUDED.floor,
                placed = EXCLUDED.placed, updated_at = now()
        """,
        user_id,
        wallpaper,
        floor,
        json.dumps(placed, ensure_ascii=False),
    )
    return await get_goods_state(user_id)

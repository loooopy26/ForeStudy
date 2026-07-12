"""상점/내 방/캐릭터 꾸미기 서비스.

담당 탭: 상점, 내 방, 캐릭터.
로그인 계정(UUID) 기준으로 보유 아이템/AI 커스텀 아이템/장착 상태/방 배치를 저장한다
(예전에는 frontend/src/goods.js가 이 전부를 localStorage에만 저장해 기기가 바뀌면 사라졌다).
"""

import json

import asyncpg
from fastapi import HTTPException

from db import get_pool
from services.auth_service import spend_dotori

_EQUIP_SLOTS = ("outfit", "hat", "pants", "bag", "accessory")

_DEFAULT_ROOM = {"wallpaper": None, "floor": None, "placed": []}


async def get_goods_state(user_id: str) -> dict:
    pool = await get_pool()
    owned_rows = await pool.fetch("SELECT item_id FROM user_owned_items WHERE user_id = $1", user_id)
    custom_rows = await pool.fetch("SELECT data FROM user_custom_items WHERE user_id = $1 ORDER BY created_at", user_id)
    equipped_rows = await pool.fetch("SELECT slot, item_id FROM user_equipped_items WHERE user_id = $1", user_id)
    room_row = await pool.fetchrow("SELECT wallpaper, floor, placed FROM user_rooms WHERE user_id = $1", user_id)

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
    if price < 0:
        raise HTTPException(status_code=400, detail="유효하지 않은 가격입니다")
    pool = await get_pool()
    already_owned = await pool.fetchval(
        "SELECT 1 FROM user_owned_items WHERE user_id = $1 AND item_id = $2", user_id, item_id
    )
    if already_owned:
        dotori = await pool.fetchval("SELECT dotori FROM users WHERE id = $1", user_id)
        return {"owned": True, "dotori": dotori}

    try:
        remaining = await spend_dotori(user_id, price)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await pool.execute(
        "INSERT INTO user_owned_items (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        user_id,
        item_id,
    )
    return {"owned": True, "dotori": remaining}


async def add_custom_item(user_id: str, item: dict) -> dict:
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
    pool = await get_pool()
    try:
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
    except (asyncpg.DataError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="User not found") from exc
    return await get_goods_state(user_id)

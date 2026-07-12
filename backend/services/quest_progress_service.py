"""퀘스트 게시판 진행률/보상 수령 서비스.

담당 탭: 퀘스트 게시판, 업적.
로그인 계정(UUID) 기준으로 일/주간 퀘스트 진행률 계산용 이벤트와 보상 중복 수령 방지
기록을 저장한다 (예전에는 ForestGame.jsx가 이 전부를 localStorage에만 저장했다).
"""

from datetime import date

from fastapi import HTTPException

from db import get_pool
from services.auth_service import grant_quest_reward


async def record_event(user_id: str, event_type: str, amount: float, event_date: str) -> None:
    # 날짜는 반드시 프론트(브라우저 로컬 시간) 기준으로 받는다 — 서버의 CURRENT_DATE(보통 UTC)를
    # 쓰면 자정 근처에 프론트/백엔드가 서로 다른 날짜로 기록해 진행률이 어긋난다.
    if amount <= 0:
        return
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO quest_events (user_id, event_type, event_date, amount)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, event_type, event_date)
        DO UPDATE SET amount = quest_events.amount + EXCLUDED.amount
        """,
        user_id,
        event_type,
        date.fromisoformat(event_date),
        amount,
    )


async def get_events(user_id: str, days: int) -> dict:
    """day-key(YYYY-MM-DD) -> {event_type: amount} 맵. 프론트의 기존 순수 계산 함수들이
    localStorage 대신 이 맵을 그대로 소비하도록 모양을 맞췄다. 자정 근처 하루 정도의
    오차는(서버 타임존 기준 윈도만 조회) 어차피 넉넉한 days 창으로 흡수된다."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT event_date, event_type, amount FROM quest_events
        WHERE user_id = $1 AND event_date >= CURRENT_DATE - $2::int
        """,
        user_id,
        days + 1,
    )
    result: dict[str, dict[str, float]] = {}
    for row in rows:
        day_key = row["event_date"].isoformat()
        result.setdefault(day_key, {})[row["event_type"]] = float(row["amount"])
    return result


async def claim_reward(user_id: str, reward_id: str, period_key: str, exp: int, dotori: int) -> dict:
    pool = await get_pool()
    inserted = await pool.fetchval(
        """
        INSERT INTO claimed_rewards (user_id, reward_id, period_key)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        RETURNING 1
        """,
        user_id,
        reward_id,
        period_key,
    )
    if not inserted:
        raise HTTPException(status_code=409, detail="이미 보상을 받은 항목입니다")
    return await grant_quest_reward(user_id, exp, dotori)


async def get_claimed(user_id: str, period_keys: list[str]) -> list[str]:
    """이 계정이 주어진 period_key들 안에서 이미 수령한 reward_id 목록."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT reward_id FROM claimed_rewards WHERE user_id = $1 AND period_key = ANY($2::text[])",
        user_id,
        period_keys,
    )
    return [row["reward_id"] for row in rows]

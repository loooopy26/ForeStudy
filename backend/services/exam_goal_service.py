"""자격증 시험 목표 저장/조회 서비스."""

from datetime import date

import asyncpg


def _weeks_until(target_exam_date: date | None) -> int:
    if target_exam_date is None:
        return 4
    remaining_days = max((target_exam_date - date.today()).days, 1)
    return max(1, (remaining_days + 6) // 7)


async def get_exam_goal(
    pool: asyncpg.Pool,
    *,
    user_id: str,
    certification_name: str,
) -> dict:
    row = await pool.fetchrow(
        """
        SELECT g.id AS goal_id, c.name AS certification_name, g.target_exam_date,
               g.prep_duration_weeks, g.current_level, g.status
        FROM user_cert_goals g
        JOIN certifications c ON c.id = g.certification_id
        WHERE g.user_id = $1 AND lower(c.name) = lower($2) AND g.status = 'active'
        ORDER BY g.created_at DESC
        LIMIT 1
        """,
        user_id,
        certification_name.strip(),
    )
    if row is None:
        return {"found": False, "certification_name": certification_name.strip()}
    result = dict(row)
    result["found"] = True
    if result["target_exam_date"]:
        result["target_exam_date"] = result["target_exam_date"].isoformat()
    return result


async def save_exam_goal(
    pool: asyncpg.Pool,
    *,
    user_id: str,
    certification_name: str,
    target_exam_date: date,
    current_level: str | None = None,
) -> dict:
    normalized_name = certification_name.strip()
    if not normalized_name:
        raise ValueError("certification_name is required")

    async with pool.acquire() as conn:
        async with conn.transaction():
            certification = await conn.fetchrow(
                """
                INSERT INTO certifications (name)
                VALUES ($1)
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id, name
                """,
                normalized_name,
            )
            current_level = current_level or "beginner"
            prep_duration_weeks = _weeks_until(target_exam_date)
            existing = await conn.fetchrow(
                """
                SELECT id FROM user_cert_goals
                WHERE user_id = $1 AND certification_id = $2 AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                user_id,
                certification["id"],
            )
            if existing:
                goal = await conn.fetchrow(
                    """
                    UPDATE user_cert_goals
                    SET target_exam_date = $1,
                        prep_duration_weeks = $2,
                        current_level = $3
                    WHERE id = $4
                    RETURNING id, target_exam_date, prep_duration_weeks, current_level, status
                    """,
                    target_exam_date,
                    prep_duration_weeks,
                    current_level,
                    existing["id"],
                )
            else:
                goal = await conn.fetchrow(
                    """
                    INSERT INTO user_cert_goals (
                        user_id, certification_id, target_exam_date,
                        prep_duration_weeks, current_level, status
                    )
                    VALUES ($1, $2, $3, $4, $5, 'active')
                    RETURNING id, target_exam_date, prep_duration_weeks, current_level, status
                    """,
                    user_id,
                    certification["id"],
                    target_exam_date,
                    prep_duration_weeks,
                    current_level,
                )

    return {
        "found": True,
        "goal_id": str(goal["id"]),
        "certification_name": certification["name"],
        "target_exam_date": goal["target_exam_date"].isoformat(),
        "prep_duration_weeks": goal["prep_duration_weeks"],
        "current_level": goal["current_level"],
        "status": goal["status"],
    }

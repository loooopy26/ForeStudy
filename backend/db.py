"""asyncpg 커넥션 풀. 앱 시작 시가 아니라 첫 사용 시점에 연결한다
(DB 없이도 /docs, /health 확인 가능하도록)."""

import asyncpg

from config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10)
        await _run_startup_migrations(_pool)
    return _pool


async def _run_startup_migrations(pool: asyncpg.Pool) -> None:
    """스키마가 옛 컬럼명 등을 아직 쓰고 있으면 앱 기동 시 자동으로 맞춰준다.
    (팀원이 git pull 후 로컬 DB에 수동 ALTER를 매번 실행할 필요가 없도록)"""
    await pool.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'acorn_balance'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'dotori'
            ) THEN
                ALTER TABLE users RENAME COLUMN acorn_balance TO dotori;
            END IF;
        END $$;
        """
    )
    await pool.execute(
        "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS processing_error text"
    )
    await pool.execute(
        "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS processing_stage text"
    )
    await pool.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_certifications_name ON certifications (name)"
    )
    await pool.execute(
        """
        ALTER TABLE curriculum_days ADD COLUMN IF NOT EXISTS tasks JSONB;
        ALTER TABLE curriculum_days ADD COLUMN IF NOT EXISTS checkpoint TEXT;
        ALTER TABLE curriculum_days ADD COLUMN IF NOT EXISTS summary TEXT;
        ALTER TABLE curriculum_days ADD COLUMN IF NOT EXISTS study_tip TEXT;
        ALTER TABLE curriculum_days
            ADD COLUMN IF NOT EXISTS edited_by TEXT NOT NULL DEFAULT 'ai'
                CHECK (edited_by IN ('ai','user'));
        ALTER TABLE curricula ADD COLUMN IF NOT EXISTS source_quiz_attempt_id UUID;
        ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS curriculum_day_id UUID
            REFERENCES curriculum_days(id) ON DELETE SET NULL;
        """
    )
    # quiz_type이 db/schema.sql에 추가되기 전에 만들어진 로컬 DB에는 컬럼이 없어
    # 배치고사 생성(POST /api/materials/{id}/quiz)이 UndefinedColumnError로 실패한다.
    await pool.execute(
        """
        ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS quiz_type TEXT
            NOT NULL DEFAULT 'study_review' CHECK (quiz_type IN ('placement', 'study_review'))
        """
    )
    # 튜터 세션을 "그 날의 학습 주제"로 묶어서 다시 볼 수 있게 하기 위한 컬럼.
    await pool.execute(
        """
        ALTER TABLE tutor_chat_sessions ADD COLUMN IF NOT EXISTS curriculum_day_id UUID
            REFERENCES curriculum_days(id) ON DELETE SET NULL
        """
    )
    # AI 질문에 사진을 첨부해 물어볼 수 있게 하기 위한 컬럼 (사용자 메시지에만 값이 있음).
    await pool.execute(
        "ALTER TABLE tutor_chat_messages ADD COLUMN IF NOT EXISTS image_url TEXT"
    )
    # 시험 당일 AI 어시스턴트: 시험 계획과 마지막 안내 결과를 저장한다 (routers/exam_day.py).
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS exam_day_plans (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            certification_name    TEXT NOT NULL,
            exam_site_name        TEXT NOT NULL,
            exam_site_address     TEXT NOT NULL,
            exam_date             DATE NOT NULL,
            exam_start_time       TEXT NOT NULL,
            origin_latitude       DOUBLE PRECISION NOT NULL,
            origin_longitude      DOUBLE PRECISION NOT NULL,
            buffer_minutes        INT NOT NULL DEFAULT 30 CHECK (buffer_minutes BETWEEN 0 AND 180),
            last_assistant_result JSONB,
            last_assistant_at     TIMESTAMPTZ,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_exam_day_plans_user ON exam_day_plans(user_id, exam_date);
        """
    )
    # 도서관 공부 타이머/상태창: 기존 SQLite 데모 유저 기반 스텁을 걷어내고 로그인 계정
    # UUID로 Postgres study_sessions에 저장하기 위한 컬럼들 (services/timer_service.py, stat_service.py).
    await pool.execute(
        """
        ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS study_material_id UUID
            REFERENCES study_materials(id) ON DELETE SET NULL;
        ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS studied_minutes INT NOT NULL DEFAULT 0;
        ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS max_uninterrupted_minutes INT NOT NULL DEFAULT 0;
        ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS reward_dotori INT NOT NULL DEFAULT 0;
        ALTER TABLE study_session_interruptions ADD COLUMN IF NOT EXISTS segment_minutes INT NOT NULL DEFAULT 0;
        """
    )
    # 프론트가 실제로 보내는 pause 사유('leave_library')가 기존 CHECK 제약에는 없어 그대로 두면
    # INSERT가 위반으로 실패한다 — 제약을 프론트 값에 맞게 갱신한다.
    await pool.execute(
        """
        ALTER TABLE study_session_interruptions DROP CONSTRAINT IF EXISTS study_session_interruptions_reason_check;
        ALTER TABLE study_session_interruptions ADD CONSTRAINT study_session_interruptions_reason_check
            CHECK (reason IN ('tab_hidden','left_site','manual_pause','leave_library'));
        """
    )
    # 상점/내 방/캐릭터 꾸미기: 기존 shop_items/user_inventory/rooms/character_equipment는
    # 팀원 스텁이 참조하던 미사용 테이블이라, AI 커스텀 아이템까지 다루는 실제 goods API
    # (services/goods_service.py)가 쓰는 더 단순한 전용 테이블을 별도로 둔다.
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS user_owned_items (
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            item_id     TEXT NOT NULL,
            acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, item_id)
        );
        CREATE TABLE IF NOT EXISTS user_custom_items (
            user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            item_id    TEXT NOT NULL,
            data       JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, item_id)
        );
        CREATE TABLE IF NOT EXISTS user_equipped_items (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            slot    TEXT NOT NULL CHECK (slot IN ('outfit','hat','pants','bag','accessory')),
            item_id TEXT,
            PRIMARY KEY (user_id, slot)
        );
        CREATE TABLE IF NOT EXISTS user_rooms (
            user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            wallpaper  TEXT,
            floor      TEXT,
            placed     JSONB NOT NULL DEFAULT '[]',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )
    # 퀘스트 게시판: 일별/주별 퀘스트 진행률 계산용 이벤트 로그 + 중복 보상 방지용 수령 기록.
    # (예전에는 ForestGame.jsx가 이 전부를 localStorage에만 저장해 기기가 바뀌면 진행률이
    # 초기화되고, 같은 보상을 다른 기기에서 다시 받을 수 있었다.)
    await pool.execute(
        """
        CREATE TABLE IF NOT EXISTS quest_events (
            user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            event_date DATE NOT NULL,
            amount     NUMERIC NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, event_type, event_date)
        );
        CREATE TABLE IF NOT EXISTS claimed_rewards (
            user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reward_id  TEXT NOT NULL,
            period_key TEXT NOT NULL,
            claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, reward_id, period_key)
        );
        """
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def vector_literal(embedding: list[float]) -> str:
    """pgvector 입력용 문자열. 쿼리에서 ::vector 로 캐스팅해 사용한다."""
    return "[" + ",".join(f"{x:.8f}" for x in embedding) + "]"


async def get_or_create_demo_user(conn: asyncpg.Connection) -> str:
    """user_id 없이 호출됐을 때 사용할 데모 유저. 팀원 인증 붙이면 제거 예정."""
    row = await conn.fetchrow(
        """
        INSERT INTO users (email, password_hash, nickname)
        VALUES ('demo@forestudy.local', 'demo', '데모유저')
        ON CONFLICT (email) DO UPDATE SET updated_at = now()
        RETURNING id
        """
    )
    return str(row["id"])

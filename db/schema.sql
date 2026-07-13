-- Forestudy - PostgreSQL schema
-- MVP 4대 기능: AI 도서관(RAG+Study Agent), AI 퀘스트 게시판(Planner Agent),
-- AI 상태창(Status Agent+Evaluator), 성장 시스템(Growth Agent: EXP/도토리/업적/레벨 -> 캐릭터·방·숲 성장/상점/테마해금)
-- + 확장: 팀 스터디 파티 모드, 미래의 나 리포트, 알림, 자격증/스케줄, 튜터 챗봇

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector: RAG 임베딩 검색용

-- =====================================================================
-- 1. USERS & ACTIVITY (학습 지속성 = 연속 접속일)
-- =====================================================================

CREATE TABLE users (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT UNIQUE NOT NULL,
    password_hash        TEXT NOT NULL,
    nickname             TEXT NOT NULL,
    avatar_url           TEXT,
    level                INT NOT NULL DEFAULT 1,
    current_xp           INT NOT NULL DEFAULT 0,
    dotori               INT NOT NULL DEFAULT 0,   -- 도토리(재화) 점수
    current_streak_days  INT NOT NULL DEFAULT 0,
    longest_streak_days  INT NOT NULL DEFAULT 0,
    last_active_date     DATE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 하루 1건씩 기록, 연속 접속일(streak) 계산의 근거 데이터
CREATE TABLE user_activity_days (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    PRIMARY KEY (user_id, activity_date)
);

-- =====================================================================
-- 2. AI 상태창 (스탯) & 특성/타이틀
-- =====================================================================

-- 입력: 공부시간, 퀴즈점수, 연속학습일, 퀘스트완료율 (Status Agent + Evaluator)
CREATE TABLE user_stats (
    user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    focus             INT NOT NULL DEFAULT 0 CHECK (focus BETWEEN 0 AND 100),          -- 집중력
    comprehension     INT NOT NULL DEFAULT 0 CHECK (comprehension BETWEEN 0 AND 100),  -- 이해도
    persistence       INT NOT NULL DEFAULT 0 CHECK (persistence BETWEEN 0 AND 100),    -- 학습 지속성
    growth_score      INT NOT NULL DEFAULT 0 CHECK (growth_score BETWEEN 0 AND 100),   -- 성장도
    pass_rate         NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (pass_rate BETWEEN 0 AND 100), -- 합격 가능성
    ai_feedback       TEXT,                                                            -- AI 피드백
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 성장 그래프용 일별 스냅샷
CREATE TABLE user_stat_snapshots (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot_date     DATE NOT NULL,
    focus             INT NOT NULL,
    comprehension     INT NOT NULL,
    persistence       INT NOT NULL,
    growth_score      INT NOT NULL,
    pass_rate         NUMERIC(5,2) NOT NULL,
    ai_feedback       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, snapshot_date)
);

-- 상태창 지표(스탯)의 표시용 라벨 정의. 프론트가 이름을 하드코딩하지 않고 여기서 읽는다.
-- code 는 user_stats 의 컬럼명과 동일하게 맞춘다 (focus / persistence / pass_rate ...).
CREATE TABLE stat_definitions (
    code          TEXT PRIMARY KEY,              -- user_stats 컬럼명 (focus, persistence, pass_rate)
    label         TEXT NOT NULL,                 -- 화면 표시 이름 (집중력, 학습 지속성, 합격률)
    description   TEXT,                           -- 지표 설명
    unit          TEXT,                           -- 값 단위 (점, % 등)
    display_order INT NOT NULL DEFAULT 0          -- 상태창에서의 표시 순서
);

INSERT INTO stat_definitions (code, label, description, unit, display_order) VALUES
    ('focus',       '집중력',      '누적 공부 시간 기반 집중 지표', '점', 1),
    ('persistence', '학습 지속성', '연속 학습일(streak) 기반 지표', '점', 2),
    ('pass_rate',   '합격률',      '최근 퀴즈 평균 기반 합격 가능성', '%', 3);

-- 꾸준한 성장가 / 새벽형 집중러 / 벼락치기 마스터 / 팀 기여자 등
CREATE TABLE trait_definitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    condition_type  TEXT NOT NULL,
    condition_value NUMERIC
);

CREATE TABLE user_traits (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trait_id    UUID NOT NULL REFERENCES trait_definitions(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, trait_id)
);

-- =====================================================================
-- 3. 자격증 & 학습 목표
-- =====================================================================

CREATE TABLE certifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    category     TEXT,
    issuing_body TEXT,
    description  TEXT,
    exam_scope   JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_certifications_name ON certifications (name);

CREATE TABLE cert_exam_schedules (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certification_id   UUID NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
    round_name         TEXT NOT NULL,
    application_start  DATE,
    application_end    DATE,
    exam_date          DATE,
    result_date        DATE
);

CREATE TABLE user_cert_goals (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    certification_id      UUID NOT NULL REFERENCES certifications(id),
    cert_exam_schedule_id UUID REFERENCES cert_exam_schedules(id),
    current_level         TEXT NOT NULL DEFAULT 'beginner' CHECK (current_level IN ('beginner','intermediate','advanced')),
    prep_duration_weeks   INT NOT NULL,
    target_exam_date      DATE,
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 4. AI 커리큘럼 (주차별/일별 학습 계획)
-- =====================================================================

CREATE TABLE curricula (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_cert_goal_id        UUID NOT NULL REFERENCES user_cert_goals(id) ON DELETE CASCADE,
    version                  INT NOT NULL DEFAULT 1,
    generated_by             TEXT NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','user')),
    status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
    source_quiz_attempt_id   UUID,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE curriculum_weeks (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curriculum_id  UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
    week_number    INT NOT NULL,
    theme          TEXT,
    planned_hours  NUMERIC(5,2),
    UNIQUE (curriculum_id, week_number)
);

CREATE TABLE curriculum_days (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curriculum_week_id   UUID NOT NULL REFERENCES curriculum_weeks(id) ON DELETE CASCADE,
    day_date             DATE NOT NULL,
    focus_topic          TEXT,
    planned_minutes      INT,
    tasks                JSONB,
    checkpoint           TEXT,
    summary              TEXT,
    study_tip            TEXT,
    edited_by            TEXT NOT NULL DEFAULT 'ai' CHECK (edited_by IN ('ai','user')),
    progress_status      TEXT NOT NULL DEFAULT 'not_started' CHECK (progress_status IN ('not_started','in_progress','completed')),
    UNIQUE (curriculum_week_id, day_date)
);

-- =====================================================================
-- 5. 퀘스트 게시판
-- =====================================================================

CREATE TABLE quests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    curriculum_day_id  UUID REFERENCES curriculum_days(id) ON DELETE SET NULL,
    quest_date         DATE NOT NULL,
    quest_type         TEXT NOT NULL CHECK (quest_type IN ('main','sub','bonus')),
    title              TEXT NOT NULL,
    description        TEXT,
    difficulty         TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy','normal','hard')),
    target_type        TEXT NOT NULL CHECK (target_type IN ('study_minutes','quiz_complete','daily_100_percent','custom')),
    target_value       NUMERIC,
    progress_value     NUMERIC NOT NULL DEFAULT 0,
    xp_reward          INT NOT NULL DEFAULT 0,
    acorn_reward       INT NOT NULL DEFAULT 0,
    status             TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','skipped')),
    generated_by       TEXT NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','user')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at       TIMESTAMPTZ
);
CREATE INDEX idx_quests_user_date ON quests(user_id, quest_date);

-- 위 quests 테이블은 미사용이다(실제 화면은 프론트에서 결정적으로 생성한 일/주간 퀘스트
-- 목록을 쓴다 — ForestGame.jsx). 실제로 저장이 필요한 건 진행률 계산용 이벤트 로그와
-- 보상 중복 수령 방지 기록뿐이라 routers/quest_progress.py는 아래 두 테이블만 쓴다.

-- 일/주간 퀘스트 진행률 계산용 이벤트 로그 (예: daily-timer, weekly-quiz, bonus-study-minutes)
CREATE TABLE quest_events (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_date DATE NOT NULL,
    amount     NUMERIC NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, event_type, event_date)
);

-- 퀘스트/업적 보상 중복 수령 방지 (period_key: 일별은 날짜, 주별은 주 시작일, 업적은 고정값)
CREATE TABLE claimed_rewards (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_id  TEXT NOT NULL,
    period_key TEXT NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, reward_id, period_key)
);

-- =====================================================================
-- 6. 도서관 - 공부시간 타이머
-- =====================================================================

CREATE TABLE study_sessions (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id                   UUID REFERENCES quests(id) ON DELETE SET NULL,
    -- study_materials is defined later in this schema; its foreign key is
    -- added after both tables exist.
    study_material_id          UUID,
    started_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at                   TIMESTAMPTZ,
    active_seconds             INT NOT NULL DEFAULT 0,
    studied_minutes            INT NOT NULL DEFAULT 0,   -- 프론트에서 측정한 총 공부 시간(분)
    max_uninterrupted_minutes  INT NOT NULL DEFAULT 0,    -- 이탈 없이 이어간 최대 구간(분) — 집중력 계산용
    reward_dotori              INT NOT NULL DEFAULT 0,
    status                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','abandoned'))
);
CREATE INDEX idx_study_sessions_user ON study_sessions(user_id, started_at);

-- 이탈/다른 활동 감지로 타이머가 멈춘 구간 기록
CREATE TABLE study_session_interruptions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_session_id   UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    paused_at          TIMESTAMPTZ NOT NULL,
    resumed_at         TIMESTAMPTZ,
    segment_minutes    INT NOT NULL DEFAULT 0,   -- 시작(또는 직전 재개) 이후 이번 구간 동안 집중한 분
    reason             TEXT NOT NULL DEFAULT 'tab_hidden' CHECK (reason IN ('tab_hidden','left_site','manual_pause','leave_library'))
);

-- =====================================================================
-- 7. 퀴즈 & 자동 채점 & 약점 분석
-- =====================================================================

CREATE TABLE quizzes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quest_id          UUID REFERENCES quests(id) ON DELETE SET NULL,
    curriculum_day_id UUID REFERENCES curriculum_days(id) ON DELETE SET NULL,
    study_material_id UUID,  -- FK는 study_materials 정의 후 ALTER로 추가 (아래 참조)
    quiz_date     DATE NOT NULL,
    title         TEXT,
    difficulty    TEXT NOT NULL DEFAULT 'normal' CHECK (difficulty IN ('easy','normal','hard')),
    generated_by  TEXT NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','user')),
    quiz_type     TEXT NOT NULL DEFAULT 'study_review' CHECK (quiz_type IN ('placement','study_review')),
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','graded')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id        UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_order INT NOT NULL,
    question_text  TEXT NOT NULL,
    question_type  TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice','ox','short_answer')),
    options        JSONB,
    correct_answer TEXT NOT NULL,
    explanation    TEXT,
    topic_tag      TEXT,
    question_difficulty TEXT NOT NULL DEFAULT 'normal' CHECK (question_difficulty IN ('easy','normal','hard')),
    difficulty_score INT NOT NULL DEFAULT 50 CHECK (difficulty_score BETWEEN 1 AND 100),
    difficulty_reason TEXT
);

CREATE TABLE quiz_attempts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at  TIMESTAMPTZ,
    correct_count INT,
    total_count   INT,
    score_pct     NUMERIC(5,2)
);

CREATE TABLE quiz_answers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_attempt_id  UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    quiz_question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    user_answer      TEXT,
    is_correct       BOOLEAN,
    feedback_explanation TEXT,
    UNIQUE (quiz_attempt_id, quiz_question_id)
);

CREATE TABLE weak_point_reports (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_tag                TEXT NOT NULL,
    weakness_score           NUMERIC(5,2) NOT NULL,
    recommendation           TEXT,
    source_quiz_attempt_id   UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
    generated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_attempt_evaluations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_attempt_id          UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    quiz_id                  UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    study_material_id        UUID,
    quiz_type                TEXT NOT NULL CHECK (quiz_type IN ('placement','study_review')),
    mastery_score            NUMERIC(5,2) NOT NULL,
    mastery_level            TEXT NOT NULL CHECK (mastery_level IN ('beginner','intermediate','advanced')),
    recommended_difficulty   TEXT NOT NULL CHECK (recommended_difficulty IN ('easy','normal','hard')),
    confidence_score         NUMERIC(5,2) NOT NULL,
    difficulty_breakdown     JSONB,
    strengths                JSONB,
    weaknesses               JSONB,
    ai_analysis              TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (quiz_attempt_id)
);

CREATE TABLE user_learning_profiles (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    study_material_id        UUID,
    mastery_score            NUMERIC(5,2) NOT NULL DEFAULT 50,
    mastery_level            TEXT NOT NULL DEFAULT 'intermediate' CHECK (mastery_level IN ('beginner','intermediate','advanced')),
    recommended_difficulty   TEXT NOT NULL DEFAULT 'normal' CHECK (recommended_difficulty IN ('easy','normal','hard')),
    confidence_score         NUMERIC(5,2) NOT NULL DEFAULT 50,
    ai_analysis              TEXT,
    last_quiz_attempt_id     UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, study_material_id)
);

-- 사용자 업로드 학습자료(PDF/PPT/DOCX) + 약점 재학습용 튜터 챗봇(선생-학생 대화)
-- RAG + Study Agent: 요약, 핵심 개념 추출
CREATE TABLE wrong_answer_notes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_attempt_id    UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    quiz_question_id   UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    question_text      TEXT NOT NULL,
    user_answer        TEXT,
    correct_answer     TEXT NOT NULL,
    explanation        TEXT,
    mistake_analysis   TEXT,
    topic_tag          TEXT,
    status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','mastered')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_reviewed_at   TIMESTAMPTZ,
    UNIQUE (quiz_attempt_id, quiz_question_id)
);

CREATE TABLE wrong_answer_review_sessions (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_quiz_attempt_id          UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    started_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at                    TIMESTAMPTZ,
    total_questions                 INT NOT NULL,
    time_limit_seconds_per_question INT NOT NULL DEFAULT 120,
    status                          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned'))
);

CREATE TABLE wrong_answer_review_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_session_id     UUID NOT NULL REFERENCES wrong_answer_review_sessions(id) ON DELETE CASCADE,
    wrong_answer_note_id  UUID NOT NULL REFERENCES wrong_answer_notes(id) ON DELETE CASCADE,
    item_order            INT NOT NULL,
    started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at          TIMESTAMPTZ,
    time_limit_seconds    INT NOT NULL DEFAULT 120,
    elapsed_seconds       INT,
    user_answer           TEXT,
    is_correct            BOOLEAN,
    UNIQUE (review_session_id, wrong_answer_note_id)
);

CREATE TABLE similar_quiz_note_links (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_attempt_id     UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    source_wrong_note_id  UUID NOT NULL REFERENCES wrong_answer_notes(id) ON DELETE CASCADE,
    similar_quiz_id       UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    similar_question_id   UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (similar_question_id)
);

CREATE TABLE study_materials (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    certification_id  UUID REFERENCES certifications(id) ON DELETE SET NULL,
    title             TEXT NOT NULL,
    file_url          TEXT NOT NULL,
    file_type         TEXT CHECK (file_type IN ('pdf','ppt','docx','other')),
    ai_summary        TEXT,        -- AI 요약
    key_concepts      JSONB,       -- 핵심 개념 목록
    processed_status  TEXT NOT NULL DEFAULT 'pending' CHECK (processed_status IN ('pending','processing','ready','failed')),
    processing_stage  TEXT,        -- 진행 중 세부 단계 (parsing/embedding/summarizing), 완료/실패 시 NULL
    processing_error  TEXT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- quizzes.study_material_id FK (study_materials가 quizzes보다 뒤에 정의되므로 여기서 연결)
ALTER TABLE quizzes ADD CONSTRAINT fk_quizzes_study_material
    FOREIGN KEY (study_material_id) REFERENCES study_materials(id) ON DELETE SET NULL;

ALTER TABLE quiz_attempt_evaluations ADD CONSTRAINT fk_quiz_attempt_evaluations_study_material
    FOREIGN KEY (study_material_id) REFERENCES study_materials(id) ON DELETE SET NULL;

ALTER TABLE user_learning_profiles ADD CONSTRAINT fk_user_learning_profiles_study_material
    FOREIGN KEY (study_material_id) REFERENCES study_materials(id) ON DELETE CASCADE;

ALTER TABLE study_sessions ADD CONSTRAINT fk_study_sessions_study_material
    FOREIGN KEY (study_material_id) REFERENCES study_materials(id) ON DELETE SET NULL;

-- RAG 검색용 청크 + 임베딩 (Document Parse로 파싱한 자료를 섹션/토큰 단위로 분할)
-- solar-embedding-2-passage/query: 1024차원 (Upstage 콘솔 문서에서 확인)
CREATE TABLE document_chunks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
    chunk_index       INT NOT NULL,
    section_title     TEXT,
    page_number       INT,
    content           TEXT NOT NULL,
    token_count       INT,
    embedding         VECTOR(1024),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (study_material_id, chunk_index)
);
-- 코사인 유사도 검색용 ANN 인덱스 (자료가 어느 정도 쌓인 뒤 생성해도 무방)
CREATE INDEX idx_document_chunks_embedding ON document_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 도서관 학습 리포트: 요약 + 퀴즈 결과 + 오답 분석을 묶은 종합 리포트
CREATE TABLE study_reports (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    study_material_id      UUID REFERENCES study_materials(id) ON DELETE SET NULL,
    quiz_attempt_id        UUID REFERENCES quiz_attempts(id) ON DELETE SET NULL,
    summary                TEXT,
    wrong_answer_analysis  TEXT,
    recommendation         TEXT,
    generated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tutor_chat_sessions (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    study_material_id      UUID REFERENCES study_materials(id) ON DELETE SET NULL,
    weak_point_report_id   UUID REFERENCES weak_point_reports(id) ON DELETE SET NULL,
    curriculum_day_id      UUID REFERENCES curriculum_days(id) ON DELETE SET NULL,
    started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at               TIMESTAMPTZ
);

CREATE TABLE tutor_chat_messages (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_chat_session_id     UUID NOT NULL REFERENCES tutor_chat_sessions(id) ON DELETE CASCADE,
    role                      TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content                   TEXT NOT NULL,
    image_url                 TEXT,  -- 사용자가 사진을 첨부해 물어본 경우에만 값이 있음
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 8. 게임화: XP / 레벨 / 업적 / 도토리(재화) / 숲 성장
-- =====================================================================

CREATE TABLE level_definitions (
    level_number           INT PRIMARY KEY,
    title                  TEXT NOT NULL,          -- 입문자 / 성실한 학습자 / 자격증 전사 / 성장 마스터
    required_cumulative_xp INT NOT NULL
);

CREATE TABLE xp_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('quest','achievement','levelup_bonus','party_bonus')),
    source_id   UUID,
    xp_amount   INT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE achievements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,           -- 첫 퀘스트 완료 / 7일 연속 학습 / 30일 연속 학습 / 첫 자격증 취득 / 팀 스터디 MVP / 프로젝트 완료
    description     TEXT,
    condition_type  TEXT NOT NULL,
    condition_value NUMERIC,
    reward_acorn    INT NOT NULL DEFAULT 0,
    icon_url        TEXT
);

CREATE TABLE user_achievements (
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    achieved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE acorn_transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type   TEXT NOT NULL CHECK (source_type IN ('quest_complete','achievement','level_up','shop_purchase','theme_unlock','admin_adjust')),
    source_id     UUID,
    amount        INT NOT NULL,          -- 양수= 적립, 음수 = 사용
    balance_after INT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 숲 성장: EXP/도토리/업적/레벨에 연동되는 시각적 숲 성장 (Growth Agent)
CREATE TABLE forests (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    growth_stage  INT NOT NULL DEFAULT 0,   -- 씨앗 -> 새싹 -> 나무 -> 숲 단계
    tree_count    INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE forest_growth_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type  TEXT NOT NULL CHECK (source_type IN ('quest_complete','achievement','level_up','streak_bonus')),
    source_id    UUID,
    growth_delta INT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 9. 내 방 / 상점 / 캐릭터 꾸미기
-- =====================================================================
--
-- 아래 themes/shop_items/user_inventory/rooms/room_placements/characters/character_equipment는
-- 초기 설계 단계에서 만들어졌지만 실제로는 쓰이지 않는다. 실제 상점/방/캐릭터 API
-- (routers/goods.py, services/goods_service.py)는 AI로 만든 커스텀 아이템까지 함께
-- 다뤄야 해서 카탈로그 아이템(UUID)만 가정한 이 구조 대신, item_id를 프론트 카탈로그의
-- 문자열 슬러그(goods.js의 CATALOG id) 그대로 쓰는 더 단순한 전용 테이블을 쓴다.

-- 구매/보유 아이템 id (기본 카탈로그 + AI 커스텀 아이템 공용)
CREATE TABLE user_owned_items (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

-- AI로 만든 커스텀 아이템의 전체 데이터(이름/분류/색상/이미지 등, goods.js CATALOG 항목과 동일한 모양)
CREATE TABLE user_custom_items (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id    TEXT NOT NULL,
    data       JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item_id)
);

-- 슬롯별 장착 아이템 (캐릭터 꾸미기)
CREATE TABLE user_equipped_items (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot    TEXT NOT NULL CHECK (slot IN ('outfit','hat','pants','bag','accessory')),
    item_id TEXT,
    PRIMARY KEY (user_id, slot)
);

-- 내 방 배치 상태: 벽지/바닥 + 배치된 가구/장식 목록(JSON 배열: [{id,x,y,scale,rotate}])
CREATE TABLE user_rooms (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    wallpaper  TEXT,
    floor      TEXT,
    placed     JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE themes (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                   TEXT NOT NULL,
    description            TEXT,
    unlock_condition_type  TEXT NOT NULL,     -- e.g. achievement_count, level, specific_achievement
    unlock_condition_value TEXT,
    preview_image_url      TEXT
);

CREATE TABLE user_unlocked_themes (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme_id    UUID NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, theme_id)
);

CREATE TABLE shop_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    category     TEXT NOT NULL CHECK (category IN ('furniture','wallpaper','flooring','character_outfit','character_accessory')),
    price_acorns INT NOT NULL,
    image_url    TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE user_inventory (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shop_item_id UUID NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
    source       TEXT NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase','reward')),
    acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active_theme_id  UUID REFERENCES themes(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_placements (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_user_id  UUID NOT NULL REFERENCES rooms(user_id) ON DELETE CASCADE,
    inventory_id  UUID NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
    position_x    NUMERIC NOT NULL DEFAULT 0,
    position_y    NUMERIC NOT NULL DEFAULT 0,
    z_index       INT NOT NULL DEFAULT 0,
    rotation      NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE characters (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name             TEXT,
    base_appearance  JSONB
);

CREATE TABLE character_equipment (
    character_user_id UUID NOT NULL REFERENCES characters(user_id) ON DELETE CASCADE,
    inventory_id      UUID NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
    slot              TEXT NOT NULL CHECK (slot IN ('hair','outfit','accessory','background')),
    PRIMARY KEY (character_user_id, slot)
);

-- 자연어로 방/캐릭터 꾸미기를 요청한 LLM 호출 기록
CREATE TABLE llm_decoration_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target          TEXT NOT NULL CHECK (target IN ('room','character')),
    prompt_text     TEXT NOT NULL,
    applied_changes JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 10. 팀 스터디 파티 모드
-- =====================================================================

CREATE TABLE parties (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    leader_user_id   UUID NOT NULL REFERENCES users(id),
    goal_description TEXT,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','disbanded')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE party_members (
    party_id  UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (party_id, user_id)
);

CREATE TABLE party_goals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id      UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,       -- 보스 클리어 목표
    target_metric TEXT NOT NULL,       -- e.g. quest_count
    target_value  NUMERIC NOT NULL,
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL
);

CREATE TABLE party_contributions (
    party_goal_id      UUID NOT NULL REFERENCES party_goals(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contributed_value  NUMERIC NOT NULL DEFAULT 0,
    contribution_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (party_goal_id, user_id)
);

CREATE TABLE party_checkins (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id     UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL,
    summary      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (party_id, user_id, checkin_date)
);

-- =====================================================================
-- 11. 미래의 나 리포트 & 시뮬레이션
-- =====================================================================

CREATE TABLE pass_probability_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_cert_goal_id   UUID NOT NULL REFERENCES user_cert_goals(id) ON DELETE CASCADE,
    snapshot_date       DATE NOT NULL,
    pass_probability    NUMERIC(5,2) NOT NULL,
    model_version       TEXT,
    factors             JSONB,
    UNIQUE (user_cert_goal_id, snapshot_date)
);

CREATE TABLE simulation_scenarios (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_cert_goal_id           UUID NOT NULL REFERENCES user_cert_goals(id) ON DELETE CASCADE,
    scenario_label              TEXT NOT NULL,   -- 선택 A / 선택 B
    action_description          TEXT,
    projected_pass_probability  NUMERIC(5,2),
    projected_xp                INT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 12. 맥락 인지형 알림 (주 최대 3회 제한)
-- =====================================================================

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notif_type TEXT NOT NULL CHECK (notif_type IN ('motivation','quest_reminder','achievement','party')),
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    context    JSONB,
    sent_at    TIMESTAMPTZ,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;

-- 주간 발송 횟수 캡 체크용 카운터
CREATE TABLE notification_weekly_send_log (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    send_count      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, week_start_date)
);

-- =====================================================================
-- 13. 시험 당일 AI 어시스턴트 (저장된 시험 계획 + 마지막 안내 결과)
-- =====================================================================

CREATE TABLE exam_day_plans (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    certification_name    TEXT NOT NULL,
    exam_site_name        TEXT NOT NULL,
    exam_site_address     TEXT NOT NULL,
    exam_date             DATE NOT NULL,
    exam_start_time       TEXT NOT NULL,            -- 'HH:MM'
    origin_latitude       DOUBLE PRECISION NOT NULL, -- 출발지(집 등)
    origin_longitude      DOUBLE PRECISION NOT NULL,
    buffer_minutes        INT NOT NULL DEFAULT 30 CHECK (buffer_minutes BETWEEN 0 AND 180),
    -- 어시스턴트 실행 결과(경로/출발시각/주변장소/안내/시험장 팁) 캐시. 시험 당일 아침에
    -- 다시 조회할 때 외부 API를 전부 재호출하지 않아도 되도록 저장해 둔다.
    last_assistant_result JSONB,
    last_assistant_at     TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exam_day_plans_user ON exam_day_plans(user_id, exam_date);

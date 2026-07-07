# QuestStudy (Forestudy)

# 🌳 Forestudy

## 프로젝트 소개

Forestudy는 AI 학습 지원과 게임형 성장 시스템을 결합한 학습 플랫폼입니다.  
사용자는 도서관에서 공부하고, AI가 생성한 퀘스트를 완료하며, 보상으로 캐릭터와 방, 숲을 성장시킬 수 있습니다.

공부를 단순한 체크리스트가 아니라  
나만의 숲을 돌보는 하나의 게임으로 바꾸는 것을 목표로 합니다.


## 핵심 목표

- AI 기반 맞춤형 학습 지원
- 공부 타이머를 통한 학습 기록 수집
- 퀘스트와 보상 시스템을 통한 동기부여
- 캐릭터·방·숲 성장으로 시각적 성취감 제공
- 꾸준한 학습 습관 형성

## MVP 핵심 기능

| 기능 | 목적 | 입력 | 출력 | AI/Agent |
|---|---|---|---|---|
| AI 도서관 | 학습 자료를 AI가 분석하여 효율적인 학습 지원 | PDF, PPT, DOCX, 사용자 입력 자료 | 요약, 핵심 개념, AI 퀴즈, 오답 분석, 학습 리포트 | RAG + Study Agent |
| AI 퀘스트 게시판 | 개인 맞춤형 학습 계획 제공 및 학습 습관 형성 | 목표 자격증, 시험일, 현재 능력치, 이전 학습 기록 | 메인/서브/보너스 퀘스트, 난이도 자동 조절 | Planner Agent |
| AI 상태창 | 학습 데이터를 분석하여 현재 학습 상태 시각화 | 공부시간, 퀴즈 점수, 연속 학습일, 퀘스트 완료율 | 집중력, 이해도, 학습 지속성, 성장도, 합격 가능성, AI 피드백 | Status Agent + Evaluator |
| 성장 시스템 | 게임 요소를 통해 지속적인 학습 동기 부여 | EXP, 도토리(재화), 업적, 레벨 | 캐릭터 성장, 방 꾸미기, 숲 성장, 상점 이용, 테마 해금 | Growth Agent |

## DB

[db/schema.sql](db/schema.sql) — PostgreSQL 스키마.

- **사용자/활동**: `users`, `user_activity_days` (연속 접속일 = 학습 지속성)
- **AI 상태창**: `user_stats`, `user_stat_snapshots` (집중력/이해도/학습지속성/성장도/합격가능성 + AI 피드백), `trait_definitions`, `user_traits`
- **자격증/학습 목표**: `certifications`, `cert_exam_schedules`, `user_cert_goals`
- **AI 커리큘럼**: `curricula`, `curriculum_weeks`, `curriculum_days`
- **퀘스트 게시판**: `quests` (main/sub/bonus, 난이도 자동 조절)
- **도서관 타이머**: `study_sessions`, `study_session_interruptions` (이탈 시 타이머 정지)
- **퀴즈/채점/약점 분석**: `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_answers`, `weak_point_reports`
- **학습자료 + 리포트 + 튜터 챗봇**: `study_materials` (AI 요약/핵심 개념), `study_reports`, `tutor_chat_sessions`, `tutor_chat_messages`
- **게임화**: `level_definitions`, `xp_transactions`, `achievements`, `user_achievements`, `acorn_transactions`(도토리), `forests`/`forest_growth_events`(숲 성장)
- **내 방/상점/캐릭터**: `themes`, `user_unlocked_themes`, `shop_items`, `user_inventory`, `rooms`, `room_placements`, `characters`, `character_equipment`, `llm_decoration_requests` (자연어 꾸미기)
- **팀 스터디 파티**: `parties`, `party_members`, `party_goals`, `party_contributions`, `party_checkins`
- **미래의 나 리포트**: `pass_probability_snapshots`, `simulation_scenarios`
- **알림**: `notifications`, `notification_weekly_send_log` (주 최대 3회 제한)

# 🌳 Forestudy

## 프로젝트 소개

공부는 끝없는 의무처럼 느껴질 때가 많습니다. Forestudy는 AI와 게임 요소를 결합하여 공부를 즐거운 성장 경험으로 바꾸는 학습 플랫폼입니다.

사용자는 AI가 생성한 맞춤형 퀘스트를 수행하고, 도서관에서 학습하며, AI의 분석을 통해 자신의 학습 상태를 확인할 수 있습니다. 퀘스트를 완료하면 보상을 획득하여 캐릭터와 나만의 방을 꾸미고, 꾸준한 학습을 통해 자신의 성장을 시각적으로 경험할 수 있습니다.

Forestudy는 단순히 공부를 기록하는 서비스를 넘어, AI 기반 학습 지원과 게임형 성장 시스템을 결합하여 사용자가 즐겁게 공부를 지속할 수 있는 새로운 학습 경험을 제공합니다.

## 핵심 목표

- AI 기반 맞춤형 학습 지원
- 공부 타이머를 통한 학습 기록 수집
- 퀘스트와 보상 시스템을 통한 동기부여
- 캐릭터·방·숲 성장으로 시각적 성취감 제공
- 꾸준한 학습 습관 형성

## MVP 핵심 기능

| 기능명            | 목적(사용자 가치)                 | 입력                            | 출력                                     | 우선순위 | AI/Agent 적용                |
| -------------- | -------------------------- | ----------------------------- | -------------------------------------- | ---- | -------------------------- |
| **로그인 / 회원가입** | 사용자 정보 및 학습 데이터 관리         | 이메일, 비밀번호, 닉네임                | 로그인, 회원 정보 생성 및 저장                     | MVP  | Auth                       |
| **도서관**        | 집중 학습 공간 제공 및 학습 데이터 수집    | 학습 자료(PDF), 타이머 시작, 공부 종료     | 공부시간, AI 요약, 퀴즈 생성, 오답 분석, 학습 리포트      | MVP  | RAG + Study Agent          |
| **퀘스트 게시판**    | 개인 맞춤형 학습 계획 제공 및 학습 습관 형성 | 목표 자격증, 시험일, 현재 능력치, 이전 학습 기록 | 메인 퀘스트, 서브 퀘스트, 보너스 퀘스트, 난이도 자동 조절     | MVP  | Planner Agent              |
| **상태창**        | 학습 데이터를 분석하여 현재 학습 상태 시각화  | 공부시간, 퀴즈 점수, 연속 학습일, 퀘스트 완료율  | 집중력, 이해도, 학습 지속성, 합격 가능성, AI 피드백       | MVP  | Status Agent + Evaluator   |
| **내 정보**       | 사용자의 학습 현황 및 자격증 관리        | 사용자 정보, 학습 기록, 자격증 추가         | 능력치 조회, 진행 중인 자격증, 자격증 추가/관리, 기초 진단 퀴즈 | MVP  | Profile Agent + Quiz Agent |
| **성장 시스템**     | 게임 요소를 통해 지속적인 학습 동기 부여    | EXP, 도토리, 업적, 레벨              | 캐릭터 성장, 방 꾸미기, 상점 이용, 아이템 해금           | MVP  | Growth Agent               |


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

# 도서관 타이머 통신 규격 (프론트 ↔ 백엔드 ↔ DB)

> 기준: 현재 SQLite MVP 구현 (`models.py`, `services/timer_service.py`). `db/schema.sql`의 Postgres 목표 스키마와는 설계가 다르며, 차이점은 [7. 목표 Postgres 스키마와의 차이](#7-목표-postgres-스키마와의-차이-마이그레이션-시-참고)에 정리했습니다.

## 빠른 참고 (프론트 담당자용 요약)

**규칙 한 줄**: 공부 시간은 프론트가 직접 측정해서 숫자(분)로 보내주세요. 백엔드는 그 숫자를 그대로 DB에 저장만 합니다 (서버가 시간을 다시 계산하지 않음).

**호출 순서**: 도서관 입장 시 `start` 1번 → 자리를 비우거나 탭을 이탈할 때마다 `pause` (여러 번 가능) → 학습을 끝낼 때 `end` 1번.

| 순서 | 호출 시점 | 엔드포인트 | 보내야 하는 JSON |
|---|---|---|---|
| 1 | 도서관 화면 진입 | `POST /timer/start` | `{ "user_id": 7 }` |
| 2 | 탭 전환 등 이탈 감지될 때마다 | `POST /timer/pause` | `{ "session_id": 4, "segment_minutes": 20, "reason": "leave_library" }` |
| 3 | 학습 종료(종료 버튼 클릭) | `POST /timer/end` | `{ "session_id": 4, "studied_minutes": 45, "max_uninterrupted_minutes": 20 }` |

**각 필드가 뭔지**
- `user_id`: 로그인한 유저 id
- `session_id`: 1번 `start` 호출 응답에 들어있는 `session_id`를 그대로 재사용 (2, 3번 요청 모두 필요)
- `segment_minutes`: 이번에 이탈하기 직전까지, **직전 시작(또는 직전 pause) 이후로 집중한 시간**(분). 프론트가 직접 잰 값.
- `studied_minutes`: 세션 시작부터 끝까지 **집중한 시간 전체 합**(분). pause마다 쌓인 segment_minutes + 마지막 구간까지 다 더한 값.
- `max_uninterrupted_minutes`: 이탈 없이 가장 오래 이어서 집중한 구간(분). segment들 중 최댓값.
- `reason`: 왜 이탈했는지 (생략하면 `"leave_library"`로 저장됨. 자유 문자열이라 아무 값이나 가능, 예: `"phone_call"`)

**주의할 점**
- `segment_minutes`/`studied_minutes`/`max_uninterrupted_minutes`는 모두 0 이상 정수. 없으면 422 에러.
- `pause` 후 다시 재개할 때 별도로 호출할 API는 없습니다 — 그냥 프론트에서 로컬 타이머만 새로 시작하면 됩니다.
- 이미 끝난(`end` 호출된) `session_id`로 다시 `pause`/`end` 부르면 400 에러.

전체 배경(왜 이런 구조인지), 참고 구현 코드, DB 저장 구조는 아래 본문 참고.

## 0. 설계 원칙

시간 측정은 **프론트 전담**, 백엔드는 서버 시계로 경과 시간을 계산하지 않고 **프론트가 보낸 값을 검증 후 DB에 저장만** 합니다. `started_at`/`paused_at`/`ended_at`은 감사·기록용 타임스탬프일 뿐, 시간 "계산"에는 쓰이지 않습니다.

## 1. 시퀀스

```
프론트                          백엔드                     DB
  │  도서관 입장                   │                          │
  │──POST /timer/start──────────▶│──INSERT study_sessions──▶│
  │◀─session_id, started_at──────│                          │
  │  (로컬 스톱워치 시작)           │                          │
  │                               │                          │
  │  이탈 감지 (탭 전환 등)         │                          │
  │──POST /timer/pause──────────▶│──INSERT interruptions───▶│
  │◀─segment_minutes echo────────│                          │
  │  (로컬 세그먼트 타이머 리셋)     │                          │
  │        ...pause 여러 번 반복 가능...                      │
  │                               │                          │
  │  학습 종료                     │                          │
  │──POST /timer/end────────────▶│──UPDATE study_sessions──▶│
  │◀─reward_token 등──────────────│  add_reward / mark_activity│
```

## 2. API 상세

### 2.1 `POST /timer/start`

**Request**
```json
{ "user_id": 1 }
```

**Response 200**
```json
{
  "session_id": 3,
  "user_id": 1,
  "started_at": "2026-07-08T00:46:21.069452",
  "status": "started"
}
```

DB: `INSERT study_sessions (user_id, started_at=now(), status='started')`
프론트: 응답의 `session_id`를 보관하고 로컬 스톱워치 시작 (`performance.now()` 기준점 저장 권장).

---

### 2.2 `POST /timer/pause`

**Request**
```json
{ "session_id": 3, "segment_minutes": 15, "reason": "leave_library" }
```
- `segment_minutes` (필수, `>=0`): **이번 세그먼트만의 분** — start(또는 직전 pause) 이후 지금까지 프론트가 측정한 시간. 누적 총합이 아님.
- `reason` (선택, 기본값 `"leave_library"`): 자유 문자열. 현재 enum 제약 없음.

**Response 200**
```json
{
  "session_id": 3,
  "user_id": 1,
  "paused_at": "2026-07-08T00:46:21.278000",
  "segment_minutes": 15,
  "total_studied_minutes": 15,
  "status": "paused",
  "reason": "leave_library"
}
```
- `total_studied_minutes`: DB에 지금까지 쌓인 모든 `segment_minutes`의 합 (단순 SQL 합산, 시계 계산 아님).

DB: `INSERT study_session_interruptions (study_session_id, interrupted_at=now(), segment_minutes, reason)`
프론트: 이번 세그먼트 로컬 타이머를 0부터 다시 시작. **재개(resume) API는 없음** — pause는 세션을 멈추는 게 아니라 "이탈 로그"만 남기는 이벤트이므로, `session.status` DB 컬럼은 계속 `started`로 유지됩니다 (응답의 `"status": "paused"`는 이벤트 라벨일 뿐 DB 컬럼과 다름 — 아래 4번 참고).

---

### 2.3 `POST /timer/end`

**Request**
```json
{ "session_id": 3, "studied_minutes": 42, "max_uninterrupted_minutes": 27 }
```
- `studied_minutes` (필수, `>=0`): 프론트가 처음부터 끝까지 측정한 **총 학습 시간**(분).
- `max_uninterrupted_minutes` (필수, `>=0`): 프론트가 측정한, 이탈 없이 가장 오래 이어간 **단일 구간**(분).

**Response 200**
```json
{
  "session_id": 3,
  "user_id": 1,
  "started_at": "2026-07-08T00:46:21.069452",
  "ended_at": "2026-07-08T00:46:21.344099",
  "studied_minutes": 42,
  "max_uninterrupted_minutes": 27,
  "reward_token": 30,
  "status": "ended",
  "final_quiz_recommended": true,
  "next_action": "POST /quiz/generate to create a wrap-up quiz."
}
```
- `reward_token`은 **백엔드가 계산** (프론트가 조작 불가능하게 서버 산출): `studied_minutes >= 40` → 30, `> 0` → 10, `0` → 0.

DB: `UPDATE study_sessions SET ended_at, studied_minutes, max_uninterrupted_minutes, reward_token, status='ended'`, 이어서 `add_reward()`로 보상/도토리 지급, `mark_activity()`로 연속 접속일 갱신.

## 3. 필드 신뢰 경계 (누가 무엇을 계산하나)

| 값 | 계산 주체 | 비고 |
|---|---|---|
| `segment_minutes` | 프론트 | 세그먼트별 집중 시간 |
| `studied_minutes` | 프론트 | 총 학습 시간 |
| `max_uninterrupted_minutes` | 프론트 | 최대 연속 집중 시간 |
| `reward_token` | 백엔드 | `studied_minutes`로부터 파생 — 프론트가 직접 못 보내게 서버 전용 산출 |
| `started_at` / `paused_at` / `ended_at` | 백엔드 (`now_utc()`) | 기록용 타임스탬프, 시간 계산엔 미사용 |

## 4. DB 테이블 (SQLite, `models.py`)

**`study_sessions`**: `id`, `user_id`(FK `users.id`), `started_at`, `ended_at`, `studied_minutes`, `max_uninterrupted_minutes`, `reward_token`, `status`
- ⚠️ `status` 컬럼은 실제로는 `started` → `ended` 2단계만 존재합니다. `pause` 시점에 이 컬럼을 `paused`로 바꾸지 않습니다 (API 응답의 `status:"paused"`는 이벤트 설명일 뿐).

**`study_session_interruptions`**: `id`, `study_session_id`(FK), `interrupted_at`, `segment_minutes`, `reason` — 세션에 1:N.

## 5. 에러 케이스

| 상황 | 응답 |
|---|---|
| 존재하지 않는 `session_id`로 pause/end 호출 | `404 Timer session not found` |
| 이미 `end`된 세션에 pause/end 재호출 | `400 Timer session is not active` |
| 필수 필드 누락, 음수 값 등 | `422 Unprocessable Entity` (pydantic 검증) |

## 6. 프론트 구현 가이드

### 6.1 핵심 규칙

- **기준점 기반 계산**: `setInterval`로 카운트를 누적하지 말 것. 매번 "지금 시각 − 세그먼트 시작 시각"을 다시 계산해서 보낼 값을 구함 (탭 스로틀링/드리프트가 누적 카운트 방식보다 훨씬 덜 튐).
- **`performance.now()` 사용**: `Date.now()`(시스템 시계, 사용자가 바꿀 수 있음) 대신 `performance.now()`(모노토닉 클록)로 경과 시간을 잼. 단, 노트북 절전모드 등으로 오래 멈췄다 돌아오면 그 구간도 그대로 경과 시간에 포함되니, 필요하면 상한(clamp)을 걸 것.
- **재개(resume) API 호출 안 함**: `pause`는 이벤트 로그일 뿐이라, 사용자가 복귀하면 그냥 로컬에서 새 세그먼트를 조용히 시작하면 됨. 서버에 알릴 필요 없음.
- **분 단위 반올림은 항상 내림 + 0 이상 clamp**: `Math.max(0, Math.floor(ms / 60000))`.

### 6.2 참고 구현 (프레임워크 무관 TS)

```ts
class LibraryTimerClient {
  private sessionId: number | null = null;
  private segmentStartTs = 0;
  private segments: number[] = []; // pause로 확정된 세그먼트들 (분)

  constructor(private baseUrl: string, private userId: number) {}

  private minutesSince(ts: number): number {
    return Math.max(0, Math.floor((performance.now() - ts) / 60000));
  }

  async start(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/timer/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: this.userId }),
    });
    const { session_id } = await res.json();
    this.sessionId = session_id;
    this.segments = [];
    this.segmentStartTs = performance.now();
  }

  // 탭 전환, 자리 비움 등 이탈이 감지될 때 호출
  async pause(reason: string): Promise<void> {
    if (this.sessionId == null) return;
    const segmentMinutes = this.minutesSince(this.segmentStartTs);

    await fetch(`${this.baseUrl}/timer/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: this.sessionId,
        segment_minutes: segmentMinutes,
        reason,
      }),
    });

    this.segments.push(segmentMinutes);
    this.segmentStartTs = performance.now(); // 다음 세그먼트 시작점 리셋 (resume 호출 없이 로컬에서만)
  }

  // 학습 종료 버튼 클릭 시 호출
  async end(): Promise<void> {
    if (this.sessionId == null) return;
    const finalSegment = this.minutesSince(this.segmentStartTs);
    const allSegments = [...this.segments, finalSegment];

    await fetch(`${this.baseUrl}/timer/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: this.sessionId,
        studied_minutes: allSegments.reduce((a, b) => a + b, 0),
        max_uninterrupted_minutes: Math.max(...allSegments),
      }),
    });

    this.sessionId = null;
  }
}
```

### 6.3 이벤트 배선

```ts
const timer = new LibraryTimerClient(API_BASE_URL, userId);

await timer.start(); // 도서관 화면 진입 시

document.addEventListener("visibilitychange", () => {
  if (document.hidden) timer.pause("leave_library");
  // 복귀 시엔 아무 API도 호출하지 않음 — 다음 pause/end 때 새 세그먼트로 자동 집계됨
});

endButton.addEventListener("click", () => timer.end()); // "학습 종료" 버튼

window.addEventListener("beforeunload", () => {
  // best-effort: 일반 fetch는 페이지 언로드 중 취소될 수 있어 sendBeacon 권장.
  // sendBeacon은 GET/POST body만 가능하고 Content-Type을 못 바꾸므로
  // 서버가 text/plain으로 온 JSON도 파싱하게 하거나, 별도 keepalive fetch로 대체 검토 필요.
});
```

### 6.4 그 외 고려사항

- **세션 복구 없음**: 새로고침/브라우저 종료 시 세션을 이어받는 API가 없습니다. `beforeunload`에서 `end`를 못 보내고 탭이 닫히면 그 세션은 서버 DB상 `status='started'`로 영원히 남습니다 (좀비 세션). 필요하면 "일정 시간 지난 started 세션은 studied_minutes=0으로 자동 종료" 같은 백엔드 배치나, 프론트에서 재진입 시 이전 미종료 세션을 감지해 강제 종료 요청하는 흐름을 추가로 논의해야 합니다 (TODO, 현재 미구현).
- **탭 깜빡임(rapid visibilitychange) 방지**: 알림창 뜸/브라우저 전환 등으로 `hidden`이 짧게 여러 번 토글될 수 있어, `segment_minutes`가 0인 pause가 남발되지 않도록 최소 유예시간(예: 3초) 디바운스를 두는 걸 권장합니다.
- **여러 탭 동시 진입 방지**: 이 계약은 세션 1개 = 탭 1개를 가정합니다. 같은 유저가 도서관 탭을 여러 개 열면 `session_id`가 각각 발급되어 별도로 집계되니, 필요하면 프론트에서 중복 탭 진입을 막아야 합니다.

## 7. 목표 Postgres 스키마와의 차이 (마이그레이션 시 참고)

`db/schema.sql`의 `study_sessions`/`study_session_interruptions`는 이 문서의 계약과 다음이 다릅니다 — 추후 SQLite → Postgres 전환 시 API 계약이 바뀔 수 있습니다.

| 항목 | 현재 (SQLite MVP, 이 문서) | 목표 (`db/schema.sql`, Postgres) |
|---|---|---|
| `user_id` | `int` | `UUID` |
| 시간 단위 | 분 (`studied_minutes`) | 초 (`active_seconds`) |
| 인터럽션 기록 방식 | `segment_minutes` (구간 길이 단일값) | `paused_at` / `resumed_at` 쌍 (구간을 시작·끝 타임스탬프로 표현) |
| `reason` | 자유 문자열 (기본 `leave_library`) | `enum`: `tab_hidden` / `left_site` / `manual_pause` |
| `status` | 컬럼은 `started`/`ended` 2단계만 실사용 | 컬럼이 `active`/`paused`/`completed`/`abandoned` 4단계를 실제로 관리 |

이번 작업 범위에는 포함하지 않았습니다. 실제 Postgres 마이그레이션 시점에 다시 논의가 필요합니다.

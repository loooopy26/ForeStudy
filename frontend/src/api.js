export const API_BASE = import.meta.env.VITE_API_BASE_URL
  || `${window.location.protocol}//${window.location.hostname}:8000`

export function getMaterialId() {
  return localStorage.getItem('forestudy_material_id') || import.meta.env.VITE_MATERIAL_ID || ''
}

export function setMaterialId(materialId) {
  if (materialId) localStorage.setItem('forestudy_material_id', materialId)
}

export function getLastAttemptId() {
  return localStorage.getItem('forestudy_last_attempt_id') || ''
}

export function setLastAttemptId(attemptId) {
  if (attemptId) localStorage.setItem('forestudy_last_attempt_id', attemptId)
}

const QUIZ_PROGRESS_KEY = 'forestudy_quiz_progress'
const DAILY_QUIZ_REQUIREMENT_KEY = 'forestudy_daily_quiz_requirement'
const DAILY_QUIZ_UNLOCK_KEY = 'forestudy_daily_quiz_unlock'

function localTodayKey() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 자격증(자료)별로 독립된 상태를 저장해야 한다 — 예전엔 단일 객체({materialId, ...}) 하나만
// 저장해서, 자격증 2개를 오가면 나중에 확인한 자격증이 이전 자격증의 "오늘 퀴즈 진행 상황"을
// 덮어썼다. 그러면 다시 그 자격증으로 돌아왔을 때 이미 푼 퀴즈가 없는 것처럼 보여서 사용자가
// 요청하지 않았는데도 자동으로 새 퀴즈를 생성해버리는 문제가 있었다(실제 재현 확인됨) —
// materialId를 key로 하는 맵으로 바꿔 자격증마다 따로 기억한다.
function readJsonMap(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getQuizProgress(materialId) {
  const map = readJsonMap(QUIZ_PROGRESS_KEY)
  const saved = map[materialId]
  if (!saved) return null
  if (saved.quiz?.mode === 'similar_review' || saved.quiz?.source_attempt_id) {
    clearQuizProgress(materialId)
    return null
  }
  return saved
}

export function setQuizProgress(materialId, quiz, answers = {}, idx = 0) {
  if (!materialId) return
  const map = readJsonMap(QUIZ_PROGRESS_KEY)
  map[materialId] = { quiz, answers, idx }
  localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(map))
}

export function clearQuizProgress(materialId) {
  if (!materialId) {
    localStorage.removeItem(QUIZ_PROGRESS_KEY)
    return
  }
  const map = readJsonMap(QUIZ_PROGRESS_KEY)
  delete map[materialId]
  localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify(map))
}

// 채점까지 끝난 오늘의 AI 퀴즈 결과. 화면을 나갔다 들어와도 다시 생성하지 않고
// 그대로 보여주기 위해 저장해둔다. dismissed가 true면(복습하기로 이동 버튼을
// 눌렀으면) 결과 화면 대신 "오늘의 AI 퀴즈를 풀었습니다" 안내만 보여준다.
const QUIZ_RESULT_KEY = 'forestudy_quiz_result'

export function saveQuizResult(materialId, quiz, result) {
  if (!materialId) return
  const map = readJsonMap(QUIZ_RESULT_KEY)
  map[materialId] = { date: localTodayKey(), quiz, result, dismissed: false }
  localStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(map))
}

export function getQuizResult(materialId) {
  const map = readJsonMap(QUIZ_RESULT_KEY)
  const saved = map[materialId]
  if (!saved || saved.date !== localTodayKey()) return null
  return saved
}

export function dismissQuizResult(materialId) {
  const map = readJsonMap(QUIZ_RESULT_KEY)
  if (map[materialId]) {
    map[materialId] = { ...map[materialId], dismissed: true }
    localStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(map))
  }
}

export function clearQuizResult(materialId) {
  if (!materialId) {
    localStorage.removeItem(QUIZ_RESULT_KEY)
    return
  }
  const map = readJsonMap(QUIZ_RESULT_KEY)
  delete map[materialId]
  localStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(map))
}

export function requireDailyQuizCompletion(materialId, planDate = localTodayKey()) {
  if (!materialId) return
  const map = readJsonMap(DAILY_QUIZ_REQUIREMENT_KEY)
  map[materialId] = planDate
  localStorage.setItem(DAILY_QUIZ_REQUIREMENT_KEY, JSON.stringify(map))
}

export function isDailyQuizCompletionRequired(materialId) {
  const map = readJsonMap(DAILY_QUIZ_REQUIREMENT_KEY)
  return map[materialId] === localTodayKey()
}

export function unlockDailyQuiz(materialId, planDate = localTodayKey()) {
  if (!materialId) return
  const map = readJsonMap(DAILY_QUIZ_UNLOCK_KEY)
  map[materialId] = planDate
  localStorage.setItem(DAILY_QUIZ_UNLOCK_KEY, JSON.stringify(map))
}

export function isDailyQuizUnlocked(materialId) {
  const map = readJsonMap(DAILY_QUIZ_UNLOCK_KEY)
  return map[materialId] === localTodayKey()
}

// Library.jsx가 오늘의 복습 퀴즈를 미리 생성하는 동안, Quiz.jsx가 같은 자료에 대해
// 중복으로 또 생성하지 않도록 두 화면이 공유하는 "생성 중" 표시. 탭이 닫히는 등으로
// 마커가 못 지워지는 경우를 대비해 일정 시간이 지나면 stale로 취급한다.
// 자격증(자료)별로 독립된 항목을 저장해야 한다 — 예전엔 단일 객체({materialId,
// startedAt}) 하나만 저장해서, 자격증 2개를 오가면 한쪽 자료의 "생성 중" 표시가
// 다른 자료 걸로 덮어써졌다. 그러면 Library.jsx의 백그라운드 생성과 Quiz.jsx 자체
// 생성이 서로의 진행 상태를 못 보고 같은 자료에 중복으로 생성 요청을 보내
// (실측: 동시에 3번) 매번 재시도 예산을 나눠 쓰다 502로 실패하는 문제가 있었다.
const QUIZ_GENERATING_KEY = 'forestudy_quiz_generating'
const QUIZ_GENERATING_STALE_MS = 3 * 60 * 1000

export function markQuizGenerating(materialId) {
  if (!materialId) return
  const map = readJsonMap(QUIZ_GENERATING_KEY)
  map[materialId] = Date.now()
  localStorage.setItem(QUIZ_GENERATING_KEY, JSON.stringify(map))
}

export function clearQuizGenerating(materialId) {
  if (!materialId) return
  const map = readJsonMap(QUIZ_GENERATING_KEY)
  delete map[materialId]
  localStorage.setItem(QUIZ_GENERATING_KEY, JSON.stringify(map))
}

export function isQuizGenerating(materialId) {
  const map = readJsonMap(QUIZ_GENERATING_KEY)
  const startedAt = map[materialId]
  return typeof startedAt === 'number' && Date.now() - startedAt <= QUIZ_GENERATING_STALE_MS
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const text = await response.text()
    let message = text || `HTTP ${response.status}`
    try {
      const data = JSON.parse(text)
      message = data.detail || data.message || message
    } catch {
      // plain text error body
    }
    throw new Error(message)
  }
  return response.json()
}

export function normalizeOptions(options) {
  if (!options) return []
  if (Array.isArray(options)) return options
  try {
    const parsed = JSON.parse(options)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getMaterialAttempts(materialId) {
  return apiRequest(`/api/materials/${materialId}/attempts`)
}

export async function getDemoUser() {
  return apiRequest('/auth/demo')
}

// 로그인 상태면 실제 계정(도토리 등) 정보를, 아니면 데모 유저 정보를 반환한다.
export async function getMyUser() {
  const currentUser = getCurrentUser()
  if (currentUser?.id) {
    return apiRequest(`/auth/me/${currentUser.id}`)
  }
  return getDemoUser()
}

export async function login(email, password) {
  return apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

export async function register(email, password, nickname) {
  return apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, nickname }) })
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('forestudy_user') || 'null')
  } catch {
    return null
  }
}

export function setCurrentUser(user) {
  localStorage.setItem('forestudy_user', JSON.stringify(user))
}

export function clearCurrentUser() {
  localStorage.removeItem('forestudy_user')
}

const CERTIFICATES_STORAGE_KEY = 'forestudy_certificates'

export function getCurrentCertificates() {
  try {
    const certificates = JSON.parse(localStorage.getItem(CERTIFICATES_STORAGE_KEY) || '[]')
    return Array.isArray(certificates) ? certificates : []
  } catch {
    return []
  }
}

export function addCurrentCertificate(title, extra = {}) {
  const normalizedTitle = title.trim()
  if (!normalizedTitle) return getCurrentCertificates()

  const certificates = getCurrentCertificates()
  if (certificates.some((certificate) => certificate.title === normalizedTitle)) return certificates

  const nextCertificates = [
    ...certificates,
    {
      id: crypto.randomUUID(),
      title: normalizedTitle,
      subtitle: '학습 준비 중',
      progress: 0,
      ...extra,
    },
  ]
  localStorage.setItem(CERTIFICATES_STORAGE_KEY, JSON.stringify(nextCertificates))
  return nextCertificates
}

export function removeCurrentCertificate(certificateId) {
  const nextCertificates = getCurrentCertificates().filter(
    (certificate) => certificate.id !== certificateId
  )
  localStorage.setItem(CERTIFICATES_STORAGE_KEY, JSON.stringify(nextCertificates))
  return nextCertificates
}

export async function getStats(userId, materialId = '') {
  const query = materialId ? `?material_id=${encodeURIComponent(materialId)}` : ''
  return apiRequest(`/stats/${userId}${query}`)
}

export async function startTimer(userId) {
  return apiRequest('/timer/start', { method: 'POST', body: JSON.stringify({ user_id: userId }) })
}

export async function pauseTimer(sessionId, segmentMinutes, reason = 'leave_library') {
  return apiRequest('/timer/pause', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, segment_minutes: segmentMinutes, reason }),
  })
}

export async function endTimer(sessionId, studiedMinutes, maxUninterruptedMinutes) {
  return apiRequest('/timer/end', {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      studied_minutes: studiedMinutes,
      max_uninterrupted_minutes: maxUninterruptedMinutes,
    }),
  })
}

export async function listMaterials() {
  const res = await fetch(`${API_BASE}/api/materials`)
  if (!res.ok) throw new Error('자료 목록을 불러오지 못했습니다')
  return res.json()
}

export async function getMaterial(materialId) {
  const res = await fetch(`${API_BASE}/api/materials/${materialId}`)
  if (!res.ok) throw new Error('자료를 불러오지 못했습니다')
  return res.json()
}

export async function deleteMaterial(materialId) {
  const res = await fetch(`${API_BASE}/api/materials/${materialId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error('자료 삭제에 실패했습니다')
}

export async function uploadMaterial(file, title = '') {
  const form = new FormData()
  form.append('file', file)
  if (title) form.append('title', title)
  const res = await fetch(`${API_BASE}/api/materials`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || '업로드에 실패했습니다')
  }
  return res.json()
}

export function createPlacementQuiz(materialId) {
  return apiRequest(`/api/materials/${materialId}/quiz`, {
    method: 'POST',
    body: JSON.stringify({ num_questions: 10, difficulty: 'normal' }),
  })
}

export function submitQuiz(quizId, answers) {
  return apiRequest(`/api/quizzes/${quizId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  })
}

export async function deleteQuiz(quizId) {
  const res = await fetch(`${API_BASE}/api/quizzes/${quizId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404 && res.status !== 409) throw new Error('퀴즈 삭제에 실패했습니다')
}

export function createLearningPlan(attemptId, certificationName) {
  return apiRequest('/api/learning-plans', {
    method: 'POST',
    body: JSON.stringify({ quiz_attempt_id: attemptId, certification_name: certificationName }),
  })
}

export function saveCertGoal(certificationName, targetExamDate) {
  return apiRequest('/api/cert-goals', {
    method: 'PUT',
    body: JSON.stringify({ certification_name: certificationName, target_exam_date: targetExamDate }),
  })
}

export function getCertGoal(certificationName) {
  return apiRequest(`/api/cert-goals?certification_name=${encodeURIComponent(certificationName)}`)
}

// 자격증 삭제 시 목표 시험일 + 일별 학습 플랜(curricula)까지 함께 정리한다.
// DELETE는 204(빈 응답)라서 apiRequest의 response.json() 파싱을 피하려고 raw fetch를 쓴다.
export async function deleteCertGoal(certificationName) {
  const res = await fetch(
    `${API_BASE}/api/cert-goals?certification_name=${encodeURIComponent(certificationName)}`,
    { method: 'DELETE' }
  )
  if (!res.ok && res.status !== 404) throw new Error('목표 시험일 삭제에 실패했습니다')
}

export function prepareReviewQuiz(materialId) {
  return apiRequest(`/api/materials/${materialId}/review-quiz`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function sendCertGoalChat(certificationName, message, threadId) {
  return apiRequest('/api/cert-goals/agent-chat', {
    method: 'POST',
    body: JSON.stringify({ certification_name: certificationName, message, thread_id: threadId || null }),
  })
}

export function createCurriculum(goalId, attemptId) {
  return apiRequest(`/api/cert-goals/${goalId}/curricula`, {
    method: 'POST',
    body: JSON.stringify({ quiz_attempt_id: attemptId }),
  })
}

export function regenerateCurriculum(goalId, attemptId, targetExamDate) {
  return apiRequest(`/api/cert-goals/${goalId}/curricula/regenerate`, {
    method: 'POST',
    body: JSON.stringify({
      quiz_attempt_id: attemptId,
      target_exam_date: targetExamDate,
    }),
  })
}

export function getActiveCurriculum(goalId) {
  return apiRequest(`/api/cert-goals/${goalId}/curricula/active`)
}

export async function getCertificateProgress(certificateName) {
  const goal = await getCertGoal(certificateName)
  if (!goal?.found || !goal.goal_id) return { progress: 0, remainingDays: null }
  const curriculum = await getActiveCurriculum(goal.goal_id)
  const days = (curriculum?.weeks || []).flatMap((week) => week.days || [])
  const completed = days.filter((day) => day.progress_status === 'completed').length
  const progress = days.length ? Math.round(completed / days.length * 100) : 0
  const examDate = goal.target_exam_date ? new Date(`${goal.target_exam_date}T00:00:00`) : null
  const remainingDays = examDate ? Math.max(0, Math.ceil((examDate - new Date()) / 86400000)) : null
  return { progress, remainingDays, targetExamDate: goal.target_exam_date || null }
}

export function updateCurriculumDay(dayId, changes) {
  return apiRequest(`/api/cert-goals/curriculum-days/${dayId}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  })
}

function todayKey() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function flattenCurriculumDays(curriculum) {
  return (curriculum?.weeks || []).flatMap((week) =>
    (week.days || []).map((day) => ({
      ...day,
      week_number: week.week_number,
      week_theme: week.theme,
    }))
  )
}

export async function getTodayCurriculumDay(certificationName) {
  const fallbackCertName = getCurrentCertificates()[0]?.title || ''
  const activeCertName = certificationName || fallbackCertName
  if (!activeCertName) return null

  const goal = await getCertGoal(activeCertName)
  if (!goal?.found || !goal.goal_id) return null

  const curriculum = await getActiveCurriculum(goal.goal_id)
  const days = flattenCurriculumDays(curriculum)
  return {
    certification_name: activeCertName,
    goal,
    curriculum,
    day: days.find((day) => day.date === todayKey()) || null,
    days,
  }
}

// 자연어 설명으로 나만의 커스텀 아이템을 만든다. 분류 선택 없이 프롬프트만 받으며,
// 만든 아이템은 '커스텀' 탭에 모이고 방에 배치할 수 있는 오브젝트(decor)로 만들어진다.
// 실제 이미지 생성은 백엔드 담당(추후 백엔드 팀의 아이템 생성 API에 연결)이라,
// 여기서는 프론트 단독으로 도는 로컬 프리뷰 아이템을 만든다.
export async function generateAiItem(prompt) {
  const text = prompt.trim()
  if (!text) throw new Error('만들고 싶은 아이템을 설명해주세요')

  const user = getCurrentUser()
  let userIdVal = 1
  // 로그인한 실제 유저(UUID)면 real_user_id로 넘겨 백엔드가 진짜 도토리(PostgreSQL users.dotori)를
  // 차감하게 한다. 이게 없으면 백엔드는 항상 0으로 시작하는 SQLite 더미 토큰을 쓰려다 잔액
  // 부족으로 실패한다. int user_id는 인벤토리/이미지 레코드용으로 계속 함께 보낸다.
  let realUserId = null
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (user && user.id) {
    if (typeof user.id === 'number') {
      userIdVal = user.id
    } else {
      const parsed = parseInt(user.id, 10)
      if (!isNaN(parsed)) {
        userIdVal = parsed
      } else {
        userIdVal = Math.abs(hashText(user.id)) || 1
      }
      if (UUID_RE.test(user.id)) {
        realUserId = user.id
      }
    }
  }

  // 백엔드 AI 생성 API 호출
  const res = await apiRequest('/items/generate', {
    method: 'POST',
    body: JSON.stringify({ user_id: userIdVal, prompt: text, real_user_id: realUserId }),
  })

  const item = res.item

  // 프롬프트 키워드 기반으로 벽지/바닥/가구/장식 kind 분류 매핑
  let kind = 'decor'
  const lowerPrompt = text.toLowerCase()
  if (lowerPrompt.includes('벽지') || lowerPrompt.includes('wallpaper')) {
    kind = 'wallpaper'
  } else if (
    lowerPrompt.includes('바닥') ||
    lowerPrompt.includes('floor') ||
    lowerPrompt.includes('장판') ||
    lowerPrompt.includes('타일') ||
    lowerPrompt.includes('잔디')
  ) {
    kind = 'floor'
  } else if (
    lowerPrompt.includes('가구') ||
    lowerPrompt.includes('책상') ||
    lowerPrompt.includes('의자') ||
    lowerPrompt.includes('침대') ||
    lowerPrompt.includes('책장') ||
    lowerPrompt.includes('선반') ||
    lowerPrompt.includes('협탁') ||
    lowerPrompt.includes('서랍') ||
    lowerPrompt.includes('소파') ||
    lowerPrompt.includes('desk') ||
    lowerPrompt.includes('chair') ||
    lowerPrompt.includes('bed') ||
    lowerPrompt.includes('furniture')
  ) {
    kind = 'furniture'
  }

  // 렌더링에 적합하도록 색상 해시 및 속성 매핑
  const palette = [
    ['#7d9c62', '#5f7a43'],
    ['#e8a4b0', '#d3808f'],
    ['#9ec1d9', '#7ba3bf'],
    ['#e9c46a', '#d4a83f'],
    ['#a9825f', '#8a6647'],
  ]
  const [color, trim] = palette[Math.abs(hashText(text)) % palette.length]

  return {
    id: `ai-${item.item_id}`,
    name: item.name,
    price: 0,
    kind,
    art: 'plant', // 기본 art
    color,
    trim,
    imageUrl: `${API_BASE}${item.image_url}`, // 백엔드 정적 파일 서빙 URL 지정
    description: `"${text}" 느낌으로 만든 커스텀 아이템이에요.`,
    tags: text.split(/\s+/).filter(Boolean).slice(0, 3),
    generated: true,
  }
}

function hashText(text) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return hash
}

export async function deleteCurriculum(curriculumId) {
  const res = await fetch(`${API_BASE}/api/cert-goals/curricula/${curriculumId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error('학습 플랜 삭제에 실패했습니다')
}

export async function createTutorSession(materialId) {
  const res = await fetch(`${API_BASE}/api/tutor/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ study_material_id: materialId }),
  })
  if (!res.ok) throw new Error('채팅 세션을 시작하지 못했습니다')
  return res.json()
}

export async function getTutorMessages(sessionId) {
  const res = await fetch(`${API_BASE}/api/tutor/sessions/${sessionId}/messages`)
  if (!res.ok) throw new Error('대화 내용을 불러오지 못했습니다')
  return res.json()
}

// 자료 하나에 대해 실제로 대화를 나눈 세션만 일별 학습 주제 단위로 묶어서 반환한다.
export async function getTutorHistory(materialId) {
  const res = await fetch(`${API_BASE}/api/tutor/materials/${materialId}/history`)
  if (!res.ok) throw new Error('이전 질문 기록을 불러오지 못했습니다')
  return res.json()
}

// 서버가 SSE(text/event-stream)로 답변을 조각(delta) 단위로 흘려보낸다. onDelta가 있으면
// 조각이 도착할 때마다 (delta, 지금까지 합친 전체 텍스트)로 호출해준다. 최종적으로는
// 기존 호출부와 호환되게 { reply: 전체 텍스트 }를 반환한다.
async function readTutorReplyStream(res, onDelta) {
  if (!res.ok || !res.body) throw new Error('답변을 받지 못했습니다')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullReply = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const line = event.trim()
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice('data: '.length))
      if (payload.error) throw new Error(payload.error)
      if (payload.delta) {
        fullReply += payload.delta
        onDelta?.(payload.delta, fullReply)
      }
      if (payload.done) return { reply: fullReply }
    }
  }
  return { reply: fullReply }
}

export async function sendTutorMessage(sessionId, content, onDelta) {
  const res = await fetch(`${API_BASE}/api/tutor/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  return readTutorReplyStream(res, onDelta)
}

// 사진을 첨부해 질문한다. 백엔드가 OCR로 사진 속 텍스트를 읽어 답변에 활용한다.
export async function sendTutorImageMessage(sessionId, file, content, onDelta) {
  const form = new FormData()
  form.append('file', file)
  if (content) form.append('content', content)
  const res = await fetch(`${API_BASE}/api/tutor/sessions/${sessionId}/messages/image`, {
    method: 'POST',
    body: form,
  })
  return readTutorReplyStream(res, onDelta)
}

// ── 위치(TMAP) 기능 ────────────────────────────────────────────────
// LAN(http) 접속 등 보안 컨텍스트가 아니면 navigator.geolocation이 막히므로, 실패 시
// 서울 시청 좌표로 폴백한다 (백엔드 예시/화면 표기 주소와 동일한 기본값).
export const DEFAULT_ORIGIN = { latitude: 37.5665, longitude: 126.978 }

export function getCurrentPositionSafe({ timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ...DEFAULT_ORIGIN, fallback: true })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, fallback: false }),
      () => resolve({ ...DEFAULT_ORIGIN, fallback: true }),
      { timeout, maximumAge: 60000, enableHighAccuracy: false },
    )
  })
}

export function getLocationHealth() {
  return apiRequest('/api/location/health')
}

export function fetchNearbyStudyPlaces({ latitude, longitude, radiusMeters = 3000, query, transportModes }) {
  return apiRequest('/api/location/nearby-study-places', {
    method: 'POST',
    body: JSON.stringify({
      latitude,
      longitude,
      radius_meters: radiusMeters,
      ...(query ? { query } : {}),
      ...(transportModes ? { transport_modes: transportModes } : {}),
    }),
  })
}

export function fetchExamDayAssistant({ origin, exam, bufferMinutes = 30, transportModes }) {
  return apiRequest('/api/location/exam-day-assistant', {
    method: 'POST',
    body: JSON.stringify({
      origin,
      exam,
      buffer_minutes: bufferMinutes,
      ...(transportModes ? { transport_modes: transportModes } : {}),
    }),
  })
}

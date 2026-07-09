const API_BASE = import.meta.env.VITE_API_BASE_URL
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

export function getQuizProgress(materialId) {
  try {
    const saved = JSON.parse(localStorage.getItem(QUIZ_PROGRESS_KEY) || 'null')
    if (!saved || saved.materialId !== materialId) return null
    if (saved.quiz?.mode === 'similar_review' || saved.quiz?.source_attempt_id) {
      clearQuizProgress()
      return null
    }
    return saved
  } catch {
    return null
  }
}

export function setQuizProgress(materialId, quiz, answers = {}, idx = 0) {
  localStorage.setItem(QUIZ_PROGRESS_KEY, JSON.stringify({ materialId, quiz, answers, idx }))
}

export function clearQuizProgress() {
  localStorage.removeItem(QUIZ_PROGRESS_KEY)
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

export async function getStats(userId) {
  return apiRequest(`/stats/${userId}`)
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

export function createCurriculum(goalId, attemptId) {
  return apiRequest(`/api/cert-goals/${goalId}/curricula`, {
    method: 'POST',
    body: JSON.stringify({ quiz_attempt_id: attemptId }),
  })
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

export async function sendTutorMessage(sessionId, content) {
  const res = await fetch(`${API_BASE}/api/tutor/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error('답변을 받지 못했습니다')
  return res.json()
}

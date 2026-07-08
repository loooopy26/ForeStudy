const API_BASE = 'http://127.0.0.1:8000'

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

export async function uploadMaterial(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/materials`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || '업로드에 실패했습니다')
  }
  return res.json()
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

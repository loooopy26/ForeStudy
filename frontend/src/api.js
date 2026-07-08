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

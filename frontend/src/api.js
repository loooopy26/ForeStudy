const API_BASE = 'http://127.0.0.1:8000'

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

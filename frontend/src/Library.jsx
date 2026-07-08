import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import StudyIllustration from './StudyIllustration'
import { LibraryIcon, FocusIcon, ClockIcon, DocIcon, UploadIcon } from './icons'
import { listMaterials, uploadMaterial } from './api'
import './Library.css'

const TOTAL_SEC = 2400
const RING_LENGTH = 653.45

const STATUS_LABEL = {
  pending: '대기 중',
  processing: 'AI 분석 중',
  ready: '준비됨',
  failed: '실패',
}

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function Library({ onNavigate, materialId, onSelectMaterial }) {
  const [remaining, setRemaining] = useState(TOTAL_SEC)
  const [studySec, setStudySec] = useState(0)
  const [running, setRunning] = useState(false)
  const runningRef = useRef(running)
  runningRef.current = running

  const [materials, setMaterials] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  const refreshMaterials = () => {
    listMaterials().then(setMaterials).catch(() => {})
  }

  useEffect(() => {
    refreshMaterials()
    const id = setInterval(refreshMaterials, 5000)
    return () => clearInterval(id)
  }, [])

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const { material_id } = await uploadMaterial(file)
      onSelectMaterial(material_id)
      refreshMaterials()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (!runningRef.current) return
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false)
          return 0
        }
        return r - 1
      })
      setStudySec((s) => s + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const offset = RING_LENGTH * ((TOTAL_SEC - remaining) / TOTAL_SEC)
  const handleBack = () => onNavigate('village')

  return (
    <div className="library-page">
      <StudyIllustration />
      <Header
        title="도서관"
        icon={<LibraryIcon />}
        onBack={handleBack}
        action={
          <button
            type="button"
            className="header-action"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            aria-label="문서 업로드"
            title="문서 업로드"
          >
            <UploadIcon />
          </button>
        }
      />

      <div className="body-scroll library-body">
        <div className="focus-pill">
          <FocusIcon />
          <span>집중 모드</span>
        </div>

        <div className="study-goal">
          <p className="goal-label">오늘의 공부 목표</p>
          <h1 className="goal-title">데이터베이스 개념 복습</h1>
          <div className="goal-meta">
            <ClockIcon />
            <span>40분</span>
          </div>
        </div>

        <div className="stage-panel">
          <div className="timer-overlay">
            <div className="ring-wrap">
              <svg width="232" height="232" viewBox="0 0 232 232">
                <circle cx="116" cy="116" r="104" fill="none" stroke="oklch(0.88 0.02 82 / 0.85)" strokeWidth="14" />
                <circle
                  cx="116"
                  cy="116"
                  r="104"
                  fill="none"
                  stroke="oklch(0.62 0.095 148)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={RING_LENGTH}
                  strokeDashoffset={offset}
                />
              </svg>
              <div className="ring-face">
                <span>{fmt(remaining)}</span>
              </div>
            </div>
            <div className="study-pill">
              <span>총 공부시간 {fmt(studySec)}</span>
            </div>
            <button type="button" className="timer-button" onClick={() => setRunning((r) => !r)}>
              {running ? '일시정지' : '공부 시작'}
            </button>
          </div>
        </div>

        <div className="material-section">
          <div className="material-section-head">
            <p className="goal-label">내 자료</p>
            <button
              type="button"
              className="material-upload-button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? '업로드 중...' : '자료 업로드'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx"
              hidden
              onChange={handleFileChange}
            />
          </div>

          {uploadError && <p className="material-upload-error">{uploadError}</p>}

          <div className="material-list">
            {materials.length === 0 && <p className="material-empty">아직 업로드한 자료가 없어요.</p>}
            {materials.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`material-item${m.id === materialId ? ' selected' : ''}`}
                onClick={() => onSelectMaterial(m.id)}
              >
                <DocIcon />
                <span className="material-item-title">{m.title}</span>
                <span className={`material-status status-${m.processed_status}`}>
                  {STATUS_LABEL[m.processed_status] || m.processed_status}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <BottomNav active={null} onNavigate={onNavigate} />
    </div>
  )
}

export default Library

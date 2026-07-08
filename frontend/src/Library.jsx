import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import StudyIllustration from './StudyIllustration'
import { LibraryIcon, FocusIcon, ClockIcon } from './icons'
import './Library.css'

const TOTAL_SEC = 2400
const RING_LENGTH = 653.45

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function Library({ onNavigate }) {
  const [remaining, setRemaining] = useState(TOTAL_SEC)
  const [studySec, setStudySec] = useState(0)
  const [running, setRunning] = useState(false)
  const runningRef = useRef(running)
  runningRef.current = running

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
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    onNavigate('library')
  }

  return (
    <div className="library-page">
      <StudyIllustration />
      <Header title="도서관" icon={<LibraryIcon />} onBack={handleBack} />

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
      </div>

      <BottomNav active={null} onNavigate={onNavigate} />
    </div>
  )
}

export default Library

import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import StudyIllustration from './StudyIllustration'
import { LibraryIcon, FocusIcon, ClockIcon, DocIcon, UploadIcon } from './icons'
import { endTimer, getActiveCurriculum, getCertGoal, getCurrentCertificates, listMaterials, pauseTimer, startTimer, uploadMaterial } from './api'
import './Library.css'

const DEFAULT_DURATION_MIN = 40
const MIN_DURATION_MIN = 1
const MAX_DURATION_MIN = 180
const RING_LENGTH = 653.45
// 로그인이 없는 MVP라 SQLite 타이머 쪽은 고정 데모 유저를 사용한다 (AI 도서관의 데모 유저와 별개).
const TIMER_DEMO_USER_ID = 1

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

function toLocalDate(dateString) {
  return new Date(`${dateString}T00:00:00`)
}

function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
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

function getMonthCells(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const cells = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))
  }
  return cells
}

function Library({ onNavigate, materialId, onSelectMaterial, certName }) {
  const [durationMin, setDurationMin] = useState(() => {
    const saved = Number(localStorage.getItem('forestudy_timer_duration_min'))
    return Number.isInteger(saved) && saved >= MIN_DURATION_MIN && saved <= MAX_DURATION_MIN
      ? saved
      : DEFAULT_DURATION_MIN
  })
  const totalSec = durationMin * 60
  const [remaining, setRemaining] = useState(() => durationMin * 60)
  const [studySec, setStudySec] = useState(0)
  const [running, setRunning] = useState(false)
  const [durationModalOpen, setDurationModalOpen] = useState(false)
  const [durationDraft, setDurationDraft] = useState(String(durationMin))
  const [durationError, setDurationError] = useState('')
  const runningRef = useRef(running)
  const studySecRef = useRef(0)

  useEffect(() => {
    runningRef.current = running
  }, [running])

  // 타이머 세션 상태는 렌더링과 무관해서 ref로 관리한다.
  const sessionIdRef = useRef(null)
  const segmentStartRef = useRef(null)
  const maxUninterruptedMinRef = useRef(0)
  const endedRef = useRef(false)

  const [materials, setMaterials] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [calendarCurriculum, setCalendarCurriculum] = useState(null)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [selectedPlanDay, setSelectedPlanDay] = useState(null)

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

  const finishSession = () => {
    if (endedRef.current || !sessionIdRef.current) return
    endedRef.current = true
    const segmentMin = segmentStartRef.current ? Math.round((Date.now() - segmentStartRef.current) / 60000) : 0
    const maxMin = Math.max(maxUninterruptedMinRef.current, segmentMin)
    const studiedMin = Math.max(1, Math.round(studySecRef.current / 60))
    endTimer(sessionIdRef.current, studiedMin, maxMin).catch(() => {})
  }

  useEffect(() => {
    const id = setInterval(() => {
      if (!runningRef.current) return
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false)
          finishSession()
          return 0
        }
        return r - 1
      })
      setStudySec((s) => {
        const next = s + 1
        studySecRef.current = next
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const handleTimerToggle = async () => {
    if (!running) {
      if (!sessionIdRef.current) {
        try {
          const { session_id } = await startTimer(TIMER_DEMO_USER_ID)
          sessionIdRef.current = session_id
        } catch {
          // 세션 생성에 실패해도 로컬 타이머는 그대로 진행한다.
        }
      }
      segmentStartRef.current = Date.now()
      setRunning(true)
    } else {
      const segmentMin = segmentStartRef.current ? Math.round((Date.now() - segmentStartRef.current) / 60000) : 0
      maxUninterruptedMinRef.current = Math.max(maxUninterruptedMinRef.current, segmentMin)
      segmentStartRef.current = null
      setRunning(false)
      if (sessionIdRef.current) {
        pauseTimer(sessionIdRef.current, segmentMin, 'leave_library').catch(() => {})
      }
    }
  }

  const openDurationModal = () => {
    if (running || studySec > 0) return
    setDurationDraft(String(durationMin))
    setDurationError('')
    setDurationModalOpen(true)
  }

  const closeDurationModal = () => {
    setDurationModalOpen(false)
    setDurationError('')
  }

  const openCalendar = async () => {
    setCalendarOpen(true)
    setCalendarLoading(true)
    setCalendarError('')
    setCalendarCurriculum(null)
    setSelectedPlanDay(null)

    const fallbackCert = getCurrentCertificates()[0]?.title || ''
    const activeCertName = certName || fallbackCert
    if (!activeCertName) {
      setCalendarError('자격증을 먼저 선택해 주세요.')
      setCalendarLoading(false)
      return
    }

    try {
      const goal = await getCertGoal(activeCertName)
      if (!goal?.found || !goal.goal_id) {
        setCalendarError('생성된 목표 시험일이 없습니다.')
        return
      }

      const curriculum = await getActiveCurriculum(goal.goal_id)
      const days = flattenCurriculumDays(curriculum)
      setCalendarCurriculum(curriculum)
      if (days.length > 0) {
        setSelectedPlanDay(days[0])
        setCalendarMonth(toLocalDate(days[0].date))
      } else {
        setCalendarError('생성된 일별 학습 플랜이 없습니다.')
      }
    } catch (err) {
      setCalendarError(err.message || '학습 캘린더를 불러오지 못했습니다.')
    } finally {
      setCalendarLoading(false)
    }
  }

  const applyDuration = (event) => {
    event.preventDefault()
    const nextDuration = Number(durationDraft)
    if (!Number.isInteger(nextDuration) || nextDuration < MIN_DURATION_MIN || nextDuration > MAX_DURATION_MIN) {
      setDurationError(`${MIN_DURATION_MIN}분에서 ${MAX_DURATION_MIN}분 사이의 정수를 입력해 주세요.`)
      return
    }
    setDurationMin(nextDuration)
    setRemaining(nextDuration * 60)
    localStorage.setItem('forestudy_timer_duration_min', String(nextDuration))
    closeDurationModal()
  }

  const timerStarted = running || studySec > 0
  const offset = RING_LENGTH * ((totalSec - remaining) / totalSec)
  const handleBack = () => onNavigate('village')
  const calendarDays = flattenCurriculumDays(calendarCurriculum)
  const calendarDayMap = new Map(calendarDays.map((day) => [day.date, day]))
  const calendarCells = getMonthCells(calendarMonth)
  const selectedDayTasks = selectedPlanDay?.tasks || []

  return (
    <div className="library-page">
      <StudyIllustration />
      <Header
        title="도서관"
        onBack={handleBack}
        action={
          <button type="button" className="header-action library-calendar-button" onClick={openCalendar} aria-label="학습 캘린더" title="학습 캘린더">
            <LibraryIcon />
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
            <span>{durationMin}분</span>
            {!timerStarted && <span className="duration-hint">가운데 타이머를 눌러 변경</span>}
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
              <button
                type="button"
                className="ring-face"
                onClick={openDurationModal}
                disabled={timerStarted}
                aria-label={timerStarted ? `남은 시간 ${fmt(remaining)}` : `남은 시간 ${fmt(remaining)}, 목표 시간 변경`}
              >
                <span>{fmt(remaining)}</span>
                {!timerStarted && <small>눌러서 시간 설정</small>}
              </button>
            </div>
            <div className="study-pill">
              <span>총 공부시간 {fmt(studySec)}</span>
            </div>
            <button type="button" className="timer-button" onClick={handleTimerToggle}>
              {running ? '일시정지' : '공부 시작'}
            </button>
          </div>
        </div>

        <div className="material-section">
          <div className="material-section-head">
            <p className="goal-label">내 자료</p>
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

      {durationModalOpen && (
        <div className="duration-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDurationModal()}>
          <div className="duration-modal" role="dialog" aria-modal="true" aria-labelledby="duration-modal-title">
            <h2 id="duration-modal-title">목표 시간 설정</h2>
            <p>집중할 시간을 분 단위로 입력해 주세요.</p>
            <form onSubmit={applyDuration}>
              <label className="duration-modal-input">
                <input
                  type="number"
                  min={MIN_DURATION_MIN}
                  max={MAX_DURATION_MIN}
                  step="1"
                  value={durationDraft}
                  onChange={(event) => {
                    setDurationDraft(event.target.value)
                    setDurationError('')
                  }}
                  autoFocus
                  aria-label="목표 공부 시간"
                  aria-invalid={Boolean(durationError)}
                />
                <span>분</span>
              </label>
              {durationError && <p className="duration-modal-error">{durationError}</p>}
              <div className="duration-modal-actions">
                <button type="button" className="duration-cancel-button" onClick={closeDurationModal}>취소</button>
                <button type="submit" className="duration-apply-button">적용</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {calendarOpen && (
        <div className="calendar-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCalendarOpen(false)}>
          <section className="calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title">
            <div className="calendar-modal-head">
              <div>
                <p>일별 학습 플랜</p>
                <h2 id="calendar-modal-title">
                  {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
                </h2>
              </div>
              <button type="button" onClick={() => setCalendarOpen(false)} aria-label="닫기">×</button>
            </div>

            <div className="calendar-month-controls">
              <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>이전</button>
              <button type="button" onClick={() => setCalendarMonth(new Date())}>오늘</button>
              <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>다음</button>
            </div>

            {calendarLoading && <p className="calendar-status">캘린더를 불러오는 중...</p>}
            {!calendarLoading && calendarError && <p className="calendar-status calendar-error">{calendarError}</p>}

            {!calendarLoading && !calendarError && (
              <>
                <div className="calendar-grid">
                  {['일', '월', '화', '수', '목', '금', '토'].map((dayName) => (
                    <span className="calendar-weekday" key={dayName}>{dayName}</span>
                  ))}
                  {calendarCells.map((date, index) => {
                    if (!date) return <span className="calendar-day empty" key={`empty-${index}`} />
                    const key = toDateKey(date)
                    const planDay = calendarDayMap.get(key)
                    const selected = selectedPlanDay?.date === key
                    return (
                      <button
                        type="button"
                        className={`calendar-day${planDay ? ' has-plan' : ''}${selected ? ' selected' : ''}`}
                        key={key}
                        onClick={() => planDay && setSelectedPlanDay(planDay)}
                        disabled={!planDay}
                      >
                        <span>{date.getDate()}</span>
                        {planDay && <small>{planDay.focus_topic}</small>}
                      </button>
                    )
                  })}
                </div>

                {selectedPlanDay && (
                  <article className="calendar-detail">
                    <div className="calendar-detail-head">
                      <span>{selectedPlanDay.date}</span>
                      {selectedPlanDay.planned_minutes && <span>{selectedPlanDay.planned_minutes}분</span>}
                    </div>
                    <h3>{selectedPlanDay.focus_topic}</h3>
                    {selectedDayTasks.length > 0 && (
                      <ul>
                        {selectedDayTasks.slice(0, 4).map((task, index) => (
                          <li key={`${selectedPlanDay.day_id}-${index}`}>{task}</li>
                        ))}
                      </ul>
                    )}
                    {selectedPlanDay.checkpoint && <p>{selectedPlanDay.checkpoint}</p>}
                  </article>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <BottomNav active={null} onNavigate={onNavigate} />
    </div>
  )
}

export default Library

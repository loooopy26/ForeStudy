import { useEffect, useEffectEvent, useRef, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import StudyIllustration from './StudyIllustration'
import useStudyCamera from './useStudyCamera'
import useStudyFocus from './useStudyFocus'
import useStudyAlert from './useStudyAlert'
import CertSelect from './CertSelect'
import { LibraryIcon, FocusIcon, ClockIcon, DocIcon, UploadIcon } from './icons'
import { clearQuizGenerating, endTimer, getActiveCurriculum, getCertGoal, getCurrentCertificates, getMyUser, getQuizProgress, getTodayCurriculumDay, isQuizGenerating, listMaterials, markQuizGenerating, onCertificatesUpdated, pauseTimer, prepareReviewQuiz, recordQuestEvent, requireDailyQuizCompletion, setQuizProgress, startTimer, unlockDailyQuiz, updateCurriculumDay, uploadMaterial } from './api'
import './Library.css'

const DEFAULT_DURATION_MIN = 40
const MIN_DURATION_MIN = 1
const MAX_DURATION_MIN = 180
const RING_LENGTH = 653.45

const FACE_FOCUS_MESSAGES = {
  loading: '얼굴 감지 모델을 준비하고 있어요.',
  calibrate: '얼굴이 보이게 앉고 평소 공부하는 방향을 잠시 봐 주세요.',
  focused: '공부 중 추정 · 기준 얼굴 방향',
  checking: '얼굴 방향을 다시 확인하고 있어요.',
  away: '집중 이탈 의심 · 고개가 다른 방향을 향해요.',
  missing: '집중 이탈 의심 · 얼굴이 한동안 보이지 않아요.',
  error: '얼굴을 감지할 수 없어요. 다시 기준을 잡아 주세요.',
}

const MOTION_FOCUS_MESSAGES = {
  waiting: '움직임 신호를 기다리고 있어요.',
  steady: '기기 움직임 감지 중',
  moving: '집중 이탈 의심 · 아이폰이 크게 움직였어요.',
  unavailable: '이 기기에서 움직임 신호를 받지 못했어요.',
}

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

function getTimerDurationKey(planDay) {
  return `forestudy_timer_duration_${planDay.date}_${planDay.day_id}`
}

function restoreTimerState(timerState) {
  const defaultDuration = Number(localStorage.getItem('forestudy_timer_duration_min'))
  const durationMin = Number.isInteger(defaultDuration) && defaultDuration >= MIN_DURATION_MIN && defaultDuration <= MAX_DURATION_MIN
    ? defaultDuration
    : DEFAULT_DURATION_MIN

  // 새로고침 없이 앱을 켜둔 채로 자정을 넘긴 경우, 어제 남은 시간/누적 공부시간을 그대로
  // 이어가지 않고 오늘 기준으로 다시 시작한다 — 그래야 오늘 계획된 시간(planned_minutes)도
  // 정상적으로 기본값에 반영된다.
  if (!timerState || timerState.date !== toDateKey(new Date())) {
    return { durationMin, remaining: durationMin * 60, studySec: 0, running: false }
  }

  const elapsed = timerState.running && timerState.updatedAt
    ? Math.floor((Date.now() - timerState.updatedAt) / 1000)
    : 0
  const passed = Math.min(elapsed, timerState.remaining)
  const remaining = Math.max(0, timerState.remaining - passed)
  return { ...timerState, remaining, studySec: timerState.studySec + passed, running: timerState.running && remaining > 0 }
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

function Library({ onNavigate, materialId, onSelectMaterial, onSelectCertificate, certName, timerState, onTimerStateChange }) {
  const [restoredTimer] = useState(() => restoreTimerState(timerState))
  const [durationMin, setDurationMin] = useState(restoredTimer.durationMin)
  const totalSec = durationMin * 60
  const [remaining, setRemaining] = useState(restoredTimer.remaining)
  const [studySec, setStudySec] = useState(restoredTimer.studySec)
  const [running, setRunning] = useState(restoredTimer.running)
  const [focusPaused, setFocusPaused] = useState(false)
  const counting = running && !focusPaused
  const focusPausedRef = useRef(false)
  const studyAlert = useStudyAlert()
  const videoRef = useRef(null)
  const camera = useStudyCamera(videoRef)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [cameraFacing, setCameraFacing] = useState('user')
  const previewVisible = camera.status === 'live'
  const focus = useStudyFocus(videoRef, camera.stream, running)
  const [durationModalOpen, setDurationModalOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [durationDraft, setDurationDraft] = useState(String(durationMin))
  const [durationError, setDurationError] = useState('')
  const runningRef = useRef(running)
  const studySecRef = useRef(restoredTimer.studySec)
  const [, forceCertRerender] = useState(0)

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => onCertificatesUpdated(() => forceCertRerender((n) => n + 1)), [])

  // 타이머 세션 상태는 렌더링과 무관해서 ref로 관리한다.
  // The snapshot lives in App memory and can also carry a pending server session.
  const timerSession = useRef(restoredTimer.session || (restoredTimer.sessionId ? Promise.resolve(restoredTimer.sessionId) : null))
  const segmentStartRef = useRef(restoredTimer.segmentStartAt || (restoredTimer.running ? restoredTimer.updatedAt : null))
  const maxUninterruptedMinRef = useRef(restoredTimer.maxUninterruptedMin || 0)
  const endedRef = useRef(false)

  useEffect(() => {
    onTimerStateChange({
      durationMin,
      remaining,
      studySec,
      running: counting,
      session: timerSession.current,
      segmentStartAt: segmentStartRef.current,
      maxUninterruptedMin: maxUninterruptedMinRef.current,
      updatedAt: Date.now(),
      date: toDateKey(new Date()),
    })
  }, [durationMin, remaining, studySec, counting, onTimerStateChange])

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
  const [todayPlanDay, setTodayPlanDay] = useState(null)
  const [timerCompleted, setTimerCompleted] = useState(false)
  const todayPlanRef = useRef(null)
  const preparingQuizRef = useRef(false)

  const refreshMaterials = () => {
    listMaterials().then(setMaterials).catch(() => {})
  }

  useEffect(() => {
    refreshMaterials()
    const id = setInterval(refreshMaterials, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    getTodayCurriculumDay(certName)
      .then((result) => {
        if (cancelled) return
        const planDay = result?.day || null
        setTodayPlanDay(planDay)
        todayPlanRef.current = planDay
        if (!planDay || !materialId) return

        const plannedMinutes = Number(planDay.planned_minutes)

        if (
          studySecRef.current === 0
          && Number.isInteger(plannedMinutes)
          && plannedMinutes >= MIN_DURATION_MIN
          && plannedMinutes <= MAX_DURATION_MIN
      ) {
        const durationKey = getTimerDurationKey(planDay)
        const savedDuration = Number(localStorage.getItem(durationKey))

        const nextDuration = (
          Number.isInteger(savedDuration)
          && savedDuration >= MIN_DURATION_MIN
          && savedDuration <= MAX_DURATION_MIN
        )
          ? savedDuration
          : plannedMinutes

        setDurationMin(nextDuration)
        setRemaining(nextDuration * 60)
      }

        requireDailyQuizCompletion(materialId, planDay.date)
      })
      .catch(() => {
        if (!cancelled) setTodayPlanDay(null)
      })
    return () => {
      cancelled = true
    }
  }, [certName, materialId])

  // 오늘의 복습 퀴즈는 도서관 화면에 들어오자마자가 아니라, 사용자가 실제로 "공부 시작"을
  // 눌러 이 자료의 타이머를 시작하는 시점에만 백그라운드로 미리 생성한다 — 자격증을 여러 개
  // 등록해두고 화면만 오갈 때 여러 자료의 퀴즈가 동시에 생성되는 걸 애초에 구조적으로
  // 막기 위함(사용자 요청).
  const startBackgroundQuizPreparation = () => {
    const planDay = todayPlanRef.current
    if (!materialId || !planDay) return
    const savedQuiz = getQuizProgress(materialId)
    if (
      savedQuiz?.quiz?.plan_scope?.day_id === planDay.day_id
      || preparingQuizRef.current
      || isQuizGenerating(materialId)
    ) return
    preparingQuizRef.current = true
    markQuizGenerating(materialId)
    prepareReviewQuiz(materialId)
      .then((quiz) => setQuizProgress(materialId, quiz, {}, 0))
      .catch(() => {})
      .finally(() => {
        preparingQuizRef.current = false
        clearQuizGenerating(materialId)
      })
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const { material_id } = await uploadMaterial(file, '', certName)
      onSelectMaterial(material_id)
      refreshMaterials()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const finishSession = () => {
    camera.stop()
    if (endedRef.current) return
    endedRef.current = true
    const segmentMin = segmentStartRef.current ? Math.round((Date.now() - segmentStartRef.current) / 60000) : 0
    const maxMin = Math.max(maxUninterruptedMinRef.current, segmentMin)
    const studiedMin = Math.max(1, Math.round(studySecRef.current / 60))
    if (maxMin >= 20) recordQuestEvent('daily-focus')
    // 보너스 퀘스트의 누적/연속 학습 조건은 실제 타이머로 기록된 시간만 사용한다.
    recordQuestEvent('bonus-study-minutes', studiedMin)
    timerSession.current?.then(id => id && endTimer(id, studiedMin, maxMin)).catch(() => {})
  }

  const closeTimerSegment = (reason) => {
    if (segmentStartRef.current == null) return
    const segmentMin = Math.round((Date.now() - segmentStartRef.current) / 60000)
    maxUninterruptedMinRef.current = Math.max(maxUninterruptedMinRef.current, segmentMin)
    segmentStartRef.current = null
    timerSession.current?.then(id => id && pauseTimer(id, segmentMin, reason)).catch(() => {})
  }

  const pauseRunningTimer = (reason) => {
    camera.stop()
    if (!runningRef.current) return
    runningRef.current = false
    closeTimerSegment(reason)
    focusPausedRef.current = false
    setFocusPaused(false)
    setRunning(false)

    onTimerStateChange({
      durationMin,
      remaining,
      studySec,
      running: false,
      session: timerSession.current,
      segmentStartAt: null,
      maxUninterruptedMin: maxUninterruptedMinRef.current,
      updatedAt: Date.now(),
      date: toDateKey(new Date()),
    })
  }

  const faceAway = focus.faceEnabled && previewVisible && ['away', 'missing'].includes(focus.faceStatus)
  const motionAlert = focus.motionPermission === 'granted' && focus.motionStatus === 'moving'
  const faceReady = !focus.faceEnabled || !cameraEnabled || (previewVisible && focus.faceStatus === 'focused')
  const syncFocusPause = useEffectEvent(() => {
    if (!runningRef.current) return
    if (faceAway || motionAlert) {
      if (focusPausedRef.current) return
      focusPausedRef.current = true
      closeTimerSegment(faceAway ? 'focus_away' : 'device_motion')
      setFocusPaused(true)
      studyAlert.play(false)
    } else if (focusPausedRef.current && faceReady) {
      segmentStartRef.current = Date.now()
      focusPausedRef.current = false
      setFocusPaused(false)
      studyAlert.play(true)
    }
  })

  useEffect(() => {
    syncFocusPause()
  }, [running, faceAway, motionAlert, faceReady])

  useEffect(() => {
    if (!counting) return
    const id = setInterval(() => {
      if (!runningRef.current || focusPausedRef.current) return
      setRemaining((r) => {
        if (r <= 1) {
          runningRef.current = false
          setRunning(false)
          finishSession()
          setTimerCompleted(true)
          const planDay = todayPlanRef.current
          if (materialId && planDay) {
            unlockDailyQuiz(materialId, planDay.date)
            recordQuestEvent('daily-timer')
            recordQuestEvent('weekly-study')
            updateCurriculumDay(planDay.day_id, { progress_status: 'in_progress' }).catch(() => {})
          }
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
  }, [counting])

  const handleTimerToggle = () => {
    if (!runningRef.current) {
      studyAlert.enable()
      focus.resetMotion()
      if (focus.motionPermission === 'pending') void focus.requestMotion()
      if (cameraEnabled) void camera.start(cameraFacing)
      if (!timerSession.current) {
        const pending = getMyUser().then(user => startTimer(user.id, materialId))
          .then(result => result.session_id).catch(() => {
            if (timerSession.current === pending) timerSession.current = null
            return null
          })
        timerSession.current = pending
        startBackgroundQuizPreparation()
      }
      segmentStartRef.current = Date.now()
      runningRef.current = true
      onTimerStateChange({
        durationMin,
        remaining,
        studySec,
        running: true,
        session: timerSession.current,
        segmentStartAt: segmentStartRef.current,
        maxUninterruptedMin: maxUninterruptedMinRef.current,
        updatedAt: Date.now(),
        date: toDateKey(new Date()),
      })
      setRunning(true)
    } else {
      pauseRunningTimer('manual_pause')
    }
  }

  const handleTimerReset = () => {
    finishSession()
    runningRef.current = false
    focusPausedRef.current = false
    timerSession.current = null
    segmentStartRef.current = null
    maxUninterruptedMinRef.current = 0
    endedRef.current = false
    studySecRef.current = 0
    setRemaining(durationMin * 60)
    setStudySec(0)
    setRunning(false)
    setFocusPaused(false)
    setTimerCompleted(false)
    onTimerStateChange(null)
    setResetConfirmOpen(false)
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
      setCalendarError('등록된 자격증이 없습니다. 자격증 등록을 먼저 진행해주세요.')
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
    setTimerCompleted(false)
    if (todayPlanDay) {
      localStorage.setItem(
      getTimerDurationKey(todayPlanDay),
      String(nextDuration)
    )
  }
    closeDurationModal()
  }

  const timerStarted = running || studySec > 0
  const cameraCanRetry = cameraEnabled && running &&
    ['idle', 'denied', 'interrupted', 'error', 'insecure', 'unavailable', 'facingUnavailable'].includes(camera.status)
  const canRetryFromTimer = focusPaused && focus.faceEnabled && cameraCanRetry
  let timerStatus = ''
  if (focusPaused) {
    timerStatus = canRetryFromTimer ? '카메라를 다시 켜면 자동 재개를 확인할 수 있어요.'
      : motionAlert ? '기기 움직임 감지 · 자동 재개 대기'
      : faceAway && focus.faceStatus === 'missing' ? '얼굴이 화면에 보이면 자동 재개'
      : faceAway ? '얼굴 방향 이탈 · 자동 재개 대기' : '일시정지 · 기준 방향으로 돌아오면 재개'
  } else if (cameraEnabled && focus.faceEnabled && running && previewVisible &&
    ['loading', 'calibrate'].includes(focus.faceStatus)) {
    timerStatus = '얼굴이 보이게 앉고 평소 공부 방향을 봐 주세요.'
  }
  const offset = RING_LENGTH * ((totalSec - remaining) / totalSec)
  const certificates = getCurrentCertificates()
  const handleBack = () => {
    pauseRunningTimer('leave_library')
    onNavigate('village')
  }
  const calendarDays = flattenCurriculumDays(calendarCurriculum)
  const calendarDayMap = new Map(calendarDays.map((day) => [day.date, day]))
  const calendarCells = getMonthCells(calendarMonth)

  return (
    <div className={`library-page${focusMode ? ' focus-mode' : ''}`}>
      <StudyIllustration />
      {!focusMode && <Header
        title="도서관"
        onBack={handleBack}
        action={
          <button type="button" className="header-action library-calendar-button" onClick={openCalendar} aria-label="학습 캘린더" title="학습 캘린더">
            <LibraryIcon />
          </button>
        }
      />}

      <div className="body-scroll library-body">
        {!focusMode && certificates.length > 1 && (
          <div className="library-cert-selector">
            <span>학습 자격증</span>
            <CertSelect certificates={certificates} value={certName} onChange={onSelectCertificate} />
          </div>
        )}
        <div className="study-goal">
          <div className="study-goal-heading">
            <p className="goal-label">오늘의 공부 목표</p>
            <button type="button" className="focus-pill" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}>
              <FocusIcon />
              <span>{focusMode ? '집중 모드 종료' : '집중 모드'}</span>
            </button>
          </div>
          <h1 className="goal-title">{todayPlanDay?.focus_topic || '오늘의 학습 플랜을 확인해 주세요'}</h1>
        </div>

        <section className="stage-panel" aria-label="공부 타이머">
          <div className="timer-overlay">
            <div className="study-timer-heading">
              <span><span aria-hidden="true"><ClockIcon /></span> 목표 {durationMin}분</span>
              <span>누적 {fmt(studySec)}</span>
            </div>
            <div className={remaining >= 6000 ? 'ring-wrap has-three-digit-minutes' : 'ring-wrap'}>
              <svg viewBox="0 0 232 232" aria-hidden="true">
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
              {timerStarted ? (
                <div className="ring-face" role="timer" aria-label={`남은 시간 ${fmt(remaining)}`}>
                  <span>{fmt(remaining)}</span>
                </div>
              ) : (
                <button type="button" className="ring-face" onClick={openDurationModal}
                  aria-label={`남은 시간 ${fmt(remaining)}, 목표 시간 변경`}>
                  <span>{fmt(remaining)}</span>
                  <small>눌러서 시간 설정</small>
                </button>
              )}
            </div>
            <button type="button" className="timer-button" onClick={timerCompleted ? () => onNavigate('quiz') : handleTimerToggle}>
              {timerCompleted ? 'AI 퀴즈 풀기' : focusPaused ? '수동 일시정지' : running ? '일시정지' : '공부 시작'}
            </button>
            <div className="study-timer-status" data-paused={focusPaused} role="status">{timerStatus}</div>
            {canRetryFromTimer && (
              <button type="button" className="timer-reset-button" onClick={() => void camera.start(cameraFacing)}>
                카메라 다시 켜기
              </button>
            )}
            {!focusMode && (
              <button type="button" className="timer-reset-button" onClick={() => setResetConfirmOpen(true)}>
                타이머 초기화
              </button>
            )}
          </div>
        </section>

        <section className="study-camera" aria-label="집중 확인">
          <details className="study-camera-settings">
            <summary>
              <span>집중 감지 설정</span>
              <span className="study-settings-summary">
                {cameraEnabled && focus.faceEnabled
                  ? focus.motionEnabled ? '얼굴 · 움직임' : '얼굴'
                  : focus.motionEnabled ? '움직임' : cameraEnabled ? '카메라 사용' : '감지 꺼짐'}
              </span>
            </summary>
            <div className="study-camera-controls">
              <label>
                <input type="checkbox" checked={cameraEnabled} onChange={event => {
                  const enabled = event.target.checked
                  setCameraEnabled(enabled)
                  if (!enabled) camera.stop()
                  else if (running) void camera.start(cameraFacing)
                }} />
                카메라 미리보기 켜기
              </label>
              {cameraEnabled && (
                <label>
                  카메라 선택
                  <select value={cameraFacing} onChange={event => {
                    const facing = event.target.value
                    setCameraFacing(facing)
                    if (running) void camera.start(facing)
                  }}>
                    <option value="auto">자동 (후면 우선)</option>
                    <option value="user">전면 카메라</option>
                    <option value="environment">후면 카메라</option>
                  </select>
                </label>
              )}
              {cameraEnabled && <label>
                <input type="checkbox" checked={focus.faceEnabled} onChange={focus.toggleFace} />
                얼굴 방향으로 집중 확인
              </label>}
              <button type="button" onClick={focus.toggleMotion} disabled={focus.motionPermission === 'asking'}
                aria-pressed={focus.motionEnabled}>
                {focus.motionEnabled ? '움직임 감지 끄기' : '움직임 감지 켜기'}
              </button>
            </div>
          </details>
          {focus.motionPermission === 'asking' && <span role="status">Safari의 움직임 접근 요청을 확인해 주세요.</span>}
          {focus.motionPermission === 'denied' && <span role="status">Safari에서 움직임 권한이 거부됐어요.</span>}
          {focus.motionPermission === 'unavailable' && <span role="status">이 브라우저에서 움직임 감지를 사용할 수 없어요.</span>}
          {focus.motionPermission === 'granted' && <span role="status">
            {running ? MOTION_FOCUS_MESSAGES[focus.motionStatus] : '공부 시작을 누르면 움직임 감지가 시작돼요.'}
          </span>}
          <div className={previewVisible ? `study-camera-preview${camera.mirror ? ' is-mirrored' : ''}` : undefined} hidden={!cameraEnabled}>
            <video ref={videoRef} muted autoPlay playsInline hidden={!previewVisible}
              aria-label="카메라 미리보기" />
            {previewVisible && focus.detection && (
              <div className="study-face-overlay" aria-hidden="true">
                <div className="study-face-box" style={{
                  left: `${focus.detection.box.x * 100}%`,
                  top: `${focus.detection.box.y * 100}%`,
                  width: `${focus.detection.box.width * 100}%`,
                  height: `${focus.detection.box.height * 100}%`,
                }} />
                {[...focus.detection.eyes, focus.detection.nose].map((point, index) => (
                  <span key={index} className={index === 2 ? 'study-face-point is-nose' : 'study-face-point'}
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />
                ))}
              </div>
            )}
            {(!previewVisible || focus.faceEnabled) && <span className="study-camera-status" role={previewVisible ? undefined : 'status'}>
              {previewVisible ? FACE_FOCUS_MESSAGES[focus.faceStatus] : camera.message}
            </span>}
            {previewVisible && (
              <div className="study-camera-timer" aria-hidden="true">
                <span>{counting ? '남은 시간' : '일시정지'}</span>
                <strong>{fmt(remaining)}</strong>
              </div>
            )}
          </div>
          {previewVisible && focus.faceEnabled &&
            <button type="button" onClick={focus.resetFace}>얼굴 기준 다시 잡기</button>
          }
          {cameraCanRetry && !canRetryFromTimer &&
            <button type="button" onClick={() => void camera.start(cameraFacing)}>카메라 다시 켜기</button>}
        </section>
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
                  inputMode="numeric"
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

      {resetConfirmOpen && (
        <div className="timer-reset-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setResetConfirmOpen(false)}>
          <section className="timer-reset-modal" role="dialog" aria-modal="true" aria-labelledby="timer-reset-modal-title">
            <h2 id="timer-reset-modal-title">타이머를 초기화할까요?</h2>
            <p>남은 시간과 누적 공부시간이 초기화됩니다.</p>
            <div className="timer-reset-modal-actions">
              <button type="button" onClick={() => setResetConfirmOpen(false)}>취소</button>
              <button type="button" className="timer-reset-confirm-button" onClick={handleTimerReset}>초기화</button>
            </div>
          </section>
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
                    const completed = planDay?.progress_status === 'completed'
                    return (
                      <button
                        type="button"
                        className={`calendar-day${planDay ? ' has-plan' : ''}${completed ? ' completed' : ''}${selected ? ' selected' : ''}`}
                        key={key}
                        onClick={() => planDay && setSelectedPlanDay(planDay)}
                        disabled={!planDay}
                      >
                        <span>{date.getDate()}</span>
                        {planDay && <small>{planDay.focus_topic}</small>}
                        {completed && <b className="calendar-day-complete">✓</b>}
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
                    {selectedPlanDay.progress_status === 'completed' && <p className="calendar-detail-complete">✓ 완료된 학습 플랜</p>}
                    {selectedPlanDay.summary && <p>{selectedPlanDay.summary}</p>}
                    {selectedPlanDay.checkpoint && <p>{selectedPlanDay.checkpoint}</p>}
                    {selectedPlanDay.study_tip && <p><strong>학습 팁:</strong> {selectedPlanDay.study_tip}</p>}
                  </article>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {!focusMode && <BottomNav active={null} onNavigate={onNavigate} />}
    </div>
  )
}

export default Library

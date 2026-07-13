import { useEffect, useRef, useState } from 'react'
import ConfirmModal from './ConfirmModal'
import Header from './Header'
import MarkdownText from './MarkdownText'
import {
  createCurriculum,
  deleteCertGoal,
  deleteCurriculum,
  deleteMaterial,
  getCertGoal,
  getCurrentCertificates,
  isCertificatesLoaded,
  onCertificatesUpdated,
  refreshCertificates,
  regenerateCurriculum,
  saveCertGoal,
  sendCertGoalChat,
} from './api'
import { SummaryIcon } from './icons'
import './Shell.css'

// idle -> searching -> confirming -> (yes) confirmed -> generating -> done
//                                  -> (no) entering_date -> confirmed -> generating -> done
function LearningPlanView({ onNavigate, certName, materialId, planData }) {
  const plan = planData?.plan
  const attemptId = planData?.attemptId
  const score = planData?.score
  const resolvedCertName = certName || plan?.certification_name || '선택한 자격증'
  // 이미 "확인"까지 눌러서 정식 등록된 자격증을 다시 보러 온 것인지 — 그렇다면 이번엔
  // 나가도 아무것도 지우면 안 된다(이미 확정된 데이터이므로). 아직 등록 전이면(처음 설정
  // 흐름 중이면) 나갈 때 지금까지 만든 걸 전부 되돌리는 기존 동작을 그대로 적용한다.
  // 자격증 목록은 이제 백엔드에서 비동기로 불러오므로, 아직 로드가 안 끝났을 땐 삭제
  // 쪽(false)이 아니라 안전한 쪽(true = 이미 등록됨)으로 판단해 실수로 지우지 않게 한다.
  const computeAlreadyRegistered = () => {
    if (!materialId) return false
    if (!isCertificatesLoaded()) return true
    return getCurrentCertificates().some((c) => c.materialId === materialId)
  }
  const [alreadyRegistered, setAlreadyRegistered] = useState(computeAlreadyRegistered)

  useEffect(() => onCertificatesUpdated(() => setAlreadyRegistered(computeAlreadyRegistered())), [materialId])

  const [phase, setPhase] = useState('idle')
  const [examGoal, setExamGoal] = useState(null)
  const [goalError, setGoalError] = useState('')
  const [suggestedReply, setSuggestedReply] = useState('')
  const [threadId, setThreadId] = useState(null)
  const [manualDate, setManualDate] = useState('')

  const [curriculum, setCurriculum] = useState(null)
  const [curriculumError, setCurriculumError] = useState('')
  const [pendingLeave, setPendingLeave] = useState(null)
  const [generatingElapsed, setGeneratingElapsed] = useState(0)
  const abandonedRef = useRef(false)
  const lastGoalIdRef = useRef(null)

  // 주차 수가 많은 목표일수록 순차 생성이라 시간이 꽤 걸린다 — "멈춘 것 같다"는
  // 오해를 막기 위해 경과 시간을 보여준다.
  useEffect(() => {
    if (phase !== 'generating') return
    const timer = setInterval(() => setGeneratingElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  const discardAndLeave = (page, payload) => {
    setPendingLeave({ page, payload })
  }

  const confirmLeave = () => {
    const { page, payload } = pendingLeave
    setPendingLeave(null)
    abandonedRef.current = true
    // "확인"을 누르기 전까지는 아무것도 진짜로 등록된 게 아니다 — 이 화면에서 나가면
    // 목표 시험일/일별 플랜/자료(+배치고사 기록)까지 전부 없던 일로 되돌린다.
    if (curriculum?.curriculum_id) {
      deleteCurriculum(curriculum.curriculum_id).catch(() => {})
    }
    deleteCertGoal(resolvedCertName)
      .catch(() => {})
      .finally(() => refreshCertificates())
    if (materialId) {
      deleteMaterial(materialId).catch(() => {})
    }
    onNavigate(page, payload)
  }

  const cancelLeave = () => setPendingLeave(null)

  const confirmAndFinish = () => {
    // 목표 시험일 저장 + 커리큘럼 생성은 이미 앞 단계에서 백엔드(user_cert_goals)에
    // 반영돼 있다 — 여기서는 자격증 목록 캐시만 새로고침해서 화면에 반영한다.
    refreshCertificates().finally(() => onNavigate('profile'))
  }

  const startGoalFlow = async () => {
    setGoalError('')
    setExamGoal(null)
    setPhase('searching')
    try {
      const res = await sendCertGoalChat(
        resolvedCertName,
        `${resolvedCertName} 시험 목표일을 찾아줘. 검색해서 가장 유력한 날짜를 알려줘.`,
        null
      )
      setThreadId(res.thread_id)
      setSuggestedReply(res.reply || '검색 결과를 찾지 못했어요.')
      setPhase('confirming')
    } catch (err) {
      setGoalError(err.message || '목표 시험일을 확인하지 못했습니다.')
      setPhase('idle')
    }
  }

  const confirmSuggested = async () => {
    setGoalError('')
    setPhase('searching')
    try {
      const res = await sendCertGoalChat(resolvedCertName, '네, 맞아요. 그 날짜로 진행해주세요.', threadId)
      const goal = await getCertGoal(resolvedCertName)
      if (goal?.found && goal.target_exam_date) {
        setExamGoal(goal)
        setPhase('confirmed')
        generateCurriculum(goal.goal_id)
      } else {
        setGoalError(res.reply || '목표 시험일을 저장하지 못했어요. 직접 입력해 주세요.')
        setPhase('entering_date')
      }
    } catch (err) {
      setGoalError(err.message || '목표 시험일을 저장하지 못했습니다.')
      setPhase('confirming')
    }
  }

  const rejectSuggested = () => {
    setGoalError('')
    setPhase('entering_date')
  }

  const submitManualDate = async () => {
    if (!manualDate) return
    setGoalError('')
    setPhase('searching')
    try {
      const goal = await saveCertGoal(resolvedCertName, manualDate)
      setExamGoal(goal)
      setGeneratingElapsed(0)
      setPhase('generating')

      const created = await regenerateCurriculum(goal.goal_id, attemptId, manualDate)
      setCurriculum(created)
      setPhase('done')
    } catch (err) {
      setGoalError(err.message || '목표 시험일을 저장하지 못했습니다.')
      setPhase('entering_date')
    }
  }

  const generateCurriculum = async (goalId) => {
    if (!goalId || !attemptId) return
    lastGoalIdRef.current = goalId
    abandonedRef.current = false
    setGeneratingElapsed(0)
    setPhase('generating')
    setCurriculumError('')
    try {
      const created = await createCurriculum(goalId, attemptId)
      if (abandonedRef.current) {
        // 생성이 끝나기 전에 사용자가 이미 화면을 떠났다 — 방금 만들어진 커리큘럼을 바로 정리한다.
        deleteCurriculum(created.curriculum_id).catch(() => {})
        return
      }
      setCurriculum(created)
      setPhase('done')
    } catch (err) {
      if (!abandonedRef.current) {
        setCurriculumError(err.message || '일별 학습 플랜 생성에 실패했습니다.')
        setPhase('confirmed')
      }
    }
  }

  if (!plan) {
    return (
      <>
        <Header title="학습 플랜" icon={<SummaryIcon />} onBack={() => onNavigate('profile')} />
        <div className="done-screen">
          <div className="done-title">아직 만들어진 학습 플랜이 없어요</div>
          <div className="done-desc">배치고사를 먼저 풀면 맞춤 학습 플랜이 만들어집니다.</div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={() => onNavigate('profile')}>
            확인
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <Header
        title="학습 플랜"
        icon={<SummaryIcon />}
        onBack={() => (alreadyRegistered ? onNavigate('profile') : discardAndLeave('profile'))}
      />
      <div className="body-scroll">
        <section className="learning-plan-card">
          {score && (
            <div className="done-screen inline">
              <div className="done-badge done-score">
                <span>{score.correctCount}</span>
                <span>/ {score.totalCount}</span>
              </div>
              <div className="done-title">배치고사 결과</div>
            </div>
          )}
          <h2>{plan.certification_name} 맞춤 학습 플랜</h2>
          <p>{plan.learner_level_summary}</p>
          <div className="result-explain">{plan.exam_schedule_note}</div>

          <div className="goal-section">
            <h3>목표 시험일</h3>

            {goalError && <p className="plan-error">{goalError}</p>}

            {phase === 'idle' && (
              <button type="button" className="cta-button" onClick={startGoalFlow}>
                목표 시험일 정하기
              </button>
            )}

            {phase === 'searching' && (
              <div className="goal-searching">
                <div className="goal-spinner">
                  <div className="goal-spinner-dot" />
                  <div className="goal-spinner-dot" />
                  <div className="goal-spinner-dot" />
                </div>
                <span>AI가 시험일정을 확인하고 있어요...</span>
              </div>
            )}

            {phase === 'confirming' && (
              <div className="goal-confirm-card">
                <MarkdownText className="goal-suggested-text">{suggestedReply}</MarkdownText>
                <p className="goal-confirm-question">이 일정이 맞나요?</p>
                <div className="goal-confirm-actions">
                  <button type="button" className="cta-button" onClick={confirmSuggested}>
                    네, 맞아요
                  </button>
                  <button type="button" className="tag-button goal-relink" onClick={rejectSuggested}>
                    아니에요, 직접 입력할게요
                  </button>
                </div>
              </div>
            )}

            {phase === 'entering_date' && (
              <div className="goal-manual-date">
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
                <button type="button" className="cta-button" disabled={!manualDate} onClick={submitManualDate}>
                  이 날짜로 진행
                </button>
              </div>
            )}

            {(phase === 'confirmed' || phase === 'generating' || phase === 'done') && examGoal && (
              <div className="result-explain goal-confirmed">
                <span>목표 시험일: {examGoal.target_exam_date}</span>
                <button
                  type="button"
                  className="tag-button goal-relink"
                  onClick={() => {
                    setCurriculum(null)
                    setManualDate(examGoal.target_exam_date || '')
                    setPhase('entering_date')
                  }}
                >
                  다시 정하기
                </button>
              </div>
            )}
          </div>

          {phase === 'generating' && (
            <div className="goal-searching">
              <div className="goal-spinner">
                <div className="goal-spinner-dot" />
                <div className="goal-spinner-dot" />
                <div className="goal-spinner-dot" />
              </div>
              <span>
                AI가 일별 학습 계획을 만들고 있어요... ({generatingElapsed}초 경과)
                {generatingElapsed > 30 ? ' 목표일이 많이 남아있으면 몇 분 정도 걸릴 수 있어요.' : ''}
              </span>
            </div>
          )}
          {curriculumError && (
            <div className="goal-confirm-actions">
              <p className="plan-error">{curriculumError}</p>
              <button
                type="button"
                className="tag-button goal-relink"
                onClick={() => generateCurriculum(lastGoalIdRef.current)}
              >
                다시 시도
              </button>
            </div>
          )}

          {curriculum && (
            <div className="curriculum-weeks">
              {curriculum.weeks.map((week) => (
                <article className="plan-week" key={week.week_number}>
                  <h3>{week.week_number}주차 · {week.theme}</h3>
                  {week.days.map((day) => (
                    <div className="curriculum-day" key={day.day_id}>
                      <div className="curriculum-day-head">
                        <span>{day.date}</span>
                        <span>{day.planned_minutes}분</span>
                      </div>
                      <p className="curriculum-day-topic">{day.focus_topic}</p>
                      {day.summary && <p>{day.summary}</p>}
                      {day.study_tip && <p><strong>학습 팁:</strong> {day.study_tip}</p>}
                    </div>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      {phase === 'done' && (
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={confirmAndFinish}>
            확인
          </button>
        </div>
      )}
      <ConfirmModal
        open={!!pendingLeave}
        message="작성 중인 학습 플랜이 사라집니다. 나가시겠습니까?"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    </>
  )
}

export default LearningPlanView

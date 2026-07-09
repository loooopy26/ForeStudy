import { useState } from 'react'
import Header from './Header'
import { createCurriculum, getCertGoal, saveCertGoal, sendCertGoalChat } from './api'
import { SummaryIcon } from './icons'
import './Shell.css'

// idle -> searching -> confirming -> (yes) confirmed -> generating -> done
//                                  -> (no) entering_date -> confirmed -> generating -> done
function LearningPlanView({ onNavigate, certName, planData }) {
  const plan = planData?.plan
  const attemptId = planData?.attemptId
  const resolvedCertName = certName || plan?.certification_name || '선택한 자격증'

  const [phase, setPhase] = useState('idle')
  const [examGoal, setExamGoal] = useState(null)
  const [goalError, setGoalError] = useState('')
  const [suggestedReply, setSuggestedReply] = useState('')
  const [threadId, setThreadId] = useState(null)
  const [manualDate, setManualDate] = useState('')

  const [curriculum, setCurriculum] = useState(null)
  const [curriculumError, setCurriculumError] = useState('')

  const startGoalFlow = async () => {
    setGoalError('')
    setPhase('searching')
    try {
      const existing = await getCertGoal(resolvedCertName)
      if (existing?.found && existing.target_exam_date) {
        setExamGoal(existing)
        setPhase('confirmed')
        generateCurriculum(existing.goal_id)
        return
      }
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
      setPhase('confirmed')
      generateCurriculum(goal.goal_id)
    } catch (err) {
      setGoalError(err.message || '목표 시험일을 저장하지 못했습니다.')
      setPhase('entering_date')
    }
  }

  const generateCurriculum = async (goalId) => {
    if (!goalId || !attemptId) return
    setPhase('generating')
    setCurriculumError('')
    try {
      const created = await createCurriculum(goalId, attemptId)
      setCurriculum(created)
      setPhase('done')
    } catch (err) {
      setCurriculumError(err.message || '일별 학습 플랜 생성에 실패했습니다.')
      setPhase('confirmed')
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
      <Header title="학습 플랜" icon={<SummaryIcon />} onBack={() => onNavigate('profile')} />
      <div className="body-scroll">
        <section className="learning-plan-card">
          <h2>{plan.certification_name} 맞춤 학습 플랜</h2>
          <p>{plan.learner_level_summary}</p>
          <div className="result-explain">{plan.exam_schedule_note}</div>

          {plan.weekly_plan?.map((week) => (
            <article className="plan-week" key={week.week}>
              <h3>{week.week}주차 · {week.theme}</h3>
              <ul>
                {[...(week.goals || []), ...(week.study_tasks || []), ...(week.review_tasks || [])].slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {week.checkpoint && <p>{week.checkpoint}</p>}
            </article>
          ))}

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
                <p className="goal-suggested-text">{suggestedReply}</p>
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
                    setPhase('idle')
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
              <span>AI가 일별 학습 계획을 만들고 있어요...</span>
            </div>
          )}
          {curriculumError && <p className="plan-error">{curriculumError}</p>}

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
                      <ul>
                        {day.tasks.map((task, idx) => (
                          <li key={idx}>{task}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="cta-area">
        <button type="button" className="cta-button" onClick={() => onNavigate('profile')}>
          확인
        </button>
      </div>
    </>
  )
}

export default LearningPlanView

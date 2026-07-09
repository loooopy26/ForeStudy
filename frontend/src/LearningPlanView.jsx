import { useState } from 'react'
import Header from './Header'
import { createCurriculum, saveCertGoal } from './api'
import { SummaryIcon } from './icons'
import './Shell.css'

function LearningPlanView({ onNavigate, certName, planData }) {
  const [curriculum, setCurriculum] = useState(null)
  const [curriculumError, setCurriculumError] = useState('')
  const [creatingCurriculum, setCreatingCurriculum] = useState(false)

  const plan = planData?.plan
  const attemptId = planData?.attemptId

  const createDailyCurriculum = async () => {
    const targetDate = window.prompt('목표 시험일을 입력해 주세요 (YYYY-MM-DD)')
    if (!targetDate) return
    setCreatingCurriculum(true)
    setCurriculumError('')
    try {
      const goal = await saveCertGoal(certName || '선택한 자격증', targetDate)
      const created = await createCurriculum(goal.goal_id, attemptId)
      setCurriculum(created)
    } catch (err) {
      setCurriculumError(err.message || '일별 학습 플랜 생성에 실패했습니다.')
    } finally {
      setCreatingCurriculum(false)
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

          <button type="button" className="cta-button" disabled={creatingCurriculum} onClick={createDailyCurriculum}>
            {creatingCurriculum ? '일별 플랜 생성 중...' : '목표 시험일 정하고 일별 계획 만들기'}
          </button>
          {curriculumError && <div className="done-desc" style={{ color: 'oklch(0.55 0.15 25)' }}>{curriculumError}</div>}
          {curriculum && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', background: 'oklch(0.97 0 0)', padding: '12px', borderRadius: '8px' }}>
              {JSON.stringify(curriculum, null, 2)}
            </pre>
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

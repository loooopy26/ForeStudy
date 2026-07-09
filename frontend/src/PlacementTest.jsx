import { useEffect, useState } from 'react'
import Header from './Header'
import { createCurriculum, createLearningPlan, createPlacementQuiz, normalizeOptions, saveCertGoal, submitQuiz } from './api'
import { QuizIcon, CheckIcon } from './icons'
import './Shell.css'

const LETTERS = ['A', 'B', 'C', 'D']

function PlacementTest({ onNavigate, certName, materialId, placementQuiz }) {
  const [quiz, setQuiz] = useState(placementQuiz || null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(!placementQuiz)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [attemptId, setAttemptId] = useState(null)
  const [curriculum, setCurriculum] = useState(null)
  const [curriculumError, setCurriculumError] = useState('')
  const [creatingCurriculum, setCreatingCurriculum] = useState(false)

  useEffect(() => {
    let alive = true
    async function loadQuiz() {
      if (!materialId) {
        setError('학습 자료를 먼저 업로드해 주세요.')
        setLoading(false)
        return
      }
      if (placementQuiz) {
        setQuiz(placementQuiz)
        setLoading(false)
        return
      }
      try {
        const created = await createPlacementQuiz(materialId)
        if (alive) setQuiz(created)
      } catch (err) {
        if (alive) setError(err.message || '배치고사를 생성하지 못했습니다.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    loadQuiz()
    return () => {
      alive = false
    }
  }, [materialId, placementQuiz])

  const questions = quiz?.questions || []

  const selectOption = (optionIndex) => {
    if (!questions[idx]) return
    setAnswers((prev) => ({ ...prev, [questions[idx].question_id]: optionIndex }))
  }

  const next = async () => {
    if (!questions[idx]) return
    const isLast = idx >= questions.length - 1
    if (!isLast) {
      setIdx((value) => value + 1)
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const submitted = await submitQuiz(
        quiz.quiz_id,
        questions.map((question) => {
          const optionIndex = answers[question.question_id]
          const questionOptions = normalizeOptions(question.options)
          return {
            question_id: question.question_id,
            answer: optionIndex !== undefined ? questionOptions[optionIndex] ?? '' : '',
          }
        })
      )
      setResult(submitted)
      setAttemptId(submitted.attempt_id)
      const createdPlan = await createLearningPlan(submitted.attempt_id, certName || '선택한 자격증')
      setPlan(createdPlan.plan)
    } catch (err) {
      setError(err.message || '채점 또는 학습 플랜 생성에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

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

  if (loading || error || !quiz) {
    return (
      <>
        <Header title="배치고사" icon={<QuizIcon />} onBack={() => onNavigate('placementIntro', { cert: certName, materialId })} />
        <div className="done-screen">
          <div className="done-title">{loading ? '배치고사 생성 중' : '배치고사를 불러올 수 없어요'}</div>
          <div className="done-desc">{loading ? 'AI가 업로드한 학습 자료에서 객관식 10문제를 만들고 있습니다.' : error}</div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={() => onNavigate('certUpload', { cert: certName })}>
            자료 업로드로 돌아가기
          </button>
        </div>
      </>
    )
  }

  if (result) {
    return (
      <>
        <Header title="배치고사 결과" icon={<QuizIcon />} onBack={() => onNavigate('profile')} />
        <div className="body-scroll">
          <div className="done-screen inline">
            <div className="done-badge done-score">
              <span>{result.correct_count}</span>
              <span>/ {result.total_count}</span>
            </div>
            <div>
              <div className="done-title">학습 플랜 준비 완료</div>
              <div className="done-desc">
                현재 수준: {result.learning_evaluation?.mastery_level || '-'}
                <br />
                권장 난이도: {result.learning_evaluation?.recommended_difficulty || '-'}
              </div>
            </div>
          </div>

          {plan && (
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
          )}
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={() => onNavigate('profile')}>
            확인
          </button>
        </div>
      </>
    )
  }

  const current = questions[idx]
  const options = normalizeOptions(current.options)
  const selectedIndex = answers[current.question_id]
  const answered = selectedIndex !== undefined
  const isLast = idx >= questions.length - 1
  const progress = Math.round(((idx + 1) / questions.length) * 100)

  return (
    <>
      <Header title="배치고사" icon={<QuizIcon />} onBack={() => onNavigate('placementIntro', { cert: certName, materialId })} />

      <div className="body-scroll">
        <div className="progress-row">
          <div className="progress-top">
            <span className="progress-count">문제 {idx + 1} / {questions.length}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <p className="question-text">{current.question_text}</p>

        <div className="option-list">
          {options.map((text, i) => {
            const isSelected = selectedIndex === i
            return (
              <button
                key={`${current.question_id}-${i}`}
                type="button"
                className="option-button"
                style={{
                  borderColor: isSelected ? 'oklch(0.75 0.06 148)' : undefined,
                  background: isSelected ? 'oklch(0.93 0.03 148)' : undefined,
                }}
                onClick={() => selectOption(i)}
              >
                <span className={`option-mark ${isSelected ? 'check' : 'idle'}`}>
                  {isSelected && <CheckIcon />}
                </span>
                <span className="option-label">{LETTERS[i]}. {text}</span>
              </button>
            )
          })}
        </div>

        {error && <div className="done-desc" style={{ color: 'oklch(0.55 0.15 25)' }}>{error}</div>}
      </div>

      <div className="cta-area">
        <button type="button" className="cta-button" disabled={!answered || submitting} onClick={next}>
          {submitting ? '분석 중...' : isLast ? '결과 보기' : '다음 문제'}
        </button>
      </div>
    </>
  )
}

export default PlacementTest

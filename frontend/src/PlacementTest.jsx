import { useEffect, useState } from 'react'
import ConfirmModal from './ConfirmModal'
import Header from './Header'
import {
  createLearningPlan,
  createPlacementQuiz,
  deleteMaterial,
  deleteQuiz,
  normalizeOptions,
  submitQuiz,
} from './api'
import { QuizIcon, CheckIcon } from './icons'
import './Shell.css'

const LETTERS = ['A', 'B', 'C', 'D']
const IDK_LABEL = '이 문제는 잘 모르겠어요'

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
        if (alive) {
          setQuiz(created)
        } else {
          // 생성이 끝나기 전에 사용자가 이미 화면을 떠났다 — 방금 만들어진 퀴즈를 바로 정리한다.
          deleteQuiz(created.quiz_id).catch(() => {})
        }
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
  const [pendingLeave, setPendingLeave] = useState(null)

  const discardAndLeave = (page, payload) => {
    setPendingLeave({ page, payload })
  }

  const confirmLeave = () => {
    const { page, payload } = pendingLeave
    setPendingLeave(null)
    if (materialId) {
      deleteMaterial(materialId).catch(() => {})
    }
    onNavigate(page, payload)
  }

  const cancelLeave = () => setPendingLeave(null)

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

  // 채점 결과 화면을 따로 보여주고 확인을 누르게 하는 대신, 채점이 끝나고 학습
  // 플랜까지 준비되면 바로 이어서 학습 플랜 화면으로 넘어간다 — 현재 수준/권장
  // 난이도는 학습 플랜 화면에도 나오므로 여기서 따로 보여줄 필요가 없다. 몇 개
  // 맞혔는지(점수)는 학습 플랜 화면 쪽에서 계속 보여줄 수 있도록 같이 넘긴다.
  useEffect(() => {
    if (result && plan) {
      onNavigate('learningPlan', {
        planData: {
          plan,
          attemptId,
          score: { correctCount: result.correct_count, totalCount: result.total_count },
        },
      })
    }
  }, [result, plan, attemptId, onNavigate])

  if (loading || error || !quiz) {
    return (
      <>
        <Header title="배치고사" icon={<QuizIcon />} onBack={() => discardAndLeave('placementIntro', { cert: certName, materialId })} />
        <div className="done-screen">
          <div className="done-title">{loading ? '배치고사 생성 중' : '배치고사를 불러올 수 없어요'}</div>
          <div className="done-desc">{loading ? 'AI가 업로드한 학습 자료에서 객관식 10문제를 만들고 있습니다.' : error}</div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={() => discardAndLeave('certUpload', { cert: certName })}>
            자료 업로드로 돌아가기
          </button>
        </div>
        <ConfirmModal
          open={!!pendingLeave}
          message="작성 중인 배치고사가 사라집니다. 나가시겠습니까?"
          onConfirm={confirmLeave}
          onCancel={cancelLeave}
        />
      </>
    )
  }

  if (result) {
    // plan이 준비되는 즉시 위의 useEffect가 학습 플랜 화면으로 넘겨준다 — 여기는
    // 채점부터 학습 플랜이 나오기 직전까지의 짧은 전환 화면이다.
    return (
      <>
        <Header title="배치고사 결과" icon={<QuizIcon />} onBack={() => discardAndLeave('profile')} />
        <div className="body-scroll">
          <div className="done-screen inline">
            <div className="done-badge done-score">
              <span>{result.correct_count}</span>
              <span>/ {result.total_count}</span>
            </div>
            <div>
              <div className="done-title">학습 플랜 생성 중</div>
              <div className="done-desc">채점 결과를 바탕으로 맞춤 학습 플랜을 만들고 있어요.</div>
            </div>
          </div>
        </div>
        <ConfirmModal
          open={!!pendingLeave}
          message="작성 중인 배치고사가 사라집니다. 나가시겠습니까?"
          onConfirm={confirmLeave}
          onCancel={cancelLeave}
        />
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
      <Header title="배치고사" icon={<QuizIcon />} onBack={() => discardAndLeave('placementIntro', { cert: certName, materialId })} />

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
          {(() => {
            const idkIndex = options.length
            const isSelected = selectedIndex === idkIndex
            return (
              <button
                key={`${current.question_id}-idk`}
                type="button"
                className="option-button option-idk"
                style={{
                  borderColor: isSelected ? 'oklch(0.75 0.06 148)' : undefined,
                  background: isSelected ? 'oklch(0.93 0.03 148)' : undefined,
                }}
                onClick={() => selectOption(idkIndex)}
              >
                <span className={`option-mark ${isSelected ? 'check' : 'idle'}`}>
                  {isSelected && <CheckIcon />}
                </span>
                <span className="option-label">{IDK_LABEL}</span>
              </button>
            )
          })()}
        </div>

        {error && <div className="done-desc" style={{ color: 'oklch(0.55 0.15 25)' }}>{error}</div>}
      </div>

      <div className="cta-area">
        <button type="button" className="cta-button" disabled={!answered || submitting} onClick={next}>
          {submitting ? '분석 중...' : isLast ? '결과 보기' : '다음 문제'}
        </button>
      </div>
      <ConfirmModal
        open={!!pendingLeave}
        message="작성 중인 배치고사가 사라집니다. 나가시겠습니까?"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    </>
  )
}

export default PlacementTest

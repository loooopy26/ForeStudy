import { useEffect, useMemo, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { QuizIcon, CheckIcon, CrossIcon } from './icons'
import { apiRequest, getMaterialId, normalizeOptions, setLastAttemptId } from './api'
import './Shell.css'

const LETTERS = ['A', 'B', 'C', 'D']

function Quiz({ onNavigate }) {
  const materialId = useMemo(() => getMaterialId(), [])
  const [quiz, setQuiz] = useState(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadQuiz = async () => {
    if (!materialId) {
      setError('자료 ID가 필요합니다. localStorage에 forestudy_material_id를 저장하거나 VITE_MATERIAL_ID를 설정해 주세요.')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    setIdx(0)
    setAnswers({})
    try {
      const data = await apiRequest(`/api/materials/${materialId}/review-quiz`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setQuiz(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQuiz()
  }, [])

  const questions = quiz?.questions || []
  const current = questions[idx]
  const selected = answers[current?.question_id]
  const isShortAnswer = current?.question_type === 'short_answer'
  const answered = isShortAnswer ? Boolean(selected && selected.trim()) : selected !== undefined
  const isLast = idx >= questions.length - 1
  const progress = questions.length ? Math.round(((idx + 1) / questions.length) * 100) : 0

  const selectOption = (answer) => {
    if (!current) return
    setAnswers((prev) => ({ ...prev, [current.question_id]: answer }))
  }

  const submitQuiz = async () => {
    setSubmitting(true)
    setError('')
    try {
      const data = await apiRequest(`/api/quizzes/${quiz.quiz_id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: questions.map((question) => ({
            question_id: question.question_id,
            answer: answers[question.question_id] || '',
          })),
        }),
      })
      setLastAttemptId(data.attempt_id)
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    if (!answered || submitting) return
    if (isLast) submitQuiz()
    else setIdx((value) => value + 1)
  }

  if (loading || error || !quiz) {
    return (
      <>
        <Header title="AI 퀴즈" icon={<QuizIcon />} onBack={() => onNavigate('library')} />
        <div className="done-screen">
          <div className="done-title">{loading ? '퀴즈 생성 중' : '퀴즈를 불러올 수 없어요'}</div>
          <div className="done-desc">{loading ? 'AI가 학습자 수준에 맞춘 실전 문제를 만들고 있습니다.' : error}</div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={loadQuiz} disabled={loading}>
            다시 시도
          </button>
        </div>
        <BottomNav active="quiz" onNavigate={onNavigate} />
      </>
    )
  }

  if (result) {
    return (
      <>
        <Header title="AI 퀴즈" icon={<QuizIcon />} onBack={() => onNavigate('library')} />
        <div className="body-scroll">
          <div className="done-screen inline">
            <div className="done-badge done-score">
              <span>{result.correct_count}</span>
              <span>/ {result.total_count}</span>
            </div>
            <div>
              <div className="done-title">채점 완료</div>
              <div className="done-desc">
                점수 {result.score_pct}점
                {result.learning_evaluation && (
                  <>
                    <br />현재 수준: {result.learning_evaluation.mastery_level}
                    <br />다음 권장 난이도: {result.learning_evaluation.recommended_difficulty}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="result-list">
            {result.results.map((item) => (
              <div className="result-card" key={item.question_id}>
                <div className={`result-state ${item.is_correct ? 'correct' : 'wrong'}`}>
                  {item.is_correct ? <CheckIcon /> : <CrossIcon />}
                </div>
                <div>
                  <div className="result-question">{item.question_order}. {item.question_text}</div>
                  <div className="result-answer">내 답: {item.user_answer || '미응답'}</div>
                  <div className="result-answer">정답: {item.correct_answer}</div>
                  {item.explanation && <div className="result-explain">{item.explanation}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="cta-area tight">
          <button type="button" className="cta-button" onClick={loadQuiz}>
            새 퀴즈 풀기
          </button>
        </div>
        <BottomNav active="quiz" onNavigate={onNavigate} />
      </>
    )
  }

  const options = normalizeOptions(current.options)

  return (
    <>
      <Header title="AI 퀴즈" icon={<QuizIcon />} onBack={() => onNavigate('library')} />

      <div className="body-scroll">
        <div className="progress-row">
          <div className="progress-top">
            <span className="progress-count">문제 {idx + 1} / {questions.length}</span>
            <span className="progress-tag">{current.question_difficulty || 'normal'}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <p className="question-text">{current.question_text}</p>

        {isShortAnswer ? (
          <textarea
            className="option-button"
            style={{ width: '100%', minHeight: '96px', resize: 'vertical' }}
            placeholder="답을 입력하세요"
            value={selected || ''}
            onChange={(e) => selectOption(e.target.value)}
          />
        ) : (
          <>
            {options.length === 0 && (
              <div className="done-desc" style={{ color: 'oklch(0.55 0.15 25)' }}>
                이 문제의 선택지를 불러오지 못했습니다. 새 퀴즈 풀기로 다시 시도해 주세요.
              </div>
            )}

            <div className="option-list">
              {options.map((text, i) => {
                const isSelected = selected === text
                return (
                  <button
                    key={text}
                    type="button"
                    className="option-button"
                    style={{
                      borderColor: isSelected ? 'oklch(0.75 0.06 148)' : undefined,
                      background: isSelected ? 'oklch(0.93 0.03 148)' : undefined,
                    }}
                    onClick={() => selectOption(text)}
                  >
                    <span className={`option-mark ${isSelected ? 'check' : 'idle'}`}>
                      {isSelected && <CheckIcon />}
                    </span>
                    <span className="option-label">{LETTERS[i]}. {text}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="cta-area">
        <button type="button" className="cta-button" disabled={!answered || submitting} onClick={next}>
          {submitting ? '채점 중' : isLast ? '결과 보기' : '다음 문제'}
        </button>
      </div>

      <BottomNav active="quiz" onNavigate={onNavigate} />
    </>
  )
}

export default Quiz

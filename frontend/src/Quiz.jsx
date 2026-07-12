import { useEffect, useMemo, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { QuizIcon, CheckIcon, CrossIcon } from './icons'
import {
  apiRequest,
  clearQuizGenerating,
  clearQuizProgress,
  clearQuizResult,
  dismissQuizResult,
  getMaterialId,
  getQuizProgress,
  getQuizResult,
  isDailyQuizCompletionRequired,
  isDailyQuizUnlocked,
  isQuizGenerating,
  markQuizGenerating,
  normalizeOptions,
  saveQuizResult,
  setLastAttemptId,
  setQuizProgress,
  updateCurriculumDay,
} from './api'
import './Shell.css'

const LETTERS = ['A', 'B', 'C', 'D']

function Quiz({ onNavigate }) {
  const materialId = useMemo(() => getMaterialId(), [])
  const storedResult = useMemo(() => getQuizResult(materialId), [materialId])
  const initial = useMemo(() => getQuizProgress(materialId), [materialId])
  const [quiz, setQuiz] = useState(storedResult?.quiz || initial?.quiz || null)
  const [idx, setIdx] = useState(initial?.idx || 0)
  const [answers, setAnswers] = useState(initial?.answers || {})
  const [result, setResult] = useState(storedResult?.result || null)
  const [resultDismissed, setResultDismissed] = useState(storedResult?.dismissed || false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const quizLocked = isDailyQuizCompletionRequired(materialId) && !isDailyQuizUnlocked(materialId)

  const fetchQuiz = async () => {
    if (!materialId) {
      throw new Error('자격증을 먼저 설정해주세요.')
    }
    return apiRequest(`/api/materials/${materialId}/review-quiz`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  const startNewQuiz = async () => {
    clearQuizProgress(materialId)
    clearQuizResult(materialId)
    setResult(null)
    setResultDismissed(false)
    setIdx(0)
    setAnswers({})
    setQuiz(null)
    setLoading(true)
    setError('')
    try {
      const data = await fetchQuiz()
      setQuiz(data)
      setQuizProgress(materialId, data, {}, 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const goToReview = () => {
    dismissQuizResult(materialId)
    setResultDismissed(true)
    onNavigate('review')
  }

  // 이미 진행 중이거나(다른 화면 갔다 돌아온 경우) 오늘 이미 채점까지 끝난 퀴즈가
  // 있으면 그대로 이어서 보여주고, 아무것도 없을 때만 새로 생성한다. StrictMode의
  // mount→unmount→mount 이중 호출 시 두 번째 생성 요청이 첫 번째 응답을 덮어써
  // "문제가 갑자기 바뀌는" 현상을 막기 위해, 취소된(ignore) 쪽은 loading/error/quiz
  // 어느 것도 건드리지 않고 조용히 결과를 버린다.
  useEffect(() => {
    if (quiz || quizLocked) return
    let ignore = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        // Library.jsx가 오늘의 복습 퀴즈를 이미 백그라운드로 생성 중이면, 여기서 또
        // 새로 만들지 않고 그 결과가 저장될 때까지 기다렸다가 재사용한다 — 안 그러면
        // 같은 자료에 같은 주제로 퀴즈가 두 번 만들어진다.
        if (isQuizGenerating(materialId)) {
          for (let i = 0; i < 90 && !ignore; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            const progress = getQuizProgress(materialId)
            if (progress?.quiz) {
              if (!ignore) {
                setQuiz(progress.quiz)
                setLoading(false)
              }
              return
            }
            if (!isQuizGenerating(materialId)) break
          }
        }
        if (ignore) return
        // 여기까지 왔다면 아무도 생성 중이 아니었다는 뜻 — 지금부터 우리가 생성하니,
        // Library.jsx가 뒤늦게 같은 자료로 또 생성을 시작하지 않도록 표시를 남긴다.
        markQuizGenerating(materialId)
        try {
          const data = await fetchQuiz()
          // StrictMode가 이 실행을 취소했더라도(ignore=true) 이미 받은 결과는 버리지
          // 않고 공유 캐시에 저장해둔다 — 그래야 두 번째 mount(또는 대기 중이던 다른
          // 화면)가 이 결과를 재사용하고, 또 새로 생성하지 않는다.
          setQuizProgress(materialId, data, {}, 0)
          if (ignore) return
          setQuiz(data)
        } finally {
          clearQuizGenerating(materialId)
        }
      } catch (err) {
        if (!ignore) setError(err.message)
      } finally {
        if (!ignore) setLoading(false)
      }
    })()
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (quiz && !result) setQuizProgress(materialId, quiz, answers, idx)
  }, [materialId, quiz, answers, idx, result])

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
          answers: questions.map((question) => {
            const value = answers[question.question_id]
            if (question.question_type === 'short_answer') {
              return { question_id: question.question_id, answer: value || '' }
            }
            const questionOptions = normalizeOptions(question.options)
            return { question_id: question.question_id, answer: value !== undefined ? questionOptions[value] ?? '' : '' }
          }),
        }),
      })
      setLastAttemptId(data.attempt_id)
      if (data.correct_count === data.total_count && isDailyQuizUnlocked(materialId) && quiz.plan_scope?.day_id) {
        updateCurriculumDay(quiz.plan_scope.day_id, { progress_status: 'completed' }).catch(() => {})
      }
      setResult(data)
      setResultDismissed(false)
      saveQuizResult(materialId, quiz, data)
      clearQuizProgress(materialId)
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

  if (quizLocked) {
    return (
      <>
        <Header title="AI 퀴즈" icon={<QuizIcon />} onBack={() => onNavigate('library')} />
        <div className="done-screen">
          <div className="done-title">타이머를 완료하면 풀 수 있어요</div>
          <div className="done-desc">오늘의 학습 시간을 모두 채운 뒤 AI 퀴즈를 시작해 주세요. 퀴즈는 미리 준비해 두었어요.</div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={() => onNavigate('library')}>도서관으로 돌아가기</button>
        </div>
        <BottomNav active="quiz" onNavigate={onNavigate} />
      </>
    )
  }

  // 오늘 이미 채점까지 마친 퀴즈를 "복습하기로 이동하기"로 확인하고 온 경우 —
  // 매번 새로 생성하지 않고 간단한 안내만 보여준다. 더 풀고 싶으면 새로 만든다.
  if (result && resultDismissed) {
    return (
      <>
        <Header title="AI 퀴즈" icon={<QuizIcon />} onBack={() => onNavigate('library')} />
        <div className="done-screen">
          <div className="done-title">오늘의 AI 퀴즈를 풀었습니다</div>
          <div className="done-desc">
            점수 {result.score_pct}점 · {result.correct_count}/{result.total_count}개 정답
            <br />더 풀어보고 싶으면 새 문제를 만들어드릴게요.
          </div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={startNewQuiz}>
            새 문제 더 풀기
          </button>
        </div>
        <BottomNav active="quiz" onNavigate={onNavigate} />
      </>
    )
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
          <button type="button" className="cta-button" onClick={startNewQuiz} disabled={loading}>
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
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="explain-box">복습하기 탭에서 오답 노트와 유사 문제를 확인할 수 있어요.</div>

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
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={goToReview}>
            복습하기로 이동하기
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
        {submitting ? (
          <div className="goal-searching">
            <div className="goal-spinner">
              <div className="goal-spinner-dot" />
              <div className="goal-spinner-dot" />
              <div className="goal-spinner-dot" />
            </div>
            <span>AI가 채점하고 해설을 정리하고 있어요. 잠시만 기다려 주세요...</span>
          </div>
        ) : (
          <>
            {quiz?.plan_scope && (
              <section className="quiz-plan-scope" aria-label="오늘의 학습 범위">
                <span>오늘의 학습 범위</span>
                <strong>{quiz.plan_scope.focus_topic}</strong>
              </section>
            )}

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
                className="short-answer-input"
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
                    const isSelected = selected === i
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
              </>
            )}
          </>
        )}
      </div>

      {!submitting && (
        <div className="cta-area">
          <button type="button" className="cta-button" disabled={!answered} onClick={next}>
            {isLast ? '결과 보기' : '다음 문제'}
          </button>
        </div>
      )}

      <BottomNav active="quiz" onNavigate={onNavigate} />
    </>
  )
}

export default Quiz

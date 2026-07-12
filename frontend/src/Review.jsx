import { useEffect, useMemo, useRef, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { CheckIcon, CrossIcon, ReviewIcon } from './icons'
import { apiRequest, getMaterialAttempts, getMaterialId, normalizeOptions, recordQuestEvent, setLastAttemptId } from './api'
import './Shell.css'

const LETTERS = ['A', 'B', 'C', 'D']

function formatDateHeading(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

function formatTime(isoStr) {
  const d = new Date(isoStr)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(attempts) {
  const groups = []
  const byDate = new Map()
  for (const attempt of attempts) {
    if (!byDate.has(attempt.date)) {
      const group = { date: attempt.date, attempts: [] }
      byDate.set(attempt.date, group)
      groups.push(group)
    }
    byDate.get(attempt.date).attempts.push(attempt)
  }
  return groups
}

function Review({ onNavigate }) {
  const materialId = useMemo(() => getMaterialId(), [])

  const [view, setView] = useState('dates')
  const [attempts, setAttempts] = useState(null)
  const [notes, setNotes] = useState([])
  const [selectedAttemptId, setSelectedAttemptId] = useState(null)
  const [expandedNoteId, setExpandedNoteId] = useState(null)
  const [quiz, setQuiz] = useState(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 })
  const [submitting, setSubmitting] = useState(false)
  const similarQuizAbortRef = useRef(null)
  const similarQuizPollRef = useRef(null)
  const errorBoxRef = useRef(null)

  // 오류 배너가 화면 맨 위에 있어서, 문제 목록 아래쪽에서 "이 회차 복습하기"를 누른
  // 채로 실패하면 스크롤을 올리지 않는 한 실패 메시지 자체를 못 보고 "아무 반응이
  // 없다"고 오해하기 쉬웠다(실제 재현 확인됨) — 에러가 뜨면 그 위치로 스크롤한다.
  useEffect(() => {
    if (error) errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [error])

  const loadAttempts = async () => {
    if (!materialId) {
      setError('자료 ID가 필요합니다. 도서관에서 자료를 먼저 선택해 주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await getMaterialAttempts(materialId)
      setAttempts(data.attempts || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAttempts()
  }, [])

  // 다른 탭으로 이동하는 등 화면 자체가 언마운트되는 경우에도 폴링/요청이 새어나가지 않게 정리.
  useEffect(() => {
    return () => {
      if (similarQuizPollRef.current) clearInterval(similarQuizPollRef.current)
      if (similarQuizAbortRef.current) similarQuizAbortRef.current.abort()
    }
  }, [])

  const selectAttempt = async (attemptId) => {
    setLoading(true)
    setError('')
    setExpandedNoteId(null)
    try {
      const data = await apiRequest(`/api/attempts/${attemptId}/answers?only=all`)
      setNotes(data.answers || [])
      setSelectedAttemptId(attemptId)
      setView('notes')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 유사 문제 생성이 진행 중일 때 화면을 벗어나면 요청을 취소한다 — 안 그러면 뒤로가기를
  // 눌러도 생성이 백그라운드에서 계속 진행되다가, 완료되는 순간 사용자가 이미 떠난 화면을
  // 무시하고 강제로 퀴즈 화면으로 이동시켜버리는 문제가 있었다(실제 재현 확인됨).
  const cancelSimilarQuizGeneration = () => {
    if (similarQuizPollRef.current) {
      clearInterval(similarQuizPollRef.current)
      similarQuizPollRef.current = null
    }
    if (similarQuizAbortRef.current) {
      similarQuizAbortRef.current.abort()
      similarQuizAbortRef.current = null
    }
    setGenerating(false)
    setGenProgress({ done: 0, total: 0 })
  }

  const backToNotes = () => {
    cancelSimilarQuizGeneration()
    setView('notes')
    setQuiz(null)
    setResult(null)
    setIdx(0)
    setAnswers({})
  }

  const backToDates = () => {
    cancelSimilarQuizGeneration()
    setView('dates')
    setExpandedNoteId(null)
    setQuiz(null)
    setResult(null)
    setIdx(0)
    setAnswers({})
  }

  const startSimilarQuiz = async () => {
    if (!selectedAttemptId) return
    const attemptId = selectedAttemptId
    const controller = new AbortController()
    similarQuizAbortRef.current = controller
    setGenerating(true)
    setGenProgress({ done: 0, total: 0 })
    setError('')
    setResult(null)
    setIdx(0)
    setAnswers({})

    similarQuizPollRef.current = setInterval(async () => {
      try {
        const p = await apiRequest(`/api/attempts/${attemptId}/similar-quiz/progress`)
        if (!controller.signal.aborted) setGenProgress({ done: p.done, total: p.total })
      } catch {
        // 폴링 실패는 무시 — 다음 틱에서 다시 시도된다.
      }
    }, 1000)

    try {
      const data = await apiRequest(`/api/attempts/${attemptId}/similar-quiz`, {
        method: 'POST',
        body: JSON.stringify({}),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setQuiz(data)
      setView('quiz')
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err.message)
    } finally {
      if (similarQuizPollRef.current) {
        clearInterval(similarQuizPollRef.current)
        similarQuizPollRef.current = null
      }
      if (!controller.signal.aborted) setGenerating(false)
    }
  }

  const questions = quiz?.questions || []
  const current = questions[idx]
  const selected = current ? answers[current.question_id] : undefined
  const answered = selected !== undefined
  const isLast = idx >= questions.length - 1
  const progress = questions.length ? Math.round(((idx + 1) / questions.length) * 100) : 0

  const selectOption = (answer) => {
    if (!current) return
    setAnswers((prev) => ({ ...prev, [current.question_id]: answer }))
  }

  const submitSimilarQuiz = async () => {
    if (!quiz) return
    setSubmitting(true)
    setError('')
    try {
      const data = await apiRequest(`/api/quizzes/${quiz.quiz_id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: questions.map((question) => {
            const optionIndex = answers[question.question_id]
            const questionOptions = normalizeOptions(question.options)
            return {
              question_id: question.question_id,
              answer: optionIndex !== undefined ? questionOptions[optionIndex] ?? '' : '',
            }
          }),
        }),
      })
      setLastAttemptId(data.attempt_id)
      if (selectedAttemptId) {
        // 유사문제를 맞히면 원본 문항이 정답 처리되므로, 오답노트 목록과 지난 응시 기록의
        // "숙지가 덜 된 부분" 배지를 최신 상태로 다시 받아온다.
        const refreshed = await apiRequest(`/api/attempts/${selectedAttemptId}/answers?only=all`)
        setNotes(refreshed.answers || [])
        loadAttempts()
      }
      setResult(data)
      const masteredCount = data.mastered_source_question_ids?.length || 0
      for (let index = 0; index < masteredCount; index += 1) {
        recordQuestEvent('daily-review')
        recordQuestEvent('weekly-review')
      }
      setView('result')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const next = () => {
    if (!answered || submitting) return
    if (isLast) submitSimilarQuiz()
    else setIdx((value) => value + 1)
  }

  const headerBack = view === 'dates' ? () => onNavigate('library') : view === 'notes' ? backToDates : backToNotes

  return (
    <>
      <Header title="복습하기" icon={<ReviewIcon />} onBack={headerBack} />

      <div className="body-scroll">
        {error && (
          <div className="explain-box error" ref={errorBoxRef}>
            {error}
          </div>
        )}

        {view === 'dates' && (
          <div className="note-panel">
            <div className="note-title">지난 응시 기록</div>
            {loading && <div className="note-empty">불러오는 중...</div>}
            {!loading && !error && (attempts || []).length === 0 && (
              <div className="note-empty">지난 응시 기록이 없습니다. 먼저 AI 퀴즈를 풀어보세요.</div>
            )}
            {!loading && !error && (
              <div className="history-list">
                {groupByDate(attempts || []).map((group) => (
                  <div key={group.date}>
                    <div className="history-date-heading">{formatDateHeading(group.date)}</div>
                    {group.attempts.map((attempt) => (
                      <button
                        type="button"
                        key={attempt.attempt_id}
                        className="history-item"
                        onClick={() => selectAttempt(attempt.attempt_id)}
                      >
                        <span className="history-item-time">{attempt.focus_topic || formatTime(attempt.submitted_at)}</span>
                        <span>
                          {attempt.wrong_count > 0 ? (
                            <span className="history-item-wrong">숙지가 덜 된 부분 {attempt.wrong_count}개</span>
                          ) : (
                            <span className="history-item-mastered">숙지 완료</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'notes' && (
          <div className="note-panel">
            <button type="button" className="history-back" onClick={backToDates}>
              날짜 목록으로
            </button>
            <div className="note-title">오답노트</div>
            <div className="note-list">
              {notes.length === 0 ? (
                <div className="note-empty">이 회차에는 문제 기록이 없습니다.</div>
              ) : (
                notes.map((note, index) => {
                  const solved = note.is_correct || note.mastered
                  const expanded = expandedNoteId === note.question_id
                  return (
                    <button
                      type="button"
                      className={`note-card${expanded ? ' expanded' : ''}${solved ? ' note-card-solved' : ''}`}
                      key={note.question_id}
                      onClick={() => setExpandedNoteId((value) => (value === note.question_id ? null : note.question_id))}
                    >
                      <div className="note-question">
                        <span className={`note-status-icon ${solved ? 'correct' : 'wrong'}`}>
                          {solved ? <CheckIcon size={13} /> : <CrossIcon size={11} />}
                        </span>
                        <span>{index + 1}. {note.question_text}</span>
                        <span className="note-question-chevron">›</span>
                      </div>
                      {expanded && (
                        <div className="note-detail">
                          {note.mastered ? (
                            <>
                              <span className="note-mastered-tag">유사 문제로 정답 전환</span>
                              <div className="note-answer muted">처음 답안: {note.user_answer || '미응답'}</div>
                            </>
                          ) : (
                            <div className={`note-answer ${solved ? 'correct' : 'wrong'}`}>내 답: {note.user_answer || '미응답'}</div>
                          )}
                          <div className="note-answer correct">정답: {note.correct_answer}</div>
                          {note.explanation && (
                            <div className="note-analysis">
                              <strong>{solved ? '정답 해설' : '왜 틀렸을까?'}</strong>
                              <span>{note.explanation}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            {notes.some((note) => !note.is_correct && !note.mastered) ? (
              <>
                <button type="button" className="cta-button" onClick={startSimilarQuiz} disabled={generating}>
                  {generating
                    ? genProgress.total > 0
                      ? `AI가 비슷한 문제를 만드는 중... (${genProgress.done}/${genProgress.total})`
                      : 'AI가 비슷한 문제를 만드는 중...'
                    : '이 회차 복습하기'}
                </button>
                {generating && genProgress.total > 0 && (
                  <div className="progress-track similar-quiz-progress">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.round((genProgress.done / genProgress.total) * 100)}%` }}
                    />
                  </div>
                )}
              </>
            ) : (
              notes.length > 0 && <div className="note-mastered-banner">이 회차 문제를 모두 숙지했어요!</div>
            )}
          </div>
        )}

        {view === 'quiz' && current && submitting && (
          <div className="goal-searching">
            <div className="goal-spinner">
              <div className="goal-spinner-dot" />
              <div className="goal-spinner-dot" />
              <div className="goal-spinner-dot" />
            </div>
            <span>AI가 채점하고 해설을 정리하고 있어요. 잠시만 기다려 주세요...</span>
          </div>
        )}

        {view === 'quiz' && current && !submitting && (
          <>
            <div className="progress-row">
              <div className="progress-top">
                <span className="progress-count">복습 문제 {idx + 1} / {questions.length}</span>
                <span className="progress-tag">오답 유사문제</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <p className="question-text">{current.question_text}</p>

            <div className="option-list">
              {normalizeOptions(current.options).map((text, optionIndex) => {
                const isSelected = selected === optionIndex
                return (
                  <button
                    key={`${current.question_id}-${optionIndex}`}
                    type="button"
                    className="option-button"
                    style={{
                      borderColor: isSelected ? 'oklch(0.75 0.06 148)' : undefined,
                      background: isSelected ? 'oklch(0.93 0.03 148)' : undefined,
                    }}
                    onClick={() => selectOption(optionIndex)}
                  >
                    <span className={`option-mark ${isSelected ? 'check' : 'idle'}`}>
                      {isSelected && <CheckIcon />}
                    </span>
                    <span className="option-label">{LETTERS[optionIndex]}. {text}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {view === 'result' && result && (
          <>
            <div className="done-screen inline">
              <div className="done-badge done-score">
                <span>{result.correct_count}</span>
                <span>/ {result.total_count}</span>
              </div>
              <div>
                <div className="done-title">복습 채점 완료</div>
                <div className="done-desc">
                  맞힌 유사문제와 연결된 기존 오답 {result.mastered_source_question_ids?.length || 0}개를 정답으로 처리했습니다.
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
          </>
        )}
      </div>

      {view === 'quiz' && !submitting && (
        <div className="cta-area">
          <button type="button" className="cta-button" disabled={!answered} onClick={next}>
            {isLast ? '결과 보기' : '다음 문제'}
          </button>
        </div>
      )}
      {view === 'result' && (
        <div className="cta-area tight">
          <button type="button" className="cta-button" onClick={backToNotes}>
            오답노트로 돌아가기
          </button>
        </div>
      )}

      <BottomNav active="review" onNavigate={onNavigate} />
    </>
  )
}

export default Review

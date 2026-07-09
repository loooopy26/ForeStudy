import { useEffect, useMemo, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { CheckIcon, CrossIcon, ReviewIcon } from './icons'
import { apiRequest, getMaterialAttempts, getMaterialId, normalizeOptions, setLastAttemptId } from './api'
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
  const [submitting, setSubmitting] = useState(false)

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

  const selectAttempt = async (attemptId) => {
    setLoading(true)
    setError('')
    setExpandedNoteId(null)
    try {
      const data = await apiRequest(`/api/attempts/${attemptId}/wrong-notes`)
      setNotes(data.wrong_notes || [])
      setSelectedAttemptId(attemptId)
      setView('notes')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const backToNotes = () => {
    setView('notes')
    setQuiz(null)
    setResult(null)
    setIdx(0)
    setAnswers({})
  }

  const backToDates = () => {
    setView('dates')
    setExpandedNoteId(null)
    setQuiz(null)
    setResult(null)
    setIdx(0)
    setAnswers({})
  }

  const startSimilarQuiz = async () => {
    if (!selectedAttemptId) return
    setGenerating(true)
    setError('')
    setResult(null)
    setIdx(0)
    setAnswers({})
    try {
      const data = await apiRequest(`/api/attempts/${selectedAttemptId}/similar-quiz`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setQuiz(data)
      setView('quiz')
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
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
          answers: questions.map((question) => ({
            question_id: question.question_id,
            answer: answers[question.question_id] || '',
          })),
        }),
      })
      setLastAttemptId(data.attempt_id)
      const mastered = new Set(data.mastered_wrong_note_ids || [])
      if (mastered.size > 0) {
        setNotes((prev) => prev.filter((note) => !mastered.has(note.wrong_note_id)))
      }
      setResult(data)
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
        {error && <div className="explain-box">{error}</div>}

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
                        <span className="history-item-time">{formatTime(attempt.submitted_at)}</span>
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
                <div className="note-empty">이 회차에는 남은 오답이 없습니다.</div>
              ) : (
                notes.map((note, index) => {
                  const expanded = expandedNoteId === note.wrong_note_id
                  return (
                    <button
                      type="button"
                      className={`note-card${expanded ? ' expanded' : ''}`}
                      key={note.wrong_note_id}
                      onClick={() => setExpandedNoteId((value) => (value === note.wrong_note_id ? null : note.wrong_note_id))}
                    >
                      <div className="note-question">
                        <span>{index + 1}. {note.question_text}</span>
                        <span className="note-question-chevron">›</span>
                      </div>
                      {expanded && (
                        <div className="note-detail">
                          <div className="note-answer wrong">내 답: {note.user_answer || '미응답'}</div>
                          <div className="note-answer correct">정답: {note.correct_answer}</div>
                          {note.mistake_analysis && (
                            <div className="note-analysis">
                              <strong>왜 틀렸을까?</strong>
                              <span>{note.mistake_analysis}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
            {notes.length > 0 && (
              <button type="button" className="cta-button" onClick={startSimilarQuiz} disabled={generating}>
                {generating ? 'AI가 비슷한 문제를 만드는 중...' : '이 회차 복습하기'}
              </button>
            )}
          </div>
        )}

        {view === 'quiz' && current && (
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
                  맞힌 유사문제와 연결된 기존 오답 {result.mastered_wrong_note_ids?.length || 0}개를 오답노트에서 지웠습니다.
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

      {view === 'quiz' && (
        <div className="cta-area">
          <button type="button" className="cta-button" disabled={!answered || submitting} onClick={next}>
            {submitting ? '채점 중...' : isLast ? '결과 보기' : '다음 문제'}
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

import { useEffect, useMemo, useRef, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { ReviewIcon, CheckIcon, CrossIcon, CheckBigIcon } from './icons'
import { apiRequest, getLastAttemptId, getMaterialAttempts, getMaterialId, normalizeOptions } from './api'
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
  const [attemptId] = useState(() => getLastAttemptId())
  const [session, setSession] = useState(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const startedAtRef = useRef(Date.now())

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyView, setHistoryView] = useState('dates')
  const [historyAttempts, setHistoryAttempts] = useState(null)
  const [historyNotes, setHistoryNotes] = useState([])
  const [historyAttemptId, setHistoryAttemptId] = useState(null)
  const [expandedNoteId, setExpandedNoteId] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const startReview = async (targetAttemptId) => {
    const useAttemptId = targetAttemptId || attemptId
    if (!useAttemptId) {
      setError('먼저 AI 퀴즈를 풀어야 지난 오답으로 복습할 수 있어요.')
      return
    }
    setLoading(true)
    setError('')
    setDone(false)
    setIdx(0)
    setSelected(null)
    setFeedback(null)
    try {
      const data = await apiRequest(`/api/attempts/${useAttemptId}/review/start`, {
        method: 'POST',
        body: JSON.stringify({ time_limit_seconds_per_question: 120 }),
      })
      setSession(data)
      setHistoryOpen(false)
      startedAtRef.current = Date.now()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openHistory = async () => {
    const opening = !historyOpen
    setHistoryOpen(opening)
    if (!opening) return
    setHistoryView('dates')
    if (historyAttempts) return
    if (!materialId) {
      setHistoryError('자료 ID가 필요합니다.')
      return
    }
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const data = await getMaterialAttempts(materialId)
      setHistoryAttempts(data.attempts || [])
    } catch (err) {
      setHistoryError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  const selectHistoryAttempt = async (targetAttemptId) => {
    setHistoryLoading(true)
    setHistoryError('')
    setExpandedNoteId(null)
    try {
      const data = await apiRequest(`/api/attempts/${targetAttemptId}/wrong-notes`)
      setHistoryNotes(data.wrong_notes || [])
      setHistoryAttemptId(targetAttemptId)
      setHistoryView('notes')
    } catch (err) {
      setHistoryError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  const toggleNoteExpanded = (noteId) => {
    setExpandedNoteId((current) => (current === noteId ? null : noteId))
  }

  useEffect(() => {
    startReview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items = session?.items || []
  const current = items[idx]
  const isLast = idx >= items.length - 1
  const progress = items.length ? Math.round(((idx + 1) / items.length) * 100) : 0

  const selectOption = async (answer) => {
    if (!current || feedback) return
    setSelected(answer)
    const elapsed = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000))
    try {
      const data = await apiRequest(`/api/review-sessions/${session.review_session_id}/items/${current.review_item_id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answer, elapsed_seconds: elapsed }),
      })
      setFeedback(data)
    } catch (err) {
      setError(err.message)
    }
  }

  const next = () => {
    if (!feedback) return
    if (isLast) {
      setDone(true)
      return
    }
    setIdx((value) => value + 1)
    setSelected(null)
    setFeedback(null)
    startedAtRef.current = Date.now()
  }

  const historyPanel = historyOpen && (
    <div className="note-panel">
      {historyView === 'notes' && (
        <button type="button" className="history-back" onClick={() => setHistoryView('dates')}>
          ← 날짜 목록으로
        </button>
      )}
      <div className="note-title">{historyView === 'dates' ? '지난 응시 기록' : '오답노트'}</div>

      {historyLoading && <div className="note-empty">불러오는 중...</div>}
      {historyError && <div className="note-empty">{historyError}</div>}

      {!historyLoading && !historyError && historyView === 'dates' && (
        <div className="history-list">
          {(historyAttempts || []).length === 0 && <div className="note-empty">지난 응시 기록이 없습니다.</div>}
          {groupByDate(historyAttempts || []).map((group) => (
            <div key={group.date}>
              <div className="history-date-heading">{formatDateHeading(group.date)}</div>
              {group.attempts.map((attempt) => (
                <button
                  type="button"
                  key={attempt.attempt_id}
                  className="history-item"
                  onClick={() => selectHistoryAttempt(attempt.attempt_id)}
                >
                  <span className="history-item-time">{formatTime(attempt.submitted_at)}</span>
                  <span>
                    <span className="history-item-score">{attempt.correct_count}/{attempt.total_count}</span>
                    {attempt.wrong_count > 0 && <span className="history-item-wrong">오답 {attempt.wrong_count}개</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {!historyLoading && !historyError && historyView === 'notes' && (
        <>
          <div className="note-list">
            {historyNotes.length === 0 ? (
              <div className="note-empty">이 회차에는 오답이 없습니다.</div>
            ) : (
              historyNotes.map((note, index) => {
                const expanded = expandedNoteId === note.wrong_note_id
                return (
                  <button
                    type="button"
                    className={`note-card${expanded ? ' expanded' : ''}`}
                    key={note.wrong_note_id}
                    onClick={() => toggleNoteExpanded(note.wrong_note_id)}
                  >
                    <div className="note-question">
                      <span>{index + 1}. {note.question_text}</span>
                      <span className="note-question-chevron">▸</span>
                    </div>
                    {expanded && (
                      <div className="note-detail">
                        <div className="note-answer wrong">내 답: {note.user_answer || '미응답'}</div>
                        <div className="note-answer correct">정답: {note.correct_answer}</div>
                        {note.explanation && <div className="note-explain">{note.explanation}</div>}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
          {historyNotes.length > 0 && (
            <button type="button" className="cta-button" onClick={() => startReview(historyAttemptId)}>
              이 회차 복습하기
            </button>
          )}
        </>
      )}
    </div>
  )

  if (loading || error || !session) {
    return (
      <>
        <Header title="복습하기" icon={<ReviewIcon />} onBack={() => onNavigate('library')} />
        <div className="done-screen">
          <div className="done-title">{loading ? '복습 준비 중' : '복습할 오답이 없어요'}</div>
          <div className="done-desc">{loading ? '지난 퀴즈의 오답을 불러오고 있습니다.' : error}</div>
        </div>
        <div className="cta-area tight">
          <button type="button" className="cta-button" onClick={() => startReview()} disabled={loading}>
            다시 불러오기
          </button>
        </div>
        <BottomNav active="review" onNavigate={onNavigate} />
      </>
    )
  }

  if (done) {
    return (
      <>
        <Header title="복습하기" icon={<ReviewIcon />} onBack={() => onNavigate('library')} />
        <div className="done-screen">
          <div className="done-badge done-check">
            <CheckBigIcon />
          </div>
          <div>
            <div className="done-title">복습 완료!</div>
            <div className="done-desc">
              지난 오답 {items.length}문제를 다시 확인했어요.
              <br />오답노트에서 남은 항목을 계속 점검할 수 있습니다.
            </div>
          </div>
        </div>
        <div className="cta-area tight">
          <button type="button" className="cta-button" onClick={() => startReview()}>
            다시 복습하기
          </button>
        </div>
        <BottomNav active="review" onNavigate={onNavigate} />
      </>
    )
  }

  const options = normalizeOptions(current.options)

  return (
    <>
      <Header title="복습하기" icon={<ReviewIcon />} onBack={() => onNavigate('library')} />

      <div className="body-scroll">
        <div className="progress-row">
          <div className="progress-top">
            <span className="progress-count">복습 {idx + 1} / {items.length}</span>
            <button type="button" className="progress-tag tag-button" onClick={openHistory}>
              지난번 오답
            </button>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {historyPanel}

        <p className="question-text">{current.question_text}</p>

        {options.length === 0 && (
          <div className="done-desc" style={{ color: 'oklch(0.55 0.15 25)' }}>
            이 문제의 선택지를 불러오지 못했습니다.
          </div>
        )}

        <div className="option-list">
          {options.map((text, i) => {
            const isCorrect = feedback && text === feedback.correct_answer
            const isWrongPick = feedback && selected === text && !isCorrect
            let background
            let borderColor
            let color
            let mark = 'idle'
            if (isCorrect) {
              background = 'oklch(0.93 0.03 148)'
              borderColor = 'oklch(0.75 0.06 148)'
              mark = 'check'
            } else if (isWrongPick) {
              background = 'oklch(0.95 0.03 25)'
              borderColor = 'oklch(0.8 0.08 25)'
              color = 'oklch(0.45 0.1 25)'
              mark = 'cross'
            }
            return (
              <button
                key={text}
                type="button"
                className="option-button"
                style={{ background, borderColor, cursor: feedback ? 'default' : 'pointer' }}
                onClick={() => selectOption(text)}
              >
                <span className={`option-mark ${mark}`}>
                  {mark === 'check' && <CheckIcon />}
                  {mark === 'cross' && <CrossIcon />}
                </span>
                <span className="option-label" style={{ color }}>{LETTERS[i]}. {text}</span>
              </button>
            )
          })}
        </div>

        {feedback && (
          <div className="explain-box">
            {feedback.is_correct ? '정답입니다.' : '다시 확인해 볼 문제예요.'}
            {feedback.timed_out && ' 제한 시간을 초과했습니다.'}
            {feedback.explanation && <><br />{feedback.explanation}</>}
          </div>
        )}
      </div>

      <div className="cta-area tight">
        <button type="button" className="cta-button" disabled={!feedback} onClick={next}>
          {isLast ? '복습 완료' : '다음 문제'}
        </button>
      </div>

      <BottomNav active="review" onNavigate={onNavigate} />
    </>
  )
}

export default Review

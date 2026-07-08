import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { ReviewIcon, CheckIcon, CrossIcon, CheckBigIcon } from './icons'
import { apiRequest, getLastAttemptId, normalizeOptions } from './api'
import './Shell.css'

const LETTERS = ['A', 'B', 'C', 'D']

function Review({ onNavigate }) {
  const [attemptId] = useState(() => getLastAttemptId())
  const [session, setSession] = useState(null)
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [done, setDone] = useState(false)
  const [notes, setNotes] = useState([])
  const [showNotes, setShowNotes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const startedAtRef = useRef(Date.now())

  const startReview = async () => {
    if (!attemptId) {
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
      const data = await apiRequest(`/api/attempts/${attemptId}/review/start`, {
        method: 'POST',
        body: JSON.stringify({ time_limit_seconds_per_question: 120 }),
      })
      setSession(data)
      startedAtRef.current = Date.now()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadWrongNotes = async () => {
    if (!attemptId) {
      setError('지난번 오답을 보려면 먼저 AI 퀴즈를 풀어야 합니다.')
      return
    }
    setError('')
    try {
      const data = await apiRequest(`/api/attempts/${attemptId}/wrong-notes`)
      setNotes(data.wrong_notes || [])
      setShowNotes((value) => !value)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    startReview()
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

  if (loading || error || !session) {
    return (
      <>
        <Header title="복습하기" icon={<ReviewIcon />} onBack={() => onNavigate('library')} />
        <div className="done-screen">
          <div className="done-title">{loading ? '복습 준비 중' : '복습할 오답이 없어요'}</div>
          <div className="done-desc">{loading ? '지난 퀴즈의 오답을 불러오고 있습니다.' : error}</div>
        </div>
        <div className="cta-area tight">
          <button type="button" className="cta-button" onClick={startReview} disabled={loading}>
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
          <button type="button" className="cta-button" onClick={startReview}>
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
            <button type="button" className="progress-tag tag-button" onClick={loadWrongNotes}>
              지난번 오답
            </button>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {showNotes && (
          <div className="note-panel">
            <div className="note-title">오답노트</div>
            {notes.length === 0 ? (
              <div className="note-empty">저장된 오답이 없습니다.</div>
            ) : (
              notes.map((note, index) => (
                <div className="note-card" key={note.wrong_note_id}>
                  <div className="note-question">{index + 1}. {note.question_text}</div>
                  <div className="note-answer">내 답: {note.user_answer || '미응답'}</div>
                  <div className="note-answer">정답: {note.correct_answer}</div>
                  {note.explanation && <div className="note-explain">{note.explanation}</div>}
                </div>
              ))
            )}
          </div>
        )}

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

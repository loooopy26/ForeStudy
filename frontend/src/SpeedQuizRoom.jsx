import { memo, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import forest from './assets/speed-quiz-forest.webp'
import squirrel from './assets/speed-quiz-catcher.webp'
import quizStart from './assets/speed-quiz-start.webp'
import { AcornIcon, BackIcon, BellIcon, ChevronRightIcon } from './icons'
import Header from './Header'
import { generateSpeedQuiz } from './api'
import { useGoods } from './goods'
import './SpeedQuizRoom.css'

const MAX_HEARTS = 3
const FALL_MS = 6900
const CATCH_WINDOW_MS = 200
const FEEDBACK_MS = 1000
const LANES = [14, 38, 62, 86]
const DROP_DELAYS = [900, 0, 1500, 450]
const WAVE_END_MS = FALL_MS + Math.max(...DROP_DELAYS) + CATCH_WINDOW_MS
const ART = { '--speed-forest': `url(${forest})` }
const BEST_KEY = 'forestudy:speed-quiz:drops-best'
const READY_TO_START = { loading: false, error: '' }

function shuffled(items) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    const item = copy[index]
    copy[index] = copy[other]
    copy[other] = item
  }
  return copy
}

function recordCatch(game, choice, elapsed) {
  const question = game.deck[game.index]
  const correct = choice === question.answer
  const streak = correct ? game.streak + 1 : 0
  const points = correct ? 100 + Math.min(streak - 1, 4) * 25 : 0
  return {
    ...game,
    elapsed,
    attempts: [...game.attempts, { question, choice, correct }],
    feedback: { correct, choice, points, until: elapsed + FEEDBACK_MS },
    score: game.score + points,
    streak,
    hearts: game.hearts - Number(!correct),
  }
}

function gameReducer(game, action) {
  if (action.type === 'lobby') return { phase: 'lobby', best: game.best }
  if (action.type === 'start') {
    return {
      phase: 'playing',
      deck: action.deck,
      index: 0,
      lane: 1,
      elapsed: 0,
      lastFrame: action.now,
      score: 0,
      hearts: MAX_HEARTS,
      streak: 0,
      paused: false,
      attempts: [],
      feedback: null,
      best: game.best,
    }
  }
  if (game.phase !== 'playing') return game
  if (action.type === 'pause') return game.paused ? game : { ...game, paused: true }
  if (action.type === 'resume') return game.paused ? { ...game, paused: false, lastFrame: action.now } : game
  if (game.paused) return game
  if (action.type === 'move' || action.type === 'aim') {
    if (game.feedback) return game
    const lane = action.type === 'aim' ? action.lane : game.lane + action.direction
    return { ...game, lane: Math.min(LANES.length - 1, Math.max(0, lane)) }
  }

  const elapsed = game.elapsed + Math.max(0, action.now - game.lastFrame)
  const updated = { ...game, elapsed, lastFrame: action.now }
  if (game.feedback) {
    if (elapsed < game.feedback.until) return updated
    if (!game.hearts || game.attempts.length === game.deck.length) {
      return { ...updated, phase: 'result', best: Math.max(game.best, game.score) }
    }
    return { ...updated, index: game.index + 1, elapsed: 0, feedback: null }
  }

  const arrival = FALL_MS + DROP_DELAYS[game.lane]
  if (elapsed >= arrival && game.elapsed < arrival + CATCH_WINDOW_MS) {
    return recordCatch(updated, game.deck[game.index].choices[game.lane], elapsed)
  }
  if (elapsed >= WAVE_END_MS) return recordCatch(updated, null, elapsed)
  return updated
}

function formatScore(score) {
  return score.toLocaleString('ko-KR')
}

function readBest() {
  try {
    const score = Number(localStorage.getItem(BEST_KEY))
    return Number.isFinite(score) && score > 0 ? score : 0
  } catch {
    return 0
  }
}

function StartRoundButton({ label, image, onStart, preparation }) {
  return (
    <>
      <button
        type="button"
        className={image && !preparation.loading ? 'speed-start-button' : 'speed-primary'}
        onClick={onStart}
        disabled={preparation.loading}
        aria-busy={preparation.loading}
      >
        {preparation.loading ? 'Solar가 문제를 만들고 있어요…' : image || label}
      </button>
      {preparation.error && <p className="speed-generation-error" role="alert">{preparation.error}</p>}
    </>
  )
}

function QuizLobby({ onStart, preparation }) {
  return (
    <div className="speed-lobby">
      <section className="speed-intro">
        <span className="speed-subject">정보처리기사 필기</span>
        <h1>물방울 퀴즈</h1>
        <p>다람쥐를 움직여 정답 물방울을 받아요.</p>
      </section>
      <div className="speed-lobby-scene" aria-hidden="true">
        <img src={squirrel} alt="" />
      </div>
      <div className="speed-lobby-actions">
        <StartRoundButton
          image={<img src={quizStart} alt="퀴즈 시작" width={680} height={181} />}
          onStart={onStart}
          preparation={preparation}
        />
      </div>
    </div>
  )
}

function Hearts({ count }) {
  return (
    <div className="speed-hearts" role="group" aria-label={`남은 하트 ${count}개`}>
      {Array.from({ length: MAX_HEARTS }, (_, index) => (
        <span key={index} className={index < count ? 'speed-heart' : 'speed-heart is-empty'} aria-hidden="true">♥</span>
      ))}
    </div>
  )
}

const DropLabel = memo(function DropLabel({ choice }) {
  const labelRef = useRef(null)
  const textRef = useRef(null)

  useLayoutEffect(() => {
    const label = labelRef.current
    const text = textRef.current
    const range = document.createRange()
    range.selectNodeContents(text)
    let active = true

    const fit = () => {
      if (!active || !label.clientWidth || !label.clientHeight) return

      text.style.removeProperty('font-size')
      text.style.removeProperty('overflow-wrap')
      const frame = label.getBoundingClientRect()
      const fits = () => {
        const bounds = range.getBoundingClientRect()
        return bounds.left >= frame.left - .5 && bounds.right <= frame.right + .5
          && bounds.top >= frame.top - .5 && bounds.bottom <= frame.bottom + .5
      }
      let size = Number.parseFloat(getComputedStyle(text).fontSize)
      while (size > 8 && !fits()) {
        size = Math.max(8, size - .5)
        text.style.fontSize = `${size}px`
      }
      if (!fits() && text.scrollWidth > label.clientWidth) text.style.overflowWrap = 'anywhere'
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(label)
    document.fonts?.ready.then(fit)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [choice])

  return (
    <span className="speed-drop-label" ref={labelRef}>
      <span className={choice.length <= 4 ? 'speed-drop-text is-short' : 'speed-drop-text'} ref={textRef}>{choice}</span>
    </span>
  )
})

function QuizRound({ game, onMove, onAim }) {
  const { deck, index, elapsed, lane, feedback, paused } = game
  const question = deck[index]
  const controlsLocked = paused || Boolean(feedback)
  let feedbackTitle
  if (feedback) {
    feedbackTitle = feedback.correct ? `정답! +${feedback.points}점` : feedback.choice ? '앗, 오답이에요' : '물방울을 놓쳤어요'
  }

  return (
    <section className="speed-round" aria-label="물방울 퀴즈 진행">
      <div className="speed-question">
        <span>{index + 1} / {deck.length}</span>
        <h1 aria-live="polite">Q. {question.prompt}</h1>
      </div>

      <div className="speed-board">
        <div className="speed-weather" aria-hidden="true" />
        <div className="speed-fall-zone" role="group" aria-label="떨어지는 보기">
          {!feedback && question.choices.map((choice, position) => {
            const progress = (elapsed - DROP_DELAYS[position]) / FALL_MS
            const slipped = elapsed > FALL_MS + DROP_DELAYS[position] + CATCH_WINDOW_MS
            return progress >= 0 && !slipped && (
              <button
                type="button"
                key={`${index}-${position}`}
                className="speed-drop"
                aria-pressed={lane === position}
                disabled={paused}
                style={{ left: `${LANES[position]}%`, top: `${Math.max(1, progress * 100)}%` }}
                onClick={() => onAim(position)}
              >
                <span className="speed-drop-shape" aria-hidden="true" />
                <DropLabel choice={choice} />
              </button>
            )
          })}
        </div>
        <div className="speed-catcher" aria-hidden="true" style={{ left: `${LANES[lane]}%` }}>
          <img src={squirrel} alt="" draggable="false" />
        </div>
        <div className="speed-feedback" role="status" aria-live="polite">
          {feedback && (
            <div className={feedback.correct ? 'speed-outcome is-correct' : 'speed-outcome'}>
              <strong>{feedbackTitle}</strong>
              {!feedback.correct && <span>정답은 {question.answer}</span>}
            </div>
          )}
        </div>
        <div className="speed-controls">
          <button type="button" aria-label="왼쪽으로 이동" disabled={controlsLocked || lane === 0} onClick={() => onMove(-1)}>
            <BackIcon size={24} />
          </button>
          <button type="button" aria-label="오른쪽으로 이동" disabled={controlsLocked || lane === LANES.length - 1} onClick={() => onMove(1)}>
            <ChevronRightIcon size={24} />
          </button>
        </div>
      </div>
      <p className="speed-controls-guide">좌우로 움직이거나 물방울을 탭해서 받아요.</p>
    </section>
  )
}

function QuizResult({ game, onReplay, preparation }) {
  const review = game.attempts.filter((attempt) => !attempt.correct)

  return (
    <div className="speed-result">
      <section className="speed-result-card">
        <h1>라운드 종료</h1>
        <p>{game.hearts ? '모든 문제가 끝났어요.' : '하트를 모두 써서 라운드가 끝났어요.'}</p>
        <strong className="speed-result-score">{formatScore(game.score)}<span>점</span></strong>
        <p>최고 기록 {formatScore(game.best)}점</p>
        <dl className="speed-result-stats">
          <div><dt>맞힌 문제</dt><dd>{game.attempts.length - review.length} / {game.deck.length}</dd></div>
          <div><dt>놓치거나 틀린 문제</dt><dd>{review.length}</dd></div>
        </dl>
      </section>
      {review.length > 0 && (
        <section className="speed-review" aria-label="다시 볼 문제">
          <h2>다시 볼 문제</h2>
          {review.map(({ question, choice }) => (
            <details key={question.prompt}>
              <summary>{question.prompt}</summary>
              <p>{choice ? `내가 받은 보기 · ${choice}` : '물방울을 놓쳤어요.'}</p>
              <p><strong>정답 · {question.answer}</strong></p>
              <p>{question.explanation}</p>
            </details>
          ))}
        </section>
      )}
      <div className="speed-result-actions">
        <StartRoundButton label="다시 하기" onStart={onReplay} preparation={preparation} />
      </div>
    </div>
  )
}

export default function SpeedQuizRoom({ onNavigate }) {
  const { wallet } = useGoods()
  const [game, dispatch] = useReducer(gameReducer, undefined, () => ({ phase: 'lobby', best: readBest() }))
  const [preparation, setPreparation] = useState(READY_TO_START)
  const requestRef = useRef(null)
  const previousPrompts = useRef([])
  const playing = game.phase === 'playing'
  const { paused, best } = game
  const dotori = formatScore(wallet)

  useEffect(() => () => {
    const controller = requestRef.current
    requestRef.current = null
    controller?.abort()
  }, [])

  useEffect(() => {
    if (!playing || paused) return
    let frame
    const update = () => {
      dispatch({ type: 'tick', now: performance.now() })
      frame = window.requestAnimationFrame(update)
    }
    frame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frame)
  }, [playing, paused])

  useEffect(() => {
    if (!playing) return
    const handleVisibility = () => {
      if (document.hidden) dispatch({ type: 'pause' })
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        dispatch(paused ? { type: 'resume', now: performance.now() } : { type: 'pause' })
        return
      }
      if (paused || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        dispatch({ type: 'move', direction: event.key === 'ArrowLeft' ? -1 : 1 })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('keydown', handleKey)
    }
  }, [playing, paused])

  useEffect(() => {
    if (best <= readBest()) return
    try {
      localStorage.setItem(BEST_KEY, String(best))
    } catch {
      // The game is playable when browser storage is unavailable.
    }
  }, [best])

  const startRound = async () => {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setPreparation({ loading: true, error: '' })
    const timeout = window.setTimeout(() => controller.abort(), 45000)
    try {
      const { questions } = await generateSpeedQuiz(previousPrompts.current, controller.signal)
      if (requestRef.current !== controller) return
      controller.signal.throwIfAborted()
      const deck = questions.map((question) => ({
        ...question,
        choices: shuffled([question.answer, ...question.distractors]),
      }))
      if (!deck.length) throw new Error('Empty round')
      previousPrompts.current = questions.map((question) => question.prompt)
      setPreparation(READY_TO_START)
      dispatch({ type: 'start', deck, now: performance.now() })
    } catch {
      if (requestRef.current !== controller) return
      setPreparation({
        loading: false,
        error: controller.signal.aborted
          ? '문제 생성 시간이 초과됐어요. 다시 시도해 주세요.'
          : 'Solar 문제를 불러오지 못했어요. 다시 시도해 주세요.',
      })
    } finally {
      window.clearTimeout(timeout)
      if (requestRef.current === controller) requestRef.current = null
    }
  }
  const goToLobby = () => {
    const controller = requestRef.current
    requestRef.current = null
    controller?.abort()
    setPreparation(READY_TO_START)
    dispatch({ type: 'lobby' })
  }
  return (
    <main className="speed-room" style={ART}>
      {playing ? (
        <header className="speed-header">
          <button type="button" className="speed-icon-button speed-back" aria-label="게임 메뉴" onClick={() => dispatch({ type: 'pause' })} disabled={paused}>
            <BackIcon size={21} />
          </button>
          <Hearts count={game.hearts} />
          <span className="speed-score">점수 <strong>{formatScore(game.score)}</strong></span>
          <button type="button" className="speed-icon-button speed-pause" aria-label="일시정지" onClick={() => dispatch({ type: 'pause' })} disabled={paused}>
            <span aria-hidden="true" />
          </button>
        </header>
      ) : (
        <Header
          title="물방울 게임"
          onBack={() => onNavigate('village')}
          action={(
            <span className="speed-dotori" role="group" aria-label={`도토리 ${dotori}개`}>
              <AcornIcon size={16} /> <strong>{dotori}</strong>
            </span>
          )}
          icon={<span aria-hidden="true"><BellIcon size={22} /></span>}
        />
      )}
      <div className={`speed-body${playing ? ' speed-playing' : ''}`} key={game.phase}>
        {game.phase === 'lobby' && <QuizLobby onStart={startRound} preparation={preparation} />}
        {playing && (
          <QuizRound
            game={game}
            onMove={(direction) => dispatch({ type: 'move', direction })}
            onAim={(lane) => dispatch({ type: 'aim', lane })}
          />
        )}
        {game.phase === 'result' && <QuizResult game={game} onReplay={startRound} preparation={preparation} />}
      </div>
      {playing && paused && (
        <div className="speed-overlay">
          <section className="speed-dialog" role="dialog" aria-modal="true" aria-label="게임 일시정지">
            <h2>일시정지</h2>
            <button type="button" className="speed-primary" autoFocus onClick={() => dispatch({ type: 'resume', now: performance.now() })}>계속하기</button>
            <button type="button" className="speed-text-button" onClick={goToLobby}>그만하기</button>
          </section>
        </div>
      )}
    </main>
  )
}

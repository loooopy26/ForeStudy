import { useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { ReviewIcon, CheckIcon, CrossIcon, CheckBigIcon } from './icons'
import './Shell.css'

const QUESTIONS = [
  {
    q: '다음 중 외래 키(Foreign Key)에 대한 설명으로 옳은 것은?',
    options: ['각 행을 고유하게 식별하는 키', '다른 테이블의 기본 키를 참조하는 키', '중복을 절대 허용하지 않는 키', '반드시 숫자여야 하는 키'],
    answer: 1,
    explain: '외래 키는 다른 테이블의 기본 키를 참조해 테이블 간 관계를 맺어주는 키예요. 중복과 NULL도 가능합니다.',
  },
  {
    q: '정규화(Normalization)를 하는 목적으로 가장 적절한 것은?',
    options: ['검색 속도만 최대로 높이기 위해', '데이터 중복을 줄이고 무결성을 높이기 위해', '테이블 개수를 무조건 줄이기 위해', '저장 공간을 늘리기 위해'],
    answer: 1,
    explain: '정규화는 데이터 중복과 이상 현상을 줄이고 무결성을 높이기 위해 테이블을 구조화하는 과정이에요.',
  },
  {
    q: '트랜잭션의 원자성(Atomicity)에 대한 설명으로 옳은 것은?',
    options: ['트랜잭션은 부분적으로만 성공할 수 있다', '실행 순서는 항상 무시된다', '모두 성공하거나 모두 취소된다', '실행 중 언제든 자유롭게 중단된다'],
    answer: 2,
    explain: '원자성은 트랜잭션의 모든 연산이 전부 성공하거나 전부 취소됨을 보장해 데이터 일관성을 지켜줘요.',
  },
]

const LETTERS = ['A', 'B', 'C', 'D']

function Review({ onNavigate }) {
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)

  const restart = () => {
    setIdx(0)
    setSelected(null)
    setRevealed(false)
    setDone(false)
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
              틀렸던 {QUESTIONS.length}문제를 모두 다시 풀었어요.
              <br />이 개념들을 확실하게 기억해 두세요!
            </div>
          </div>
        </div>
        <div className="cta-area tight">
          <button type="button" className="cta-button" onClick={restart}>
            다시 복습하기
          </button>
        </div>
        <BottomNav active="review" onNavigate={onNavigate} />
      </>
    )
  }

  const current = QUESTIONS[idx]
  const isLast = idx >= QUESTIONS.length - 1
  const progress = Math.round(((idx + 1) / QUESTIONS.length) * 100)

  const selectOption = (i) => {
    if (revealed) return
    setSelected(i)
    setRevealed(true)
  }
  const next = () => {
    if (!revealed) return
    if (isLast) setDone(true)
    else {
      setIdx((i) => i + 1)
      setSelected(null)
      setRevealed(false)
    }
  }

  return (
    <>
      <Header title="복습하기" icon={<ReviewIcon />} onBack={() => onNavigate('library')} />

      <div className="body-scroll">
        <div className="progress-row">
          <div className="progress-top">
            <span className="progress-count">복습 {idx + 1} / {QUESTIONS.length}</span>
            <span className="progress-tag">지난번 오답</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <p className="question-text">{current.q}</p>

        <div className="option-list">
          {current.options.map((text, i) => {
            const isCorrect = i === current.answer
            const isWrongPick = revealed && selected === i && !isCorrect
            let background, borderColor, color, mark
            if (revealed && isCorrect) {
              background = 'oklch(0.93 0.03 148)'; borderColor = 'oklch(0.75 0.06 148)'; mark = 'check'
            } else if (isWrongPick) {
              background = 'oklch(0.95 0.03 25)'; borderColor = 'oklch(0.8 0.08 25)'; color = 'oklch(0.45 0.1 25)'; mark = 'cross'
            } else {
              mark = 'idle'
            }
            return (
              <button
                key={text}
                type="button"
                className="option-button"
                style={{ background, borderColor, cursor: revealed ? 'default' : 'pointer' }}
                onClick={() => selectOption(i)}
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

        {revealed && <div className="explain-box">{current.explain}</div>}
      </div>

      <div className="cta-area tight">
        <button type="button" className="cta-button" disabled={!revealed} onClick={next}>
          {isLast ? '복습 완료' : '다음 문제'}
        </button>
      </div>

      <BottomNav active="review" onNavigate={onNavigate} />
    </>
  )
}

export default Review

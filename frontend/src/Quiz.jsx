import { useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { QuizIcon, CheckIcon } from './icons'
import './Shell.css'

const QUESTIONS = [
  { q: '다음 중 기본 키(Primary Key)에 대한 설명으로 맞는 것은?', options: ['중복된 값을 허용한다', 'NULL 값을 가질 수 있다', '테이블의 각 행을 고유하게 식별한다', '외래 키로만 사용할 수 있다'], answer: 2 },
  { q: '다음 중 외래 키(Foreign Key)에 대한 설명으로 맞는 것은?', options: ['값을 고유하게 식별한다', '다른 테이블의 기본 키를 참조한다', '중복과 NULL을 허용하지 않는다', '반드시 숫자여야 한다'], answer: 1 },
  { q: '정규화(Normalization)의 목적에 가장 가까운 것은?', options: ['검색 속도만 높이기 위해', '데이터 중복을 줄이고 무결성을 높이기 위해', '테이블 개수를 무조건 줄이기 위해', '저장 공간만 줄이기 위해'], answer: 1 },
  { q: '트랜잭션의 원자성(Atomicity)에 대한 설명으로 맞는 것은?', options: ['부분적으로만 성공할 수 있다', '실행 순서는 항상 무시된다', '모두 성공하거나 모두 취소된다', '실행 중 언제든 중단된다'], answer: 2 },
  { q: '인덱스(Index)에 대한 설명으로 맞는 것은?', options: ['데이터 검색 속도를 높이는 자료구조', '데이터를 영구 삭제하는 명령', '테이블 간 관계를 정의하는 값', '트랜잭션을 취소하는 기능'], answer: 0 },
]

const LETTERS = ['A', 'B', 'C', 'D']

function Quiz({ onNavigate }) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [done, setDone] = useState(false)

  const restart = () => {
    setIdx(0)
    setAnswers({})
    setDone(false)
  }

  if (done) {
    const score = QUESTIONS.reduce((acc, q, i) => (answers[i] === q.answer ? acc + 1 : acc), 0)
    const resultMsg =
      score === QUESTIONS.length
        ? '훌륭해요! 모든 문제를 맞혔어요.'
        : score >= QUESTIONS.length * 0.6
          ? '좋았어요. 틀린 문제는 복습하기에서 다시 확인해 보세요.'
          : '조금 더 복습이 필요해요. 복습하기에서 정답을 다시 확인해 보세요.'

    return (
      <>
        <Header title="AI 퀴즈" icon={<QuizIcon />} onBack={() => onNavigate('library')} />
        <div className="done-screen">
          <div className="done-badge done-score">
            <span>{score}</span>
            <span>/ {QUESTIONS.length}</span>
          </div>
          <div>
            <div className="done-title">퀴즈 완료!</div>
            <div className="done-desc">{resultMsg}</div>
          </div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={restart}>
            다시 풀기
          </button>
        </div>
        <BottomNav active="quiz" onNavigate={onNavigate} />
      </>
    )
  }

  const current = QUESTIONS[idx]
  const selected = answers[idx]
  const answered = selected !== undefined
  const isLast = idx >= QUESTIONS.length - 1
  const progress = Math.round(((idx + 1) / QUESTIONS.length) * 100)

  const selectOption = (i) => setAnswers((a) => ({ ...a, [idx]: i }))
  const next = () => {
    if (!answered) return
    if (isLast) setDone(true)
    else setIdx((i) => i + 1)
  }

  return (
    <>
      <Header title="AI 퀴즈" icon={<QuizIcon />} onBack={() => onNavigate('library')} />

      <div className="body-scroll">
        <div className="progress-row">
          <div className="progress-top">
            <span className="progress-count">문제 {idx + 1} / {QUESTIONS.length}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <p className="question-text">{current.q}</p>

        <div className="option-list">
          {current.options.map((text, i) => {
            const isSelected = selected === i
            return (
              <button
                key={text}
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
      </div>

      <div className="cta-area">
        <button type="button" className="cta-button" disabled={!answered} onClick={next}>
          {isLast ? '결과 보기' : '다음 문제'}
        </button>
      </div>

      <BottomNav active="quiz" onNavigate={onNavigate} />
    </>
  )
}

export default Quiz

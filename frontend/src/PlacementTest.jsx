import { useState } from 'react'
import Header from './Header'
import { QuizIcon, CheckIcon } from './icons'
import './Shell.css'

const QUESTIONS = [
  {
    q: '다음 중 스택(Stack) 자료구조의 특징으로 옳은 것은?',
    options: ['먼저 들어간 데이터가 먼저 나온다', '나중에 들어간 데이터가 먼저 나온다', '데이터를 무작위 순서로 꺼낸다', '데이터를 항상 정렬된 상태로 유지한다'],
    answer: 1,
  },
  {
    q: 'OSI 7계층 중 IP 주소를 이용해 데이터의 전송 경로(라우팅)를 결정하는 계층은?',
    options: ['물리 계층', '데이터 링크 계층', '네트워크 계층', '전송 계층'],
    answer: 2,
  },
  {
    q: '프로세스와 스레드에 대한 설명으로 옳은 것은?',
    options: ['스레드는 프로세스와 달리 메모리를 전혀 공유하지 않는다', '한 프로세스는 최대 하나의 스레드만 가질 수 있다', '스레드는 프로세스 내에서 자원을 공유하며 실행되는 단위이다', '프로세스는 스레드보다 항상 생성 비용이 적다'],
    answer: 2,
  },
  {
    q: 'SQL 조회 결과에서 중복된 행을 제거하고 싶을 때 사용하는 키워드는?',
    options: ['UNIQUE', 'DISTINCT', 'FILTER', 'GROUP'],
    answer: 1,
  },
  {
    q: '평균 시간복잡도가 O(n log n)인 정렬 알고리즘은?',
    options: ['버블 정렬', '선택 정렬', '삽입 정렬', '병합 정렬'],
    answer: 3,
  },
  {
    q: '대칭키(비밀키) 암호화 방식에 대한 설명으로 옳은 것은?',
    options: ['암호화 키와 복호화 키가 서로 다르다', '암호화와 복호화에 같은 키를 사용한다', '키를 공개해도 안전하다', '주로 전자서명에만 사용된다'],
    answer: 1,
  },
  {
    q: 'IP 주소를 네트워크 상의 물리적 MAC 주소로 변환해주는 프로토콜은?',
    options: ['DNS', 'DHCP', 'ARP', 'FTP'],
    answer: 2,
  },
  {
    q: '트랜잭션의 ACID 특성 중 "일관성(Consistency)"이 의미하는 것은?',
    options: ['트랜잭션은 모두 성공하거나 모두 취소된다', '트랜잭션 실행 전후 데이터베이스는 항상 일관된 상태를 유지한다', '트랜잭션 결과는 다른 트랜잭션에 즉시 반영된다', '완료된 트랜잭션의 결과는 영구적으로 저장된다'],
    answer: 1,
  },
  {
    q: '큐(Queue) 자료구조의 특징으로 옳은 것은?',
    options: ['후입선출(LIFO) 구조이다', '선입선출(FIFO) 구조이다', '데이터를 항상 역순으로 처리한다', '삽입과 삭제가 같은 쪽에서 일어난다'],
    answer: 1,
  },
  {
    q: '소프트웨어 개발 생명주기(SDLC)에서 요구사항 분석과 설계 다음에 오는 단계는?',
    options: ['유지보수', '구현(개발)', '요구사항 정의', '폐기'],
    answer: 1,
  },
]

const LETTERS = ['A', 'B', 'C', 'D']

function PlacementTest({ onNavigate, certName }) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState({})
  const [done, setDone] = useState(false)

  if (done) {
    const score = QUESTIONS.reduce((acc, q, i) => (answers[i] === q.answer ? acc + 1 : acc), 0)
    const resultMsg =
      score === QUESTIONS.length
        ? '훌륭해요! 모든 문제를 맞혔어요.'
        : score >= QUESTIONS.length * 0.6
          ? '좋은 시작이에요. 결과에 맞춰 학습 코스를 준비해드릴게요.'
          : '기초부터 차근차근 준비해봐요. 맞춤 학습 코스를 만들어드릴게요.'

    return (
      <>
        <Header title="배치고사" icon={<QuizIcon />} onBack={() => onNavigate('profile')} />
        <div className="done-screen">
          <div className="done-badge done-score">
            <span>{score}</span>
            <span>/ {QUESTIONS.length}</span>
          </div>
          <div>
            <div className="done-title">배치고사 완료!</div>
            <div className="done-desc">
              {certName ? `${certName} ` : ''}
              {resultMsg}
            </div>
          </div>
        </div>
        <div className="cta-area">
          <button type="button" className="cta-button" onClick={() => onNavigate('profile')}>
            확인
          </button>
        </div>
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
      <Header title="배치고사" icon={<QuizIcon />} onBack={() => onNavigate('placementIntro', { cert: certName })} />

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
    </>
  )
}

export default PlacementTest

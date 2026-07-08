import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import { ChatIcon, BotIcon, SendIcon } from './icons'
import './Chat.css'

const SUGGESTIONS = ['기본 키랑 외래 키 차이가 뭐야?', '정규화는 왜 하는 거야?', '트랜잭션을 쉽게 설명해줘']

const ANSWERS = {
  기본: '기본 키는 각 행을 유일하게 식별하는 값이라 중복과 NULL이 허용되지 않아요. 반면 외래 키는 다른 테이블의 기본 키를 참조하는 값이라 중복될 수 있고 NULL도 가능해요. 즉, 기본 키는 "고유성", 외래 키는 "관계 연결"이 핵심이에요.',
  외래: '외래 키는 다른 테이블의 기본 키를 참조해서 두 테이블을 연결하는 역할을 해요. 예를 들어 "학생" 테이블의 "학과ID"가 "학과" 테이블의 기본 키를 참조하는 식이에요.',
  정규화: '정규화는 데이터 중복을 줄이고 이상 현상(삽입·삭제·수정 이상)을 방지하기 위해 테이블을 여러 개로 분리하는 과정이에요. 1정규형부터 3정규형까지 단계적으로 진행돼요.',
  트랜잭션: '트랜잭션은 여러 연산을 하나의 작업 단위로 묶은 거예요. 전부 성공하거나 전부 취소되는 원자성(Atomicity)을 보장해서 데이터의 일관성을 지켜줘요.',
  인덱스: '인덱스는 책의 목차처럼 원하는 데이터를 빠르게 찾도록 도와주는 자료구조예요. 검색은 빨라지지만 데이터를 추가·수정할 때는 인덱스도 갱신해야 해서 약간의 비용이 들어요.',
}

function pickAnswer(text) {
  for (const key of Object.keys(ANSWERS)) {
    if (text.includes(key)) return ANSWERS[key]
  }
  return '좋은 질문이에요! 해당 개념은 데이터베이스에서 데이터를 정확하고 효율적으로 다루기 위한 핵심 요소 중 하나예요. 더 구체적으로 어떤 부분이 궁금한지 알려주시면 자세히 설명해드릴게요.'
}

function Chat({ onNavigate }) {
  const [messages, setMessages] = useState([
    { isAI: true, text: '안녕하세요! 데이터베이스 개념 복습에 대해 궁금한 점을 자유롭게 물어보세요.' },
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const logRef = useRef(null)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking])

  const submitText = (text) => {
    const trimmed = (text || '').trim()
    if (!trimmed) return
    setMessages((m) => [...m, { isAI: false, text: trimmed }])
    setInput('')
    setShowSuggestions(false)
    setThinking(true)
    setTimeout(() => {
      const reply = pickAnswer(trimmed)
      setThinking(false)
      setMessages((m) => [...m, { isAI: true, text: reply }])
    }, 900)
  }

  return (
    <>
      <Header
        title="AI 질문"
        subtitle="데이터베이스 개념 복습"
        icon={<ChatIcon />}
        onBack={() => onNavigate('library')}
        bordered
      />

      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div className={`msg-row${m.isAI ? '' : ' mine'}`} key={i}>
            {m.isAI && (
              <div className="avatar">
                <BotIcon />
              </div>
            )}
            <div className={`bubble ${m.isAI ? 'ai' : 'mine'}`}>{m.text}</div>
          </div>
        ))}
        {thinking && (
          <div className="msg-row">
            <div className="avatar">
              <BotIcon />
            </div>
            <div className="thinking">
              <div className="dot" />
              <div className="dot" />
              <div className="dot" />
            </div>
          </div>
        )}
      </div>

      {showSuggestions && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button type="button" className="chip" key={s} onClick={() => submitText(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <input
          type="text"
          value={input}
          placeholder="궁금한 점을 물어보세요"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitText(input) }}
        />
        <button type="button" className="send-button" aria-label="전송" onClick={() => submitText(input)}>
          <SendIcon />
        </button>
      </div>
    </>
  )
}

export default Chat

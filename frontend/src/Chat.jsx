import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import { ChatIcon, BotIcon, SendIcon } from './icons'
import { createTutorSession, getMaterial, sendTutorMessage } from './api'
import './Chat.css'

const SUGGESTIONS = ['이 자료의 핵심 내용을 요약해줘', '이해가 잘 안 되는 부분을 다시 설명해줘', '예제를 들어서 설명해줘']

function Chat({ onNavigate, materialId }) {
  const [materialTitle, setMaterialTitle] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionError, setSessionError] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const logRef = useRef(null)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking])

  useEffect(() => {
    setSessionId(null)
    setSessionError(null)
    setMessages([])
    setShowSuggestions(true)
    if (!materialId) {
      setMaterialTitle(null)
      return
    }
    let cancelled = false
    Promise.all([getMaterial(materialId), createTutorSession(materialId)])
      .then(([material, session]) => {
        if (cancelled) return
        setMaterialTitle(material.title)
        setSessionId(session.session_id)
        setMessages([{ isAI: true, text: `안녕하세요! "${material.title}" 자료에 대해 궁금한 점을 자유롭게 물어보세요.` }])
      })
      .catch((err) => {
        if (!cancelled) setSessionError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [materialId])

  const submitText = async (text) => {
    const trimmed = (text || '').trim()
    if (!trimmed || !sessionId || thinking) return
    setMessages((m) => [...m, { isAI: false, text: trimmed }])
    setInput('')
    setShowSuggestions(false)
    setThinking(true)
    try {
      const { reply } = await sendTutorMessage(sessionId, trimmed)
      setMessages((m) => [...m, { isAI: true, text: reply }])
    } catch (err) {
      setMessages((m) => [...m, { isAI: true, text: `답변을 받지 못했어요: ${err.message}` }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <>
      <Header
        title="AI 질문"
        subtitle={materialId ? materialTitle || '불러오는 중...' : undefined}
        icon={<ChatIcon />}
        onBack={() => onNavigate('library')}
        bordered
      />

      {!materialId && (
        <div className="chat-log">
          <p className="chat-empty">도서관에서 자료를 먼저 선택해주세요.</p>
        </div>
      )}

      {materialId && sessionError && (
        <div className="chat-log">
          <p className="chat-empty">{sessionError}</p>
        </div>
      )}

      {materialId && !sessionError && (
        <>
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

          {showSuggestions && sessionId && (
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
              placeholder={sessionId ? '궁금한 점을 물어보세요' : '세션을 준비하는 중...'}
              disabled={!sessionId}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitText(input) }}
            />
            <button
              type="button"
              className="send-button"
              aria-label="전송"
              disabled={!sessionId}
              onClick={() => submitText(input)}
            >
              <SendIcon />
            </button>
          </div>
        </>
      )}
    </>
  )
}

export default Chat

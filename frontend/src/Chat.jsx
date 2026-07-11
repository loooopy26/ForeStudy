import { useEffect, useRef, useState } from 'react'
import Header from './Header'
import MarkdownText from './MarkdownText'
import { ChatIcon, BotIcon, CrossIcon, ImageIcon, SendIcon } from './icons'
import {
  API_BASE,
  createTutorSession,
  getMaterial,
  getTutorHistory,
  getTutorMessages,
  sendTutorImageMessage,
  sendTutorMessage,
} from './api'
import './Chat.css'

const SUGGESTIONS = ['이 자료의 핵심 내용을 요약해줘', '이해가 잘 안 되는 부분을 다시 설명해줘', '예제를 들어서 설명해줘']

function formatHistoryDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function toBubbleMessages(rows) {
  return (rows || []).map((m) => ({ isAI: m.role === 'assistant', text: m.content, imageUrl: m.image_url }))
}

function imageSrc(imageUrl) {
  return imageUrl.startsWith('blob:') ? imageUrl : `${API_BASE}${imageUrl}`
}

function MessageBubble({ isAI, text, imageUrl }) {
  return (
    <div className={`msg-row${isAI ? '' : ' mine'}`}>
      {isAI && (
        <div className="avatar">
          <BotIcon />
        </div>
      )}
      <div className={`bubble ${isAI ? 'ai' : 'mine'}`}>
        {imageUrl && <img className="bubble-image" src={imageSrc(imageUrl)} alt="첨부한 사진" />}
        {text && (isAI ? <MarkdownText>{text}</MarkdownText> : text)}
      </div>
    </div>
  )
}

function Chat({ onNavigate, materialId }) {
  const [materialTitle, setMaterialTitle] = useState(null)
  const [planScope, setPlanScope] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionError, setSessionError] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  // null이면 스트리밍 중이 아님. ''는 요청은 갔지만 아직 첫 조각이 안 온 상태(점 3개 표시),
  // 그 이후엔 도착한 조각들을 이어붙인 진행 중인 답변 텍스트.
  const [streamingReply, setStreamingReply] = useState(null)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [attachedImage, setAttachedImage] = useState(null)
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState(null)
  const logRef = useRef(null)
  const fileInputRef = useRef(null)

  // 'live' = 오늘의 대화, 'history-list' = 지난 학습 주제 목록, 'history-detail' = 지난 대화 다시보기
  const [view, setView] = useState('live')
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [viewingSession, setViewingSession] = useState(null)
  const [viewMessages, setViewMessages] = useState([])
  const [viewLoading, setViewLoading] = useState(false)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, thinking, view, viewMessages])

  useEffect(() => {
    setSessionId(null)
    setSessionError(null)
    setMessages([])
    setPlanScope(null)
    setShowSuggestions(true)
    setView('live')
    clearAttachedImage()
    if (!materialId) {
      setMaterialTitle(null)
      return
    }
    let cancelled = false
    Promise.all([getMaterial(materialId), createTutorSession(materialId)])
      .then(async ([material, session]) => {
        if (cancelled) return
        setMaterialTitle(material.title)
        setSessionId(session.session_id)
        setPlanScope(session.plan_scope || null)

        // 같은 학습 주제로 이미 나눈 대화가 있으면(화면을 나갔다 돌아온 경우 등) 그걸
        // 그대로 이어서 보여준다 — 매번 인사말로 리셋되지 않도록.
        const existing = await getTutorMessages(session.session_id).catch(() => ({ messages: [] }))
        if (cancelled) return
        if (existing.messages?.length) {
          setMessages(toBubbleMessages(existing.messages))
          setShowSuggestions(false)
          return
        }

        const topicGreeting = session.plan_scope?.focus_topic
          ? `안녕하세요! 오늘은 “${session.plan_scope.focus_topic}” 주제를 함께 공부해 볼까요? 궁금한 점을 물어보세요.`
          : `안녕하세요! "${material.title}" 자료에 대해 궁금한 점을 자유롭게 물어보세요.`
        setMessages([{ isAI: true, text: topicGreeting }])
      })
      .catch((err) => {
        if (!cancelled) setSessionError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [materialId])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAttachedImage(file)
    setAttachedPreviewUrl(URL.createObjectURL(file))
  }

  const clearAttachedImage = () => {
    setAttachedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setAttachedImage(null)
  }

  const submitText = async (text) => {
    const trimmed = (text || '').trim()
    const image = attachedImage
    const previewUrl = attachedPreviewUrl
    if ((!trimmed && !image) || !sessionId || thinking) return
    setMessages((m) => [...m, { isAI: false, text: trimmed, imageUrl: previewUrl || undefined }])
    setInput('')
    setAttachedImage(null)
    setAttachedPreviewUrl(null)
    setShowSuggestions(false)
    setThinking(true)
    setStreamingReply('')
    try {
      const onDelta = (_delta, fullText) => setStreamingReply(fullText)
      const { reply } = image
        ? await sendTutorImageMessage(sessionId, image, trimmed, onDelta)
        : await sendTutorMessage(sessionId, trimmed, onDelta)
      setMessages((m) => [...m, { isAI: true, text: reply }])
    } catch (err) {
      setMessages((m) => [...m, { isAI: true, text: `답변을 받지 못했어요: ${err.message}` }])
    } finally {
      setThinking(false)
      setStreamingReply(null)
    }
  }

  const openHistory = async () => {
    setView('history-list')
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const data = await getTutorHistory(materialId)
      setHistoryItems(data.sessions || [])
    } catch (err) {
      setHistoryError(err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  const openHistoryItem = async (item) => {
    setView('history-detail')
    setViewingSession(item)
    setViewLoading(true)
    try {
      const data = await getTutorMessages(item.session_id)
      setViewMessages(toBubbleMessages(data.messages))
    } catch {
      setViewMessages([])
    } finally {
      setViewLoading(false)
    }
  }

  const headerProps = (() => {
    if (view === 'history-list') {
      return { title: '이전 질문 기록', subtitle: materialTitle || undefined, onBack: () => setView('live') }
    }
    if (view === 'history-detail') {
      return {
        title: viewingSession?.focus_topic || '이전 질문 기록',
        subtitle: viewingSession ? formatHistoryDate(viewingSession.date) : undefined,
        onBack: () => setView('history-list'),
      }
    }
    return {
      title: 'AI 질문',
      subtitle: materialId ? materialTitle || '불러오는 중...' : undefined,
      onBack: () => onNavigate('library'),
      ...(materialId
        ? {
            action: (
              <button type="button" className="header-badge" onClick={openHistory} aria-label="이전 질문 기록 보기">
                <ChatIcon />
              </button>
            ),
          }
        : { icon: <ChatIcon /> }),
    }
  })()

  return (
    <>
      <Header {...headerProps} bordered />

      {!materialId && (
        <div className="chat-log">
          <p className="chat-empty">도서관에서 자료를 먼저 선택해주세요.</p>
        </div>
      )}

      {materialId && view === 'history-list' && (
        <div className="chat-log" ref={logRef}>
          {historyLoading && <p className="chat-empty">불러오는 중...</p>}
          {!historyLoading && historyError && <p className="chat-empty">{historyError}</p>}
          {!historyLoading && !historyError && historyItems.length === 0 && (
            <p className="chat-empty">아직 나눈 대화가 없어요.</p>
          )}
          {!historyLoading && !historyError && historyItems.length > 0 && (
            <div className="history-list">
              {historyItems.map((item) => (
                <button
                  type="button"
                  className="history-item"
                  key={item.session_id}
                  onClick={() => openHistoryItem(item)}
                >
                  <div>
                    <div>{item.focus_topic || '학습 주제 없음'}</div>
                    <span className="history-item-time">{formatHistoryDate(item.date)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {materialId && view === 'history-detail' && (
        <div className="chat-log" ref={logRef}>
          {viewLoading && <p className="chat-empty">불러오는 중...</p>}
          {!viewLoading &&
            viewMessages.map((m, i) => <MessageBubble key={i} isAI={m.isAI} text={m.text} imageUrl={m.imageUrl} />)}
        </div>
      )}

      {materialId && view === 'live' && sessionError && (
        <div className="chat-log">
          <p className="chat-empty">{sessionError}</p>
        </div>
      )}

      {materialId && view === 'live' && !sessionError && (
        <>
          <div className="chat-log" ref={logRef}>
            {planScope && (
              <section className="chat-plan-scope" aria-label="오늘의 학습 주제">
                <span>오늘의 학습 주제</span>
                <strong>{planScope.focus_topic}</strong>
              </section>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} isAI={m.isAI} text={m.text} imageUrl={m.imageUrl} />
            ))}
            {thinking && (
              <div className="msg-row">
                <div className="avatar">
                  <BotIcon />
                </div>
                {streamingReply ? (
                  <div className="bubble ai">
                    <MarkdownText>{streamingReply}</MarkdownText>
                  </div>
                ) : (
                  <div className="thinking">
                    <div className="dot" />
                    <div className="dot" />
                    <div className="dot" />
                  </div>
                )}
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

          {attachedPreviewUrl && (
            <div className="composer-attachment">
              <img src={attachedPreviewUrl} alt="첨부할 사진 미리보기" />
              <button
                type="button"
                className="composer-attachment-remove"
                onClick={clearAttachedImage}
                aria-label="첨부 사진 제거"
              >
                <CrossIcon />
              </button>
            </div>
          )}

          <div className="composer">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="attach-button"
              aria-label="사진 첨부"
              disabled={!sessionId}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon />
            </button>
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

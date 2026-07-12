// AI 아이템 공방: 상점에서 쓰는 생성 UI.
// 입력 → 생성 중 → 결과. 생성 시 도토리 차감, 보관은 무료.
// 분류 선택 없이 설명만 적으면 되고, 만든 아이템은 '커스텀' 탭에 모인다.
import { useState } from 'react'
import { generateAiItem } from './api'
import { CoinIcon, ItemArt } from './GoodsArt'

const AI_GEN_COST = 150
const SUGGEST_CHIPS = ['아늑한', '파스텔', '빈티지', '반짝이는', '숲 요정']

// 상점 화면 하단의 'AI로 직접 만들어요' 진입 버튼
export function AiFab({ onClick }) {
  return (
    <button type="button" className="ai-fab" onClick={onClick}>
      <span className="ai-fab-icon" aria-hidden="true">
        <span className="ai-fab-star">✦</span>
      </span>
      <span className="ai-fab-text">
        <strong>원하는 게 없나요?</strong>
        AI로 직접 만들어요
      </span>
      <span className="ai-fab-arrow" aria-hidden="true">›</span>
    </button>
  )
}

// onKept(item): 보관함에 담은 뒤 부모가 '커스텀' 탭으로 이동하도록 알린다.
export function AiCreatePanel({ goods, onKept, onToast }) {
  const { spend, addCustomItem } = goods
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState('idle') // idle | generating | result
  const [result, setResult] = useState(null)

  const runGenerate = async () => {
    if (phase === 'generating') return // 중복 클릭으로 이중 생성/차감 방지
    const prevPhase = phase // 실패 시 원래 화면(입력 or 이전 결과)으로 복귀
    const text = prompt.trim()
    if (!text) {
      onToast({ text: '만들고 싶은 아이템을 설명해주세요' })
      return
    }
    if (goods.wallet < AI_GEN_COST) {
      onToast({ text: '도토리가 부족해요' })
      return
    }
    setPhase('generating')
    try {
      const item = await generateAiItem(text)
      // 생성 성공 후 차감 (실패하면 도토리를 쓰지 않음)
      if (!spend(AI_GEN_COST)) {
        onToast({ text: '도토리가 부족해요' })
        setPhase(prevPhase)
        return
      }
      setResult(item)
      setPhase('result')
    } catch {
      onToast({ text: '생성에 실패했어요. 다시 시도해주세요' })
      setPhase(prevPhase)
    }
  }

  const keepItem = () => {
    addCustomItem(result)
    onKept(result)
  }

  const appendChip = (word) => {
    setPrompt((prev) => (prev ? `${prev} ${word}` : word))
  }

  if (phase === 'generating') {
    const retrying = Boolean(result) // 결과가 이미 있으면 '다시 만들기' 중
    return (
      <div className="ai-panel">
        <div className="ai-gen">
          <div className="ai-spin" />
          <div className="ai-gen-title">{retrying ? '다시 만들고 있어요…' : '도토리를 심고 있어요…'}</div>
          <div className="ai-gen-sub">{retrying ? 'AI가 설명에 맞춰 새로 그리는 중' : 'AI가 나만의 아이템을 그리는 중'}</div>
        </div>
      </div>
    )
  }

  if (phase === 'result' && result) {
    return (
      <div className="ai-panel">
        <div className="ai-stage">
          <div className="ai-artbox">
            <span className="ai-new-badge">NEW</span>
            <ItemArt item={result} size={72} />
          </div>
          <div className="ai-result-name">{result.name}</div>
          {result.tags?.length > 0 && (
            <div className="ai-tags">
              {result.tags.map((t) => <span key={t} className="ai-tag">{t}</span>)}
            </div>
          )}
          <div className="ai-result-desc">{result.description}</div>
        </div>
        <div className="ai-actions">
          <button type="button" className="ai-btn retry" onClick={runGenerate}>
            <CoinIcon size={13} /> 다시 만들기 · {AI_GEN_COST}
          </button>
          <button type="button" className="ai-btn keep" onClick={keepItem}>
            내 보관함에 담기 <span className="ai-free">무료</span>
          </button>
        </div>
        <p className="ai-note">생성할 때 도토리를 냈으니 보관은 무료예요 · '커스텀' 탭에 담겨요</p>
      </div>
    )
  }

  return (
    <div className="ai-panel">
      <div className="ai-hero">
        <div className="ai-hero-title">
          무엇을 만들어 드릴까요?
        </div>
        <div className="ai-hero-sub">모양·색·분위기를 자세히 적을수록 좋아요.</div>
      </div>
      <textarea
        className="ai-textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="예: 홈 화면 캐릭터처럼 포근한 숲 속 망토, 잎사귀와 도토리 장식으로"
        rows={3}
      />
      <div className="ai-chips">
        {SUGGEST_CHIPS.map((word) => (
          <button key={word} type="button" className="ai-chip" onClick={() => appendChip(word)}>
            # {word}
          </button>
        ))}
      </div>
      <button type="button" className="ai-generate" onClick={runGenerate}>
        <span>아이템 생성하기</span>
        <span className="ai-cost"><CoinIcon size={13} />{AI_GEN_COST}</span>
      </button>
      <p className="ai-note">생성에 도토리 {AI_GEN_COST}개 · 만들어진 아이템은 무료로 보관돼요</p>
    </div>
  )
}

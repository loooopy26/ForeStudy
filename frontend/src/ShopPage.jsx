// 상점 화면: 의상/가구/아이템/꾸미기 탭별 아이템을 도토리로 구매한다.
// 각 탭 하단의 'AI로 직접 만들어요' 버튼으로 AI 제작 화면에 진입하면
// 자연어로 설명해 Upstage Solar가 아이템을 만들어준다(생성 유료·보관 무료).
import { useState } from 'react'
import { CATALOG, WEARABLE_KINDS, useGoods } from './goods'
import { GoodsHeader, GoodsTabs, GoodsToast, ItemCard } from './GoodsUI'
import { CoinIcon, ItemArt } from './GoodsArt'
import { generateAiItem } from './api'
import './Goods.css'

const TABS = [
  { key: 'wear', label: '의상' },
  { key: 'furniture', label: '가구' },
  { key: 'decor', label: '아이템' },
  { key: 'surface', label: '꾸미기' },
]

const TAB_FILTER = {
  wear: (item) => WEARABLE_KINDS.includes(item.kind),
  furniture: (item) => item.kind === 'furniture',
  decor: (item) => item.kind === 'decor',
  surface: (item) => item.kind === 'wallpaper' || item.kind === 'floor',
}

// AI가 만든 아이템이 어느 탭에 보이는지 (담기 후 이동용)
const KIND_TO_TAB = {
  outfit: 'wear', hat: 'wear', bag: 'wear', accessory: 'wear',
  furniture: 'furniture', decor: 'decor', wallpaper: 'surface', floor: 'surface',
}

const AI_GEN_COST = 150
const SUGGEST_CHIPS = ['아늑한', '파스텔', '빈티지', '반짝이는', '숲 요정']

function ShopPage({ onNavigate }) {
  const goods = useGoods()
  const { wallet, isOwned, buy, customItems } = goods
  const [tab, setTab] = useState('wear')
  const [showAi, setShowAi] = useState(false)
  const [toast, setToast] = useState(null)

  const items = [...CATALOG, ...customItems].filter(TAB_FILTER[tab])

  const handleBuy = (item) => {
    if (isOwned(item.id)) {
      setToast({ text: '이미 보유한 아이템이에요' })
      return
    }
    if (buy(item)) {
      setToast({ text: `${item.name} 구매 완료!` })
    } else {
      setToast({ text: '도토리가 부족해요' })
    }
  }

  const handleKept = (item) => {
    setToast({ text: `${item.name} 보관 완료!` })
    setTab(KIND_TO_TAB[item.kind] || 'wear')
    setShowAi(false)
  }

  return (
    <div className="goods-page shop-page">
      <GoodsHeader
        title={showAi ? 'AI 아이템 공방' : '상점'}
        wallet={wallet}
        onBack={showAi ? () => setShowAi(false) : () => onNavigate('village')}
      />
      {showAi ? (
        <AiCreatePanel goods={goods} activeTab={tab} onKept={handleKept} onToast={setToast} />
      ) : (
        <>
          <GoodsTabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="goods-grid">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                owned={isOwned(item.id)}
                active={false}
                onClick={handleBuy}
                ownedLabel="보유 중"
                showOwnedBadge={false}
              />
            ))}
          </div>
          <button type="button" className="ai-fab" onClick={() => setShowAi(true)}>
            <span className="ai-fab-icon" aria-hidden="true">
              <span className="ai-fab-star">✦</span>
            </span>
            <span className="ai-fab-text">
              <strong>원하는 게 없나요?</strong>
              AI로 직접 만들어요
            </span>
            <span className="ai-fab-arrow" aria-hidden="true">›</span>
          </button>
        </>
      )}
      <GoodsToast message={toast} />
    </div>
  )
}

// AI 아이템 공방: 입력 → 생성 중 → 결과. 생성 시 도토리 차감, 보관은 무료.
function AiCreatePanel({ goods, activeTab, onKept, onToast }) {
  const { spend, setWallet, addCustomItem } = goods
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
      const item = await generateAiItem(text, activeTab)
      // 로그인한 유저는 서버가 실제 도토리를 이미 차감했으니, 로컬에서 또 빼지 않고
      // 서버가 알려준 잔액으로 헤더 숫자를 그대로 맞춘다. 로그인 없는 데모 화면만
      // 기존처럼 로컬 지갑에서 차감한다.
      if (item.remainingDotori != null) {
        setWallet(item.remainingDotori)
      } else if (!spend(AI_GEN_COST)) {
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
        <p className="ai-note">생성할 때 도토리를 냈으니 보관은 무료예요</p>
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

export default ShopPage

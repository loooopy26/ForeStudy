// 상점 화면: 의상/가구/아이템/꾸미기 탭별 아이템을 도토리로 구매한다.
// 'AI로 직접 만들어요' 버튼으로 AI 공방에 진입해 자연어로 아이템을 만들면,
// 만든 아이템은 기본 카탈로그에 섞이지 않고 '커스텀' 탭에 따로 모인다.
import { useState, useRef } from 'react'
import { CATALOG, WEARABLE_KINDS, useGoods } from './goods'
import { GoodsHeader, GoodsTabs, GoodsToast, ItemCard } from './GoodsUI'
import { AiCreatePanel, AiFab } from './AiWorkshop'
import './Goods.css'

const CUSTOM_TAB = 'custom'

const TABS = [
  { key: 'wear', label: '의상' },
  { key: 'furniture', label: '가구' },
  { key: 'decor', label: '아이템' },
  { key: 'surface', label: '꾸미기' },
  { key: CUSTOM_TAB, label: '커스텀' },
]

const TAB_FILTER = {
  wear: (item) => WEARABLE_KINDS.includes(item.kind),
  furniture: (item) => item.kind === 'furniture',
  decor: (item) => item.kind === 'decor',
  surface: (item) => item.kind === 'wallpaper' || item.kind === 'floor',
}

function ShopPage({ onNavigate, initialSub }) {
  const goods = useGoods()
  const { wallet, isOwned, buy, customItems } = goods
  const [tab, setTab] = useState('wear')
  const isFromRoom = initialSub === 'ai-from-room'
  const [showAi, setShowAi] = useState(initialSub === 'ai' || isFromRoom)
  const [toast, setToast] = useState(null)
  const entrySourceRef = useRef(isFromRoom ? 'room' : 'shop')

  // '커스텀' 탭은 AI로 만든 아이템만, 나머지 탭은 기본 카탈로그만 보여준다.
  const items = tab === CUSTOM_TAB ? customItems : CATALOG.filter(TAB_FILTER[tab])

  const handleBuy = (item) => {
    // '커스텀' 아이템은 보관 시 이미 보유 처리되므로 구매 동작이 없다.
    if (item.generated || isOwned(item.id)) {
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
    if (entrySourceRef.current === 'room') {
      setTimeout(() => {
        onNavigate('room')
      }, 800)
    } else {
      setTab(CUSTOM_TAB) // 만든 아이템은 '커스텀' 탭에 모인다
      setShowAi(false)
    }
  }

  return (
    <div className="goods-page shop-page">
      <GoodsHeader
        title={showAi ? 'AI 아이템 공방' : '상점'}
        wallet={wallet}
        onBack={
          showAi
            ? () => {
                if (entrySourceRef.current === 'room') {
                  onNavigate('room')
                } else {
                  setShowAi(false)
                }
              }
            : () => onNavigate('village')
        }
      />
      {showAi ? (
        <AiCreatePanel goods={goods} onKept={handleKept} onToast={setToast} />
      ) : (
        <>
          <GoodsTabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="goods-grid">
            {tab === CUSTOM_TAB && items.length === 0 && (
              <p className="goods-empty">아직 만든 아이템이 없어요 · 아래 버튼으로 만들어 보세요</p>
            )}
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
          <AiFab
            onClick={() => {
              entrySourceRef.current = 'shop'
              setShowAi(true)
            }}
          />
        </>
      )}
      <GoodsToast message={toast} />
    </div>
  )
}

export default ShopPage

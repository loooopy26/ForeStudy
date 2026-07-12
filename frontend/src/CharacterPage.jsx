// 캐릭터(내 캐릭터) 화면: 고양이 아바타에 보유한 의상/모자/가방/액세서리를 입혀본다.
// 상점/내 방과 같은 goods 상태(useGoods)를 공유한다. 카드를 누르면 미보유 아이템은
// 도토리로 구매하고, 보유 아이템은 착용/해제(toggleEquip)가 즉시 캐릭터에 반영된다.
// 기본 상태(아무것도 착용 안 함)에서는 홈 화면과 같은 기본 복장 고양이가 보인다.
import { useState } from 'react'
import { CATALOG, WEARABLE_KINDS, getItem, useGoods } from './goods'
import { GoodsHeader, GoodsTabs, GoodsToast, ItemCard } from './GoodsUI'
import { CoinIcon } from './GoodsArt'
import CharacterAvatar from './CharacterAvatar'
import roomBackground from './assets/character-room-bg.png'
import './Goods.css'
import './CharacterPage.css'

const TABS = [
  { key: 'outfit', label: '의상' },
  { key: 'hat', label: '모자' },
  { key: 'pants', label: '바지' },
  { key: 'bag', label: '가방' },
  { key: 'accessory', label: '액세서리' },
]

function ResetIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8a8272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

function CharacterPage({ onNavigate }) {
  const { wallet, isOwned, buy, equipped, toggleEquip, customItems } = useGoods()
  const [tab, setTab] = useState('outfit')
  const [toast, setToast] = useState(null)

  // 현재 탭의 아이템(기본 카탈로그 + AI 커스텀) 중 착용류만.
  const items = [...CATALOG, ...customItems].filter(
    (item) => item.kind === tab && WEARABLE_KINDS.includes(item.kind),
  )

  const anyEquipped = WEARABLE_KINDS.some((kind) => equipped[kind])

  const handleCardClick = (item) => {
    if (!isOwned(item.id)) {
      if (buy(item)) {
        toggleEquip(item)
        setToast({ text: `${item.name} 구매 후 착용했어요!` })
      } else {
        setToast({ text: '도토리가 부족해요' })
      }
      return
    }
    const wasEquipped = equipped[item.kind] === item.id
    toggleEquip(item)
    setToast({ text: wasEquipped ? `${item.name} 벗었어요` : `${item.name} 착용했어요` })
  }

  const handleReset = () => {
    if (!anyEquipped) {
      setToast({ text: '이미 기본 복장이에요' })
      return
    }
    WEARABLE_KINDS.forEach((kind) => {
      if (equipped[kind]) toggleEquip(getItem(equipped[kind]))
    })
    setToast({ text: '기본 복장으로 되돌렸어요' })
  }

  return (
    <div className="goods-page character-page">
      <GoodsHeader
        title="캐릭터"
        onBack={() => onNavigate('profile')}
        rightSlot={
          <button type="button" className="character-edit-btn" onClick={handleReset} aria-label="기본 복장으로 되돌리기">
            <ResetIcon />
          </button>
        }
      />

      {/* 캐릭터 미리보기 무대: 방 배경 위에 고양이(+착용 아이템)가 선다.
          거울·책장·화분·창문 등은 배경 이미지에 이미 그려져 있다. */}
      <div className="character-stage" style={{ backgroundImage: `url(${roomBackground})` }}>
        <CharacterAvatar equipped={equipped} getItem={getItem} />

        <div className="character-shadow" aria-hidden="true" />
      </div>

      {/* 재화 요약 바 */}
      <div className="character-stats">
        <div className="character-stat coin">
          <CoinIcon size={18} />
          <span>{wallet.toLocaleString()}</span>
        </div>
      </div>

      <GoodsTabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="goods-grid cols-4 character-grid">
        {items.length === 0 && <p className="goods-empty">이 분류의 아이템이 아직 없어요</p>}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            owned={isOwned(item.id)}
            active={equipped[item.kind] === item.id}
            onClick={handleCardClick}
            artSize={44}
          />
        ))}
      </div>

      <GoodsToast message={toast} />
    </div>
  )
}

export default CharacterPage

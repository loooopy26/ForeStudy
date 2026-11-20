// 캐릭터(내 캐릭터) 화면: 고양이 아바타에 보유한 의상/모자/가방/액세서리를 입혀본다.
// 상점/내 방과 같은 goods 상태(useGoods)를 공유한다. 카드를 누르면 미보유 아이템은
// 도토리로 구매하고, 보유 아이템은 착용/해제(toggleEquip)가 즉시 캐릭터에 반영된다.
// 기본 상태(아무것도 착용 안 함)에서는 홈 화면과 같은 기본 복장 고양이가 보인다.
import { useState } from 'react'
import { CATALOG, getItem, useGoods, WEARABLE_KINDS } from './goods'
import { GoodsHeader, GoodsTabs, GoodsToast, ItemCard } from './GoodsUI'
import { CoinIcon } from './GoodsArt'
import CharacterAvatar from './CharacterAvatar'
import roomBackground from './assets/character-room-bg.png'
import './Goods.css'
import './CharacterPage.css'

const TABS = [
  { key: 'outfit', label: '의상' },
  { key: 'pants', label: '바지' },
  { key: 'hat', label: '모자' },
]

const CHARACTER_SLOTS = TABS.map(({ key }) => key)
const SHOP_TABS = [...TABS, { key: 'custom', label: '커스텀' }]

function ResetIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8a8272" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}

export function CharacterCatalog({ goods, level, tab, onTabChange, onBack, onToast, toast, onDeleteCustom, actions }) {
  const { wallet, buy, isOwned, equipped, toggleEquip, customItems, goodsLoaded } = goods
  const isShop = level !== undefined
  const tabs = isShop ? SHOP_TABS : TABS
  const standardItems = isShop ? CATALOG : [...CATALOG, ...customItems]
  const items = tab === 'custom' ? customItems : standardItems.filter((item) => item.kind === tab)

  const anyEquipped = CHARACTER_SLOTS.some((kind) => equipped[kind])

  const handleCardClick = async (item) => {
    if (!WEARABLE_KINDS.includes(item.kind)) {
      onToast({ text: '방 꾸미기에서 사용할 수 있는 아이템이에요' })
      return
    }
    if (!isOwned(item.id)) {
      if (await buy(item)) {
        toggleEquip(item)
        onToast({ text: `${item.name} 구매 후 착용했어요!` })
      } else {
        onToast({ text: '도토리가 부족해요' })
      }
      return
    }
    const wasEquipped = equipped[item.kind] === item.id
    toggleEquip(item)
    onToast({ text: wasEquipped ? `${item.name} 벗었어요` : `${item.name} 착용했어요` })
  }

  const handleReset = () => {
    if (!anyEquipped) {
      onToast({ text: '이미 기본 복장이에요' })
      return
    }
    CHARACTER_SLOTS.forEach((kind) => {
      const item = equipped[kind] && getItem(equipped[kind])
      if (item) toggleEquip(item)
    })
    onToast({ text: '기본 복장으로 되돌렸어요' })
  }

  const resetButton = (
    <button type="button" className="character-edit-btn" onClick={handleReset} aria-label="기본 복장으로 되돌리기">
      <ResetIcon />
    </button>
  )

  return (
    <div className="goods-page character-page">
      <GoodsHeader
        title="상점"
        wallet={wallet}
        level={level}
        onBack={onBack}
        rightSlot={isShop ? undefined : resetButton}
      />

      {/* 캐릭터 미리보기 무대: 방 배경 위에 고양이(+착용 아이템)가 선다.
          거울·책장·화분·창문 등은 배경 이미지에 이미 그려져 있다. */}
      <div className="character-stage" style={{ backgroundImage: `url(${roomBackground})` }}>
        <CharacterAvatar equipped={equipped} getItem={getItem} />

        {isShop && resetButton}
        <div className="character-shadow" aria-hidden="true" />
      </div>

      {!isShop && (
        <div className="character-stats">
          <div className="character-stat coin">
            <CoinIcon size={18} />
            <span>{wallet.toLocaleString()}</span>
          </div>
        </div>
      )}

      <GoodsTabs tabs={tabs} active={tab} onChange={onTabChange} />

      <div className="goods-grid cols-4 character-grid">
        {items.length === 0 && <p className="goods-empty">
          {tab === 'custom'
            ? goodsLoaded ? '공방에서 만든 아이템이 여기에 모여요.' : '커스텀 아이템을 불러오는 중이에요.'
            : '이 분류의 아이템이 아직 없어요'}
        </p>}
        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            owned={isOwned(item.id)}
            active={equipped[item.kind] === item.id}
            onClick={handleCardClick}
            artSize={44}
            onDelete={tab === 'custom' ? onDeleteCustom : undefined}
          />
        ))}
      </div>

      {actions}
      <GoodsToast message={toast} />
    </div>
  )
}

function CharacterPage({ onNavigate }) {
  const goods = useGoods()
  const [tab, setTab] = useState('outfit')
  const [toast, setToast] = useState(null)

  return <CharacterCatalog goods={goods} tab={tab} onTabChange={setTab} onBack={() => onNavigate('profile')} toast={toast} onToast={setToast} />
}

export default CharacterPage

// 상점 화면: 의상/가구/아이템/꾸미기 탭별 아이템을 도토리로 구매한다.
import { useState } from 'react'
import { CATALOG, WEARABLE_KINDS, useGoods } from './goods'
import { GoodsHeader, GoodsTabs, GoodsToast, ItemCard } from './GoodsUI'
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

function ShopPage({ onNavigate }) {
  const { wallet, isOwned, buy } = useGoods()
  const [tab, setTab] = useState('wear')
  const [toast, setToast] = useState(null)

  const items = CATALOG.filter(TAB_FILTER[tab])

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

  return (
    <div className="goods-page">
      <GoodsHeader title="상점" wallet={wallet} onBack={() => onNavigate('village')} />
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
      <GoodsToast message={toast} />
    </div>
  )
}

export default ShopPage

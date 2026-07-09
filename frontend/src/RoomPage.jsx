// 내 방 화면: 보유한 가구/장식을 방 미리보기에 배치하고 드래그로 자유롭게 옮긴다.
// 벽지/바닥은 방 표면을 통째로 바꾼다. 저장하기를 눌러야 배치가 유지된다.
import { useRef, useState } from 'react'
import { CATALOG, getItem, useGoods } from './goods'
import { ItemArt } from './GoodsArt'
import { GoodsHeader, GoodsTabs, GoodsToast, ItemCard } from './GoodsUI'
import './Goods.css'

const TABS = [
  { key: 'furniture', label: '가구' },
  { key: 'wallpaper', label: '벽지' },
  { key: 'floor', label: '바닥' },
  { key: 'decor', label: '장식' },
]

// 배치했을 때 방 안에서의 아이템 크기(px)
const PLACED_SIZE = {
  bed: 96, bookshelf: 78, desk: 72, shelf: 64, lamp: 52, 'mushroom-chair': 56,
  plant: 44, books: 40, basket: 44, frame: 44, window: 64, rug: 92,
}

const WALL_STYLE = {
  default: { background: 'linear-gradient(180deg, #f9f0dc 0%, #f3e6cc 100%)' },
  'forest-wallpaper': {
    background: '#e6eedd',
    backgroundImage: 'radial-gradient(circle at 25% 40%, #cadfb4 0 8px, transparent 9px), radial-gradient(circle at 70% 65%, #cadfb4 0 6px, transparent 7px)',
    backgroundSize: '90px 70px',
  },
  'stripe-wallpaper': {
    background: 'repeating-linear-gradient(90deg, #fdf6e3 0 26px, #f4e7c3 26px 40px)',
  },
}

const FLOOR_STYLE = {
  default: { background: '#e8d7b4' },
  'wood-floor': {
    background: 'repeating-linear-gradient(90deg, #d8b98a 0 44px, #cfae7c 44px 88px)',
    borderTop: '3px solid #c0a071',
  },
  'grass-floor': {
    background: 'repeating-linear-gradient(90deg, #a8c68f 0 36px, #9dbd83 36px 72px)',
    borderTop: '3px solid #7d9c62',
  },
}

function RoomPage({ onNavigate }) {
  const { wallet, isOwned, buy, room, toggleRoomItem, moveRoomItem, saveRoom } = useGoods()
  const [tab, setTab] = useState('furniture')
  const [toast, setToast] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const previewRef = useRef(null)

  const items = CATALOG.filter((item) => item.kind === tab)
  const isActive = (item) =>
    item.kind === 'wallpaper' || item.kind === 'floor'
      ? room[item.kind] === item.id
      : room.placed.some((p) => p.id === item.id)

  const handleCardClick = (item) => {
    if (!isOwned(item.id)) {
      if (buy(item)) setToast({ text: `${item.name} 구매 완료! 탭해서 배치해 보세요` })
      else setToast({ text: '도토리가 부족해요' })
      return
    }
    toggleRoomItem(item)
  }

  const handlePointerDown = (event, id) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingId(id)
  }

  const handlePointerMove = (event) => {
    if (!draggingId || !previewRef.current) return
    const rect = previewRef.current.getBoundingClientRect()
    const x = Math.min(93, Math.max(7, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(90, Math.max(10, ((event.clientY - rect.top) / rect.height) * 100))
    moveRoomItem(draggingId, x, y)
  }

  const handleSave = () => {
    saveRoom()
    setToast({ text: '방 배치를 저장했어요!' })
  }

  return (
    <div className="goods-page room-page">
      <GoodsHeader title="내 방" wallet={wallet} onBack={() => onNavigate('village')} />

      <div
        ref={previewRef}
        className="room-preview"
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDraggingId(null)}
      >
        <div className="room-wall" style={WALL_STYLE[room.wallpaper] || WALL_STYLE.default} />
        <div className="room-floor" style={FLOOR_STYLE[room.floor] || FLOOR_STYLE.default} />
        {room.placed.map((placed) => {
          const item = getItem(placed.id)
          if (!item) return null
          const size = PLACED_SIZE[item.art] || 56
          return (
            <div
              key={placed.id}
              className={`room-placed${draggingId === placed.id ? ' dragging' : ''}`}
              style={{ left: `${placed.x}%`, top: `${placed.y}%` }}
              onPointerDown={(event) => handlePointerDown(event, placed.id)}
            >
              <ItemArt item={item} size={size} />
            </div>
          )
        })}
        {room.placed.length === 0 && <span className="room-hint">보유한 가구를 탭하면 방에 놓여요 · 드래그로 위치 이동</span>}
      </div>

      <GoodsTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="goods-grid cols-4">
        {items.length === 0 && <p className="goods-empty">이 분류의 아이템이 아직 없어요</p>}
        {items.map((item) => (
          <ItemCard key={item.id} item={item} owned={isOwned(item.id)} active={isActive(item)} onClick={handleCardClick} artSize={44} />
        ))}
      </div>

      <button type="button" className="room-save-btn" onClick={handleSave}>저장하기</button>
      <GoodsToast message={toast} />
    </div>
  )
}

export default RoomPage

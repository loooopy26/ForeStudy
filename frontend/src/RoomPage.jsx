// 내 방 화면: 보유한 가구/장식을 방 미리보기에 배치하고 드래그로 자유롭게 옮긴다.
// 벽지/바닥은 방 표면을 통째로 바꾼다. 저장하기를 눌러야 배치가 유지된다.
import { useEffect, useRef, useState } from 'react'
import { CATALOG, useGoods } from './goods'
import { ItemArt } from './GoodsArt'
import { GoodsHeader, GoodsTabs, GoodsToast, ItemCard } from './GoodsUI'
import './Goods.css'

const CUSTOM_TAB = 'custom'
// 방에 배치·적용할 수 있는 분류 (AI로 만든 의상 등은 방에 놓을 수 없어 제외)
const ROOM_KINDS = ['furniture', 'decor', 'wallpaper', 'floor']

const TABS = [
  { key: 'furniture', label: '가구' },
  { key: 'wallpaper', label: '벽지' },
  { key: 'floor', label: '바닥' },
  { key: 'decor', label: '장식' },
  { key: CUSTOM_TAB, label: '커스텀' },
]

// 배치했을 때 방 안에서의 아이템 크기(px) — 기본 크기. 원근 스케일로 자동 조절됨.
const PLACED_SIZE = {
  bed: 112, bookshelf: 86, desk: 72, shelf: 68, lamp: 54, 'mushroom-chair': 56,
  nightstand: 62, chest: 60,
  plant: 46, books: 40, basket: 44, frame: 44, window: 64, rug: 104,
  'wall-lamp': 48, dog: 66,
}

// 가구 겹침 자동 레이어링 우선순위 등급
const ART_PRIORITY = {
  rug: 1,
  bed: 2,
  bookshelf: 2,
  chest: 3,
  shelf: 3,
  desk: 4,
  nightstand: 4,
  'mushroom-chair': 5,
  lamp: 6,
  'wall-lamp': 6,
  plant: 7,
  books: 7,
  basket: 7,
  frame: 7,
  window: 7,
  dog: 8,
}


// 벽지/바닥 스타일 결정: 기본 카탈로그는 위 프리셋, AI 커스텀 아이템은 visual 레시피(색·패턴)로 즉석 생성
function surfaceStyle(id, kind, customItems = []) {
  const presets = kind === 'wallpaper' ? WALL_STYLE : FLOOR_STYLE
  if (!id) return presets.default
  if (presets[id]) return presets[id]
  const item = CATALOG.find((it) => it.id === id) || customItems.find((it) => it.id === id)
  if (!item) return presets.default
  if (item.imageUrl) {
    return {
      backgroundImage: `url(${item.imageUrl})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: '140% 140%',
      backgroundPosition: 'center',
    }
  }
  const primary = item.visual?.primary || item.color || '#e6e0cf'
  const secondary = item.visual?.secondary || item.trim || '#c9bfa4'
  const accent = item.visual?.accent || '#f5df8d'
  const pattern = item.visual?.pattern || item.visual?.variant
  if (pattern === 'stripe') {
    return { background: `repeating-linear-gradient(90deg, ${primary} 0 26px, ${secondary} 26px 40px)` }
  }
  if (pattern === 'plank') {
    return {
      backgroundColor: primary,
      backgroundImage: `repeating-linear-gradient(0deg, ${secondary}59 0 2px, transparent 2px 22px), repeating-linear-gradient(90deg, ${secondary}47 0 2px, transparent 2px 58px)`,
    }
  }
  if (pattern === 'check') {
    return {
      backgroundColor: primary,
      backgroundImage: `repeating-linear-gradient(0deg, ${secondary}40 0 2px, transparent 2px 30px), repeating-linear-gradient(90deg, ${secondary}40 0 2px, transparent 2px 30px)`,
    }
  }
  if (pattern === 'forest' || item.visual?.motif === 'tree' || id === 'forest-wallpaper') {
    return {
      backgroundColor: primary,
      backgroundImage: `
        linear-gradient(135deg, ${secondary}bb 24%, transparent 24%),
        linear-gradient(225deg, ${secondary}bb 24%, transparent 24%),
        linear-gradient(45deg, ${secondary}bb 24%, transparent 24%),
        linear-gradient(315deg, ${secondary}bb 24%, transparent 24%),
        radial-gradient(circle, ${secondary}99 0 3.5px, transparent 4.5px),
        radial-gradient(circle, ${accent}cc 0 2.5px, transparent 3.5px)
      `,
      backgroundSize: '40px 40px, 40px 40px, 40px 40px, 40px 40px, 50px 50px, 64px 64px',
      backgroundPosition: '0 20px, 20px 20px, 20px 0, 0 0, 15px 15px, 30px 45px',
    }
  }
  // dot / sprinkle / blade / solid 등: 바탕색 + 은은한 도트
  return {
    backgroundColor: primary,
    backgroundImage: `radial-gradient(circle, ${secondary}59 0 4px, transparent 5px)`,
    backgroundSize: '50px 40px',
  }
}

// 원근 스케일 제거

// 벽지/바닥 무늬 — 상점 아이콘(GoodsArt의 VISUAL_BY_ART 팔레트)과 같은 색·패턴을 CSS로 재현
const WALL_STYLE = {
  default: { background: '#f5ecd8' }, // 따뜻하고 코지한 크림 베이지
  'forest-wallpaper': {
    backgroundColor: '#dcebd1',
    backgroundImage: `
      linear-gradient(135deg, #a7c48c 24%, transparent 24%),
      linear-gradient(225deg, #a7c48c 24%, transparent 24%),
      linear-gradient(45deg, #a7c48c 24%, transparent 24%),
      linear-gradient(315deg, #a7c48c 24%, transparent 24%),
      radial-gradient(circle, #b9d6a1 0 3.5px, transparent 4.5px),
      radial-gradient(circle, #f5df8d 0 2.5px, transparent 3.5px)
    `,
    backgroundSize: '40px 40px, 40px 40px, 40px 40px, 40px 40px, 50px 50px, 64px 64px',
    backgroundPosition: '0 20px, 20px 20px, 20px 0, 0 0, 15px 15px, 30px 45px',
  },
  'stripe-wallpaper': {
    // 아이콘: 크림 줄무늬 + 가는 포인트 라인
    background: 'repeating-linear-gradient(90deg, #fbf2d7 0 24px, #f0e0b4 24px 38px, #e7ce92 38px 40px)',
  },
}

const FLOOR_STYLE = {
  default: {
    background: '#dfc3a3',
    backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.03) 0px 44px, rgba(0,0,0,0) 44px 45px)',
  },
  'wood-floor': {
    // 아이콘: 원목 판자 — 가로 널빤지 이음선 + 세로 조인트 + 은은한 결
    backgroundColor: '#d1a76c',
    backgroundImage: [
      'repeating-linear-gradient(0deg, rgba(147, 98, 63, 0.35) 0 2px, transparent 2px 22px)',
      'repeating-linear-gradient(90deg, rgba(147, 98, 63, 0.28) 0 2px, transparent 2px 58px)',
      'repeating-linear-gradient(90deg, rgba(231, 198, 140, 0.35) 0 12px, transparent 12px 29px)',
    ].join(', '),
  },
  'grass-floor': {
    // 아이콘: 잔디 — 진한 풀숲 덩어리 + 밝은 새싹 점
    backgroundColor: '#9fbe82',
    backgroundImage: [
      'radial-gradient(circle, rgba(102, 140, 85, 0.5) 0 4px, transparent 5px)',
      'radial-gradient(circle, rgba(102, 140, 85, 0.38) 0 3px, transparent 4px)',
      'radial-gradient(circle, #d8e7b6 0 2.2px, transparent 3.2px)',
    ].join(', '),
    backgroundSize: '52px 40px, 38px 30px, 74px 58px',
    backgroundPosition: '10px 12px, 28px 26px, 46px 8px',
  },
}

function RoomPage({ onNavigate }) {
  const { wallet, isOwned, buy, room, customItems, toggleRoomItem, moveRoomItem, transformRoomItem, saveRoom } = useGoods()
  const [tab, setTab] = useState('furniture')
  const [toast, setToast] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [popupItem, setPopupItem] = useState(null)
  const previewRef = useRef(null)
  const timerRef = useRef(null)
  const pointerStartRef = useRef({ x: 0, y: 0 })

  // 말풍선이 활성화되어 있을 때 화면 바깥(빈 공간, 상점 탭, 헤더 등) 어디든 터치 시 자동 닫기
  useEffect(() => {
    if (!popupItem) return

    const handleGlobalPointerDown = (event) => {
      // 선택 가구 독 내부나 가구 자체를 클릭한 게 아니라면 독을 닫는다
      if (!event.target.closest('.room-selection-dock') && !event.target.closest('.room-placed')) {
        setPopupItem(null)
      }
    }

    document.addEventListener('pointerdown', handleGlobalPointerDown)
    return () => {
      document.removeEventListener('pointerdown', handleGlobalPointerDown)
    }
  }, [popupItem])

  const getItemFromState = (id) => {
    return CATALOG.find((item) => item.id === id) || customItems.find((item) => item.id === id)
  }

  // '커스텀' 탭은 AI로 만든 방 아이템만, 나머지 탭은 기본 카탈로그만 보여준다.
  const items = tab === CUSTOM_TAB
    ? customItems.filter((item) => ROOM_KINDS.includes(item.kind))
    : CATALOG.filter((item) => item.kind === tab)
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
    const wasPlaced = room.placed.some((placed) => placed.id === item.id)
    toggleRoomItem(item)
    setSelectedId(wasPlaced || item.kind === 'wallpaper' || item.kind === 'floor' ? null : item.id)
  }

  const handlePointerDown = (event, id) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedId(id)
    setDraggingId(id)
    setPopupItem(null) // 다른 가구를 누르면 기존 팝업은 바로 닫기
    pointerStartRef.current = { x: event.clientX, y: event.clientY }

    // 가구를 0.6초(600ms) 동안 가만히 누르고 있으면 팝업창 오픈
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setPopupItem(id)
    }, 600)
  }

  const handlePointerMove = (event) => {
    if (timerRef.current) {
      const deltaX = event.clientX - pointerStartRef.current.x
      const deltaY = event.clientY - pointerStartRef.current.y
      if (Math.hypot(deltaX, deltaY) > 40) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    if (draggingId && previewRef.current) {
      const rect = previewRef.current.getBoundingClientRect()
      const placed = room.placed.find(p => p.id === draggingId)
      const item = placed ? getItemFromState(placed.id) : null
      const size = item ? (PLACED_SIZE[item.art] || 56) : 56

      const rawX = ((event.clientX - rect.left) / rect.width) * 100
      const rawY = ((event.clientY - rect.top) / rect.height) * 100

      // 원근 스케일 제거 - customScale만 사용
      const customScale = placed?.scale ?? 1
      const finalScale = customScale

      // 화면에 실제 렌더링되는 크기(size * finalScale)
      const actualSize = size * finalScale

      // 실제 렌더링 일러스트의 실영역 크기 비율 연산 (투명 여백 상쇄: X는 32%, Y는 42%)
      const halfXPercent = ((actualSize * 0.32) / rect.width) * 100
      const halfYPercent = ((actualSize * 0.42) / rect.height) * 100

      // 2px만큼 오차를 두고 테두리 벽면에 달라붙도록 버퍼(2px) 계산
      const bufferX = (2 / rect.width) * 100
      const bufferY = (2 / rect.height) * 100

      const minX = halfXPercent - bufferX
      const maxX = 100 - halfXPercent + bufferX
      const minY = halfYPercent - bufferY
      const maxY = 100 - halfYPercent + bufferY

      // 방의 가구 배치 영역 한계(y) 제한 추가
      const clampedMinY = Math.max(15, minY)
      const clampedMaxY = Math.min(88, maxY)

      const x = Math.min(maxX, Math.max(minX, rawX))
      const y = Math.min(clampedMaxY, Math.max(clampedMinY, rawY))

      moveRoomItem(draggingId, x, y)
    }
  }

  const handlePointerUp = (event) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (draggingId) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      setDraggingId(null)
    }
  }

  const handleDelete = (id) => {
    const item = getItemFromState(id)
    if (item) toggleRoomItem(item)
    setSelectedId(null)
    setToast({ text: '아이템을 제거했어요' })
  }

  const handleRotate = (id) => {
    const placed = room.placed.find((p) => p.id === id)
    if (placed) {
      const item = getItemFromState(id)
      const isBed = item?.art === 'bed'
      const currentRotate = placed.rotate ?? 0
      if (isBed) {
        // 침대는 4방향 다 지원 (0 -> 90 -> 180 -> 270 -> 0)
        const nextRotate = (currentRotate + 90) % 360
        transformRoomItem(id, { rotate: nextRotate })
      } else {
        // 침대가 아닌 경우 0도와 180도(좌우반전)만 토글!
        const nextRotate = currentRotate === 0 ? 180 : 0
        transformRoomItem(id, { rotate: nextRotate })
      }
    }
  }


  const handleSave = () => {
    saveRoom()
    setToast({ text: '방 배치를 저장했어요!' })
  }

  return (
    <div className="goods-page room-page">
      <GoodsHeader title="내 방" wallet={wallet} onBack={() => onNavigate('village')} />

      <div className="room-preview-wrapper" style={{ position: 'relative' }}>
        <div
          ref={previewRef}
          className="room-preview-3d"
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDraggingId(null)}
          onPointerDown={(event) => {
            // 빈 배경을 탭하면 선택 해제 및 팝업 해제
            if (event.target === previewRef.current) {
              setSelectedId(null)
              setPopupItem(null)
            }
          }}
        >
          {/* CSS 3D 방 구성: 왼쪽 벽을 좁히고 오른쪽 벽을 대폭 확장 (코너 X좌표: 25%) */}
          <div className="room-wall-left-3d" style={surfaceStyle(room.wallpaper, 'wallpaper', customItems)} />
          <div className="room-wall-right-3d" style={surfaceStyle(room.wallpaper, 'wallpaper', customItems)} />
          <div className="room-floor-3d" style={surfaceStyle(room.floor, 'floor', customItems)} />
          <div className="room-baseboard-left-3d" />
          <div className="room-baseboard-right-3d" />
          <div className="room-corner-3d" />

          {room.wallpaper && (
            <div className="room-window-3d" aria-hidden="true">
              <div className="room-window-view-3d" />
              <div className="room-curtain-3d left" />
              <div className="room-curtain-3d right" />
            </div>
          )}

          {room.placed.map((placed) => {
            const item = getItemFromState(placed.id)
            if (!item) return null
            const size = PLACED_SIZE[item.art] || 56
            const customScale = placed.scale ?? 1
            const finalScale = customScale

            // 정면 뷰: 모든 아이템을 기울임 없이 똑바로 그린다. 러그만 바닥에 눕도록 살짝 눌러준다.
            // 점선 테두리가 터지는 문제를 방지하기 위해 가구 크기(width, height)를 명시적으로 부여합니다.
            // z-index: 아래(앞)에 있을수록 위에 그려져 가구가 자연스럽게 겹친다.
            // 레이어(layer) 값이 우선, 같은 레이어 안에서는 y가 클수록(앞쪽) 위에 그려진다
            const priority = ART_PRIORITY[item.art] || (item.kind === 'decor' ? 7 : 4)
            const customStyle = {
              left: `${placed.x}%`,
              top: `${placed.y}%`,
              width: `${size}px`,
              height: `${size}px`,
              zIndex: (draggingId === placed.id ? 10000 : 0) + (priority * 1000) + Math.round(placed.y),
            }
            const itemRotate = placed.rotate ?? 0
            let transform = item.art === 'rug'
              ? `translate(-50%, -50%) scaleY(0.72) scale(${finalScale})`
              : `translate(-50%, -50%) scale(${finalScale})`

            if (item.art === 'bed') {
              // 침대인 경우: 180도, 270도일 때 다리가 늘 아래를 향하도록 좌우반전(scaleX)만 적용
              if (itemRotate === 180 || itemRotate === 270) {
                transform += ' scaleX(-1)'
              }
              // 90도와 270도는 GoodsArt에서 자체적으로 앞방향 입체 침대로 렌더링되므로 CSS 회전(rotate)은 적용 안 함
            }

            return (
              <div
                key={placed.id}
                className={`room-placed${draggingId === placed.id ? ' dragging' : ''}${selectedId === placed.id ? ' selected' : ''}`}
                style={{ ...customStyle, transform }}
                onPointerDown={(event) => handlePointerDown(event, placed.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <ItemArt item={item} size={size} framed={false} rotate={itemRotate} />
              </div>
            )
          })}
          {room.placed.length === 0 && <span className="room-hint">보유한 가구를 탭하면 방에 놓여요 · 드래그로 위치 이동</span>}
        </div>

        {/* 0.6초 동안 꾹 누르면 방 화면 상단 중앙에 고정식으로 뜨는 편집 캡슐 독 (Selection Dock) */}
        {popupItem && (() => {
          const item = getItemFromState(popupItem)
          if (!item) return null
          return (
            <div className="room-selection-dock">
              <span className="dock-title">{item.name}</span>
              <div className="dock-divider" />
              {item.art === 'bed' && (
                <button
                  type="button"
                  className="dock-action-btn rotate"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRotate(popupItem)
                  }}
                >
                  ↻ 회전하기
                </button>
              )}
              <button
                type="button"
                className="dock-action-btn delete"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(popupItem)
                  setPopupItem(null)
                }}
              >
                ✕ 제거하기
              </button>
              <button
                type="button"
                className="dock-action-btn close"
                onClick={(e) => {
                  e.stopPropagation()
                  setPopupItem(null)
                }}
              >
                닫기
              </button>
            </div>
          )
        })()}
      </div>

      <GoodsTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="goods-grid cols-4">
        {items.length === 0 && (
          <p className="goods-empty">
            {tab === CUSTOM_TAB ? '아직 만든 방 아이템이 없어요 · 아래 버튼으로 만들어 보세요' : '이 분류의 아이템이 아직 없어요'}
          </p>
        )}
        {items.map((item) => (
          <ItemCard key={item.id} item={item} owned={isOwned(item.id)} active={isActive(item)} onClick={handleCardClick} artSize={44} />
        ))}
      </div>

      <button type="button" className="room-save-btn" onClick={handleSave}>저장하기</button>
      <button
        type="button"
        className="room-ai-workshop-btn"
        onClick={() => onNavigate('shop', { sub: 'ai-from-room' })}
        title="AI 아이템 공방으로 이동"
      >
        <span className="room-ai-workshop-btn-star">✦</span>
      </button>
      <GoodsToast message={toast} />
    </div>
  )
}

export default RoomPage

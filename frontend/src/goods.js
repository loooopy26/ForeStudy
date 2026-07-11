// 상점/내 방/캐릭터 화면이 공유하는 카탈로그와 로컬 상태.
// 도토리 지갑은 퀘스트 보드(ForestGame)와 같은 키(forestudy_acorns_v4)를 쓴다.
import { useCallback, useEffect, useState } from 'react'

const WALLET_KEY = 'forestudy_acorns_v4'
const OWNED_KEY = 'forestudy_goods_owned_v1'
const EQUIPPED_KEY = 'forestudy_equipped_v1'
const ROOM_KEY = 'forestudy_room_v1'
const CUSTOM_ITEMS_KEY = 'forestudy_custom_items_v1'

export const WEARABLE_KINDS = ['outfit', 'hat', 'bag', 'accessory']

// art: GoodsArt.jsx의 ItemArt가 그림을 고를 때 쓰는 키.
// 아이템별 자연스러운 기본 배치 위치 — 정면 뷰 구도(벽/바닥 경계 y: 57%).
// 레퍼런스 일러스트처럼: 침대는 우측, 책장·선반은 좌측, 러그·강아지는 중앙 바닥.
export const DEFAULT_POS = {
  // 가구 — 벽 라인(y 50~58)을 따라 정면 배치
  'wood-shelf': { x: 13, y: 52 },   // 좌측 벽 앞 선반
  'bookshelf': { x: 28, y: 50 },    // 좌측 책장
  'wood-desk': { x: 44, y: 53 },    // 중앙 책상
  'nightstand': { x: 57, y: 54 },   // 침대 옆 협탁
  'wood-lamp': { x: 57, y: 43 },    // 협탁 위 램프
  'cozy-bed': { x: 79, y: 58 },     // 우측 침대
  'pink-bed': { x: 79, y: 58 },     // 우측 침대 (사진 구도)
  'mushroom-chair': { x: 38, y: 66 },
  'wood-chest': { x: 90, y: 72 },   // 우측 앞 수납함
  // 장식
  'plant-pot': { x: 65, y: 62 },    // 침대 옆 화분
  'book-pile': { x: 8, y: 72 },     // 좌측 앞 바닥 책 더미
  'acorn-basket': { x: 90, y: 80 },
  'picture-frame': { x: 38, y: 25 }, // 뒷벽 액자
  'window': { x: 76, y: 23 },       // 뒷벽 우측 창문
  'wall-lamp': { x: 10, y: 26 },    // 뒷벽 좌측 조명
  'green-rug': { x: 45, y: 76 },    // 중앙 바닥 러그
  'blue-rug': { x: 45, y: 76 },
  'dog-friend': { x: 43, y: 78 },   // 러그 위 강아지
}

export const CATALOG = [
  // 의상 (outfit)
  { id: 'bear-hood', name: '곰 후드', price: 800, kind: 'outfit', art: 'hoodie', color: '#a9825f', trim: '#8a6647' },
  { id: 'animal-sweater', name: '동물 스웨터', price: 700, kind: 'outfit', art: 'sweater', color: '#f3e6cf', trim: '#c9a97e' },
  { id: 'green-jacket', name: '초록 재킷', price: 800, kind: 'outfit', art: 'jacket', color: '#7d9c62', trim: '#5f7a43' },
  { id: 'navy-hoodie', name: '네이비 후드', price: 700, kind: 'outfit', art: 'hoodie', color: '#4f6178', trim: '#3c4b5e' },
  { id: 'pink-hoodie', name: '분홍 후드', price: 900, kind: 'outfit', art: 'hoodie', color: '#e8b4bc', trim: '#d391a0' },
  { id: 'yellow-raincoat', name: '노란 우비', price: 1000, kind: 'outfit', art: 'jacket', color: '#e9c46a', trim: '#d4a83f' },
  // 모자 (hat)
  { id: 'leaf-hat', name: '나뭇잎 모자', price: 500, kind: 'hat', art: 'leaf-hat', color: '#8bb069', trim: '#5f7a43' },
  { id: 'straw-hat', name: '밀짚모자', price: 600, kind: 'hat', art: 'straw-hat', color: '#e3c983', trim: '#c9a75a' },
  { id: 'acorn-beret', name: '도토리 베레모', price: 700, kind: 'hat', art: 'beret', color: '#a9825f', trim: '#8a6647' },
  // 가방 (bag)
  { id: 'green-backpack', name: '초록 배낭', price: 800, kind: 'bag', art: 'backpack', color: '#7d9c62', trim: '#5f7a43' },
  { id: 'brown-satchel', name: '갈색 가방', price: 700, kind: 'bag', art: 'satchel', color: '#b08a5f', trim: '#8a6647' },
  // 악세사리 (accessory)
  { id: 'red-scarf', name: '빨간 목도리', price: 400, kind: 'accessory', art: 'scarf', color: '#c96f5e', trim: '#a95243' },
  { id: 'round-glasses', name: '동그란 안경', price: 500, kind: 'accessory', art: 'glasses', color: '#6b5b45', trim: '#4a4436' },
  { id: 'ribbon', name: '리본', price: 300, kind: 'accessory', art: 'ribbon', color: '#e8a4b0', trim: '#d3808f' },
  // 가구 (furniture) — 내 방에 배치
  { id: 'wood-desk', name: '나무 책상', price: 500, kind: 'furniture', art: 'desk' },
  { id: 'mushroom-chair', name: '버섯 의자', price: 300, kind: 'furniture', art: 'mushroom-chair' },
  { id: 'wood-shelf', name: '나무 선반', price: 450, kind: 'furniture', art: 'shelf' },
  { id: 'cozy-bed', name: '아늑한 침대', price: 1200, kind: 'furniture', art: 'bed' },
  { id: 'pink-bed', name: '분홍 침대', price: 1400, kind: 'furniture', art: 'bed', color: '#eeb7c2', trim: '#c98d9d' },
  { id: 'bookshelf', name: '책장', price: 1300, kind: 'furniture', art: 'bookshelf' },
  { id: 'wood-lamp', name: '램프', price: 600, kind: 'furniture', art: 'lamp' },
  { id: 'nightstand', name: '협탁', price: 550, kind: 'furniture', art: 'nightstand' },
  { id: 'wood-chest', name: '나무 수납함', price: 500, kind: 'furniture', art: 'chest' },
  // 아이템 (decor) — 내 방 장식
  { id: 'plant-pot', name: '화분', price: 200, kind: 'decor', art: 'plant' },
  { id: 'book-pile', name: '책 더미', price: 250, kind: 'decor', art: 'books' },
  { id: 'acorn-basket', name: '도토리 바구니', price: 350, kind: 'decor', art: 'basket' },
  { id: 'picture-frame', name: '그림 액자', price: 400, kind: 'decor', art: 'frame' },
  { id: 'window', name: '창문', price: 600, kind: 'decor', art: 'window' },
  { id: 'green-rug', name: '초록 러그', price: 400, kind: 'decor', art: 'rug' },
  { id: 'blue-rug', name: '파란 러그', price: 450, kind: 'decor', art: 'rug', color: '#9cc3d6', trim: '#6f9cb4' },
  { id: 'wall-lamp', name: '벽 조명', price: 450, kind: 'decor', art: 'wall-lamp' },
  { id: 'dog-friend', name: '강아지 친구', price: 900, kind: 'decor', art: 'dog' },
  // 꾸미기 — 벽지/바닥 (방 표면 교체)
  { id: 'forest-wallpaper', name: '숲 벽지', price: 400, kind: 'wallpaper', art: 'wallpaper-forest' },
  { id: 'stripe-wallpaper', name: '줄무늬 벽지', price: 350, kind: 'wallpaper', art: 'wallpaper-stripe' },
  { id: 'wood-floor', name: '원목 바닥', price: 450, kind: 'floor', art: 'floor-wood' },
  { id: 'grass-floor', name: '잔디 바닥', price: 500, kind: 'floor', art: 'floor-grass' },
]

// AI로 만든 커스텀 아이템(전체 객체) 목록. 방 화면에서도 이 목록으로 아이템을 찾는다.
export function readCustomItems() {
  return readJson(CUSTOM_ITEMS_KEY, [])
}

// 기본 카탈로그에 없으면 AI 커스텀 아이템에서도 찾는다.
export const getItem = (id) =>
  CATALOG.find((item) => item.id === id) || readCustomItems().find((item) => item.id === id)

function readJson(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null')
    return saved ?? fallback
  } catch {
    return fallback
  }
}

const DEFAULT_EQUIPPED = { outfit: null, hat: null, bag: null, accessory: null }
const DEFAULT_ROOM = { wallpaper: null, floor: null, placed: [] }

export function readEquipped() {
  return { ...DEFAULT_EQUIPPED, ...readJson(EQUIPPED_KEY, {}) }
}

// 상점/내 방/캐릭터 화면 공용 훅. 지갑·보유·착용·방 배치를 localStorage에 유지한다.
// Global states stored at the module level to synchronize state across components in real-time
let globalWallet = (() => {
  const saved = localStorage.getItem(WALLET_KEY)
  return saved ? parseInt(saved) : 2450
})()
let globalOwned = readJson(OWNED_KEY, [])
let globalCustomItems = readJson(CUSTOM_ITEMS_KEY, [])
let globalEquipped = readEquipped()
let globalRoom = (() => {
  const raw = readJson(ROOM_KEY, {})
  // 이전 드레싱룸 특화 배치 좌표(x가 15, 30, 78 등 벽쪽에 치우친 좌표들)가 저장되어 있으면 롤백 초기화 진행
  const hasDressingLayout = raw.placed && raw.placed.some(p => [15, 30, 78, 23, 32].includes(p.x))
  if (hasDressingLayout) {
    localStorage.removeItem(ROOM_KEY)
    return DEFAULT_ROOM
  }
  return { ...DEFAULT_ROOM, ...raw }
})()

const listeners = new Set()
function notifyAll() {
  listeners.forEach(fn => fn())
}

function setGlobalWallet(value) {
  globalWallet = typeof value === 'function' ? value(globalWallet) : value
  localStorage.setItem(WALLET_KEY, globalWallet)
  notifyAll()
}

function setGlobalOwned(value) {
  globalOwned = typeof value === 'function' ? value(globalOwned) : value
  localStorage.setItem(OWNED_KEY, JSON.stringify(globalOwned))
  notifyAll()
}

function setGlobalCustomItems(value) {
  globalCustomItems = typeof value === 'function' ? value(globalCustomItems) : value
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(globalCustomItems))
  notifyAll()
}

function setGlobalEquipped(value) {
  globalEquipped = typeof value === 'function' ? value(globalEquipped) : value
  localStorage.setItem(EQUIPPED_KEY, JSON.stringify(globalEquipped))
  notifyAll()
}

function setGlobalRoom(value) {
  globalRoom = typeof value === 'function' ? value(globalRoom) : value
  localStorage.setItem(ROOM_KEY, JSON.stringify(globalRoom))
  notifyAll()
}

// 상점/내 방/캐릭터 화면 공용 훅. 지갑·보유·착용·방 배치를 localStorage에 유지한다.
export function useGoods() {
  const [, forceUpdate] = useState({})

  useEffect(() => {
    const handleUpdate = () => forceUpdate({})
    listeners.add(handleUpdate)
    return () => {
      listeners.delete(handleUpdate)
    }
  }, [])

  const isOwned = useCallback((id) => globalOwned.includes(id), [])

  // 구매 성공 시 true. 도토리가 모자라면 false.
  const buy = useCallback((item) => {
    if (globalOwned.includes(item.id)) return true
    if (globalWallet < item.price) return false
    setGlobalWallet((prev) => prev - item.price)
    setGlobalOwned((prev) => [...prev, item.id])
    return true
  }, [])

  const spend = useCallback((amount) => {
    if (globalWallet < amount) return false
    setGlobalWallet((prev) => prev - amount)
    return true
  }, [])

  const addCustomItem = useCallback((item) => {
    setGlobalCustomItems((prev) => {
      return prev.some((saved) => saved.id === item.id) ? prev : [...prev, item]
    })
    setGlobalOwned((prev) => {
      return prev.includes(item.id) ? prev : [...prev, item.id]
    })
  }, [])

  // 착용 중이면 벗고, 아니면 같은 부위 아이템을 교체 착용.
  const toggleEquip = useCallback((item) => {
    setGlobalEquipped((prev) => ({
      ...prev,
      [item.kind]: prev[item.kind] === item.id ? null : item.id,
    }))
  }, [])

  // 방 배치 토글: 없으면 기본 위치에 추가, 있으면 제거. 벽지/바닥은 표면 교체.
  const toggleRoomItem = useCallback((item) => {
    setGlobalRoom((prev) => {
      let next
      if (item.kind === 'wallpaper' || item.kind === 'floor') {
        next = { ...prev, [item.kind]: prev[item.kind] === item.id ? null : item.id }
      } else {
        const exists = prev.placed.some((p) => p.id === item.id)
        const basePos = DEFAULT_POS[item.id] || { x: 50, y: 65 }
        // 기본 배치 위치가 없는 AI 아이템은 겹쳐서 선택하기 힘든 것을 막기 위해 미세한 랜덤 오프셋을 줍니다.
        const offset = DEFAULT_POS[item.id] ? 0 : Number((Math.random() * 8 - 4).toFixed(1))
        const placed = exists
          ? prev.placed.filter((p) => p.id !== item.id)
          : [...prev.placed, { id: item.id, x: basePos.x + offset, y: basePos.y + offset }]
        next = { ...prev, placed }
      }
      return next
    })
  }, [])

  const moveRoomItem = useCallback((id, x, y) => {
    setGlobalRoom((prev) => ({
      ...prev,
      placed: prev.placed.map((p) => (p.id === id ? { ...p, x, y } : p)),
    }))
  }, [])

  // 가구별 크기와 회전값도 함께 저장한다. 이전에 저장한 배치에는 값이 없을 수 있어
  // 화면에서는 각각 1, 0을 기본값으로 사용한다.
  const transformRoomItem = useCallback((id, changes) => {
    setGlobalRoom((prev) => ({
      ...prev,
      placed: prev.placed.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }))
  }, [])

  const saveRoom = useCallback(() => {
    localStorage.setItem(ROOM_KEY, JSON.stringify(globalRoom))
  }, [])

  return {
    wallet: globalWallet,
    owned: globalOwned,
    customItems: globalCustomItems,
    equipped: globalEquipped,
    room: globalRoom,
    isOwned,
    buy,
    spend,
    addCustomItem,
    toggleEquip,
    toggleRoomItem,
    moveRoomItem,
    transformRoomItem,
    saveRoom,
  }
}

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
  { id: 'bookshelf', name: '책장', price: 1300, kind: 'furniture', art: 'bookshelf' },
  { id: 'wood-lamp', name: '램프', price: 600, kind: 'furniture', art: 'lamp' },
  // 아이템 (decor) — 내 방 장식
  { id: 'plant-pot', name: '화분', price: 200, kind: 'decor', art: 'plant' },
  { id: 'book-pile', name: '책 더미', price: 250, kind: 'decor', art: 'books' },
  { id: 'acorn-basket', name: '도토리 바구니', price: 350, kind: 'decor', art: 'basket' },
  { id: 'picture-frame', name: '그림 액자', price: 400, kind: 'decor', art: 'frame' },
  { id: 'window', name: '창문', price: 600, kind: 'decor', art: 'window' },
  { id: 'green-rug', name: '초록 러그', price: 400, kind: 'decor', art: 'rug' },
  // 꾸미기 — 벽지/바닥 (방 표면 교체)
  { id: 'forest-wallpaper', name: '숲 벽지', price: 400, kind: 'wallpaper', art: 'wallpaper-forest' },
  { id: 'stripe-wallpaper', name: '줄무늬 벽지', price: 350, kind: 'wallpaper', art: 'wallpaper-stripe' },
  { id: 'wood-floor', name: '원목 바닥', price: 450, kind: 'floor', art: 'floor-wood' },
  { id: 'grass-floor', name: '잔디 바닥', price: 500, kind: 'floor', art: 'floor-grass' },
]

export const getItem = (id) => CATALOG.find((item) => item.id === id)

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
export function useGoods() {
  const [wallet, setWallet] = useState(() => {
    const saved = localStorage.getItem(WALLET_KEY)
    return saved ? parseInt(saved) : 2450
  })
  const [owned, setOwned] = useState(() => readJson(OWNED_KEY, []))
  const [customItems, setCustomItems] = useState(() => readJson(CUSTOM_ITEMS_KEY, []))
  const [equipped, setEquipped] = useState(readEquipped)
  const [room, setRoom] = useState(() => ({ ...DEFAULT_ROOM, ...readJson(ROOM_KEY, {}) }))

  useEffect(() => { localStorage.setItem(WALLET_KEY, wallet) }, [wallet])
  useEffect(() => { localStorage.setItem(OWNED_KEY, JSON.stringify(owned)) }, [owned])
  useEffect(() => { localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems)) }, [customItems])
  useEffect(() => { localStorage.setItem(EQUIPPED_KEY, JSON.stringify(equipped)) }, [equipped])

  const isOwned = useCallback((id) => owned.includes(id), [owned])

  // 구매 성공 시 true. 도토리가 모자라면 false.
  const buy = useCallback((item) => {
    if (owned.includes(item.id)) return true
    if (wallet < item.price) return false
    setWallet((prev) => prev - item.price)
    setOwned((prev) => [...prev, item.id])
    return true
  }, [owned, wallet])

  const spend = useCallback((amount) => {
    if (wallet < amount) return false
    setWallet((prev) => prev - amount)
    return true
  }, [wallet])

  const addCustomItem = useCallback((item) => {
    setCustomItems((prev) => (prev.some((saved) => saved.id === item.id) ? prev : [...prev, item]))
    setOwned((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]))
  }, [])

  // 착용 중이면 벗고, 아니면 같은 부위 아이템을 교체 착용.
  const toggleEquip = useCallback((item) => {
    setEquipped((prev) => ({
      ...prev,
      [item.kind]: prev[item.kind] === item.id ? null : item.id,
    }))
  }, [])

  // 방 배치 토글: 없으면 기본 위치에 추가, 있으면 제거. 벽지/바닥은 표면 교체.
  const toggleRoomItem = useCallback((item) => {
    setRoom((prev) => {
      if (item.kind === 'wallpaper' || item.kind === 'floor') {
        return { ...prev, [item.kind]: prev[item.kind] === item.id ? null : item.id }
      }
      const exists = prev.placed.some((p) => p.id === item.id)
      const placed = exists
        ? prev.placed.filter((p) => p.id !== item.id)
        : [...prev.placed, { id: item.id, x: 50, y: item.id === 'window' ? 22 : 68 }]
      return { ...prev, placed }
    })
  }, [])

  const moveRoomItem = useCallback((id, x, y) => {
    setRoom((prev) => ({
      ...prev,
      placed: prev.placed.map((p) => (p.id === id ? { ...p, x, y } : p)),
    }))
  }, [])

  const saveRoom = useCallback(() => {
    localStorage.setItem(ROOM_KEY, JSON.stringify(room))
  }, [room])

  return {
    wallet,
    owned,
    customItems,
    equipped,
    room,
    isOwned,
    buy,
    spend,
    addCustomItem,
    toggleEquip,
    toggleRoomItem,
    moveRoomItem,
    saveRoom,
  }
}

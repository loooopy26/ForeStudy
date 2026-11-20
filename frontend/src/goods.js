// 상점/내 방/캐릭터 화면이 공유하는 카탈로그와 로컬 상태.
// 도토리 지갑은 퀘스트 보드(ForestGame)와 같은 키(forestudy_acorns_v4)를 쓴다.
// 보유템/장착/방 배치/커스텀 아이템은 로그인 계정(UUID) 기준으로 백엔드(/api/goods)에 저장된다 —
// 예전에는 여기가 전부 localStorage였어서 기기를 바꾸면 사라졌다. 드래그처럼 매우 잦은 로컬
// 조작은 여전히 즉시 반영하고, 토글/회전/드래그 종료 같은 "확정" 시점에만 백엔드로 동기화한다.
import { useCallback, useEffect, useState } from 'react'
import { ACCOUNT_CHANGED_EVENT, apiRequest, getAccountStorageKey, getCurrentUser, getMyUser } from './api'

const WALLET_KEY = 'forestudy_acorns_v4'

export const WEARABLE_KINDS = ['outfit', 'hat', 'pants', 'bag', 'accessory']

const FREE_CHARACTER_ITEM_IDS = new Set(['animal-sweater'])

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
  'forest-rug': { x: 45, y: 76 },
  'gingham-rug': { x: 45, y: 76 },
  'flower-rug': { x: 45, y: 76 },
  'green-leaf-rug': { x: 45, y: 76 },
  'blue-cloud-rug': { x: 45, y: 76 },
  'dog-friend': { x: 43, y: 78 },   // 러그 위 강아지
}

export const CATALOG = [
  { id: 'bear-hood', name: '곰 후드', price: 50, kind: 'outfit', art: 'hoodie', image: 'shop/bear-hood.png', layer: 'bear-hood.png', color: '#a9825f', trim: '#8a6647' },
  { id: 'animal-sweater', name: '동물 스웨터', price: 50, kind: 'outfit', art: 'sweater', image: 'shop/animal-sweater.png', layer: 'animal-sweater.png', color: '#f3e6cf', trim: '#c9a97e' },
  { id: 'green-jacket', name: '초록 재킷', price: 50, kind: 'outfit', art: 'jacket', image: 'shop/green-jacket.png', layer: 'green-jacket.png', color: '#7d9c62', trim: '#5f7a43' },
  { id: 'navy-hoodie', name: '네이비 후드', price: 50, kind: 'outfit', art: 'hoodie', image: 'shop/navy-hoodie.png', layer: 'navy-hoodie.png', color: '#4f6178', trim: '#3c4b5e' },
  { id: 'pink-hoodie', name: '분홍 후드', price: 50, kind: 'outfit', art: 'hoodie', image: 'shop/pink-hoodie.png', layer: 'pink-hoodie.png', color: '#e8b4bc', trim: '#d391a0' },
  { id: 'yellow-raincoat', name: '노란 우비', price: 50, kind: 'outfit', art: 'jacket', image: 'shop/yellow-raincoat.png', layer: 'yellow-raincoat.png', color: '#e9c46a', trim: '#d4a83f' },
  { id: 'blue-jeans', name: '청바지', price: 50, kind: 'pants', art: 'pants', image: 'shop/blue-jeans.png', layer: 'blue-jeans.png', color: '#4a6b8c', trim: '#3b5670' },
  { id: 'brown-slacks', name: '갈색 바지', price: 50, kind: 'pants', art: 'pants', image: 'shop/brown-slacks.png', layer: 'brown-slacks.png', color: '#8c6c53', trim: '#705642' },
  { id: 'green-shorts', name: '초록 반바지', price: 50, kind: 'pants', art: 'pants', image: 'shop/green-shorts.png', layer: 'green-shorts.png', color: '#6b8c5e', trim: '#56704b' },
  { id: 'leaf-hat', name: '나뭇잎 모자', price: 50, kind: 'hat', art: 'leaf-hat', image: 'shop/leaf-hat.png', layer: 'leaf-hat.png', color: '#8bb069', trim: '#5f7a43' },
  { id: 'straw-hat', name: '밀짚모자', price: 50, kind: 'hat', art: 'straw-hat', image: 'shop/straw-hat.png', layer: 'straw-hat.png', color: '#e3c983', trim: '#c9a75a' },
  { id: 'acorn-beret', name: '도토리 베레모', price: 50, kind: 'hat', art: 'beret', image: 'shop/acorn-beret.png', layer: 'acorn-beret.png', color: '#a9825f', trim: '#8a6647' },
  { id: 'wood-desk', name: '나무 책상', price: 500, kind: 'furniture', art: 'desk', image: 'shop/wood-desk.png' },
  { id: 'mushroom-chair', name: '버섯 의자', price: 300, kind: 'furniture', art: 'mushroom-chair', image: 'shop/mushroom-chair.png' },
  { id: 'wood-shelf', name: '나무 선반', price: 450, kind: 'furniture', art: 'shelf', image: 'shop/wood-shelf.png' },
  { id: 'cozy-bed', name: '파란 침대', price: 1200, kind: 'furniture', art: 'bed', image: 'shop/cozy-bed.png' },
  { id: 'pink-bed', name: '분홍 침대', price: 1400, kind: 'furniture', art: 'bed', image: 'shop/pink-bed.png', color: '#eeb7c2', trim: '#c98d9d' },
  { id: 'bookshelf', name: '책장', price: 1300, kind: 'furniture', art: 'bookshelf', image: 'shop/bookshelf.png' },
  { id: 'wood-lamp', name: '램프', price: 600, kind: 'furniture', art: 'lamp', image: 'shop/wood-lamp.png' },
  { id: 'nightstand', name: '협탁', price: 550, kind: 'furniture', art: 'nightstand', image: 'shop/nightstand.png' },
  { id: 'wood-chest', name: '나무 수납함', price: 500, kind: 'furniture', art: 'chest', image: 'shop/wood-chest.png' },
  { id: 'forest-rug', name: '숲 러그', price: 400, kind: 'decor', art: 'rug', image: 'shop/forest-rug.png' },
  { id: 'gingham-rug', name: '깅엄 러그', price: 450, kind: 'decor', art: 'rug', image: 'shop/gingham-rug.png', color: '#f4d995', trim: '#d7b66d' },
  { id: 'wood-floor', name: '원목 바닥', price: 450, kind: 'floor', art: 'floor-wood', image: 'shop/wood-floor.png' },
  { id: 'flower-rug', name: '꽃 러그', price: 450, kind: 'decor', art: 'rug', image: 'shop/flower-rug.png' },
  { id: 'plant-pot', name: '화분', price: 200, kind: 'decor', art: 'plant', image: 'shop/plant-pot.png' },
  { id: 'book-pile', name: '책 더미', price: 250, kind: 'decor', art: 'books', image: 'shop/book-pile.png' },
  { id: 'acorn-basket', name: '도토리 바구니', price: 350, kind: 'decor', art: 'basket', image: 'shop/acorn-basket.png' },
  { id: 'picture-frame', name: '그림 액자', price: 400, kind: 'decor', art: 'frame', image: 'shop/picture-frame.png' },
  { id: 'window', name: '창문', price: 600, kind: 'decor', art: 'window', image: 'shop/window.png' },
  { id: 'green-leaf-rug', name: '초록 잎 러그', price: 400, kind: 'decor', art: 'rug', image: 'shop/green-leaf-rug.png' },
  { id: 'blue-cloud-rug', name: '파란 구름 러그', price: 450, kind: 'decor', art: 'rug', image: 'shop/blue-cloud-rug.png', color: '#9cc3d6', trim: '#6f9cb4' },
  { id: 'wall-lamp', name: '벽 조명', price: 450, kind: 'decor', art: 'wall-lamp', image: 'shop/wall-lamp.png' },
  { id: 'dog-friend', name: '잠자는 고양이', price: 900, kind: 'decor', art: 'dog', image: 'shop/dog-friend.png' },
]

// AI로 만든 커스텀 아이템(전체 객체) 목록. 방 화면에서도 이 목록으로 아이템을 찾는다.
export function readCustomItems() {
  return globalCustomItems
}

// 기본 카탈로그에 없으면 AI 커스텀 아이템에서도 찾는다.
export const getItem = (id) => CATALOG.find((item) => item.id === id) || globalCustomItems.find((item) => item.id === id)

const DEFAULT_EQUIPPED = { outfit: null, hat: null, pants: null, bag: null, accessory: null }
const DEFAULT_ROOM = { wallpaper: null, floor: null, placed: [] }

// 상점/내 방/캐릭터 화면 공용 훅. 지갑·보유·착용·방 배치를 백엔드(로그인 계정)와 동기화한다.
// Global states stored at the module level to synchronize state across components in real-time
let globalWallet = (() => {
  const saved = localStorage.getItem(getAccountStorageKey(WALLET_KEY))
  return saved ? parseInt(saved) : 0
})()
let globalOwned = []
let globalCustomItems = []
let globalEquipped = { ...DEFAULT_EQUIPPED }
let globalRoom = { ...DEFAULT_ROOM }
let globalUserId = null
let goodsLoaded = false
let goodsGeneration = 0

const listeners = new Set()
function notifyAll() {
  listeners.forEach(fn => fn())
}

function setGlobalWallet(value) {
  globalWallet = typeof value === 'function' ? value(globalWallet) : value
  localStorage.setItem(getAccountStorageKey(WALLET_KEY), globalWallet)
  notifyAll()
}

export function syncGoodsWallet(value) {
  if (typeof value === 'number') setGlobalWallet(value)
}

function applyGoodsState(state) {
  if (!state) return
  globalOwned = state.owned || []
  globalCustomItems = state.customItems || []
  globalEquipped = { ...DEFAULT_EQUIPPED, ...(state.equipped || {}) }
  globalRoom = { ...DEFAULT_ROOM, ...(state.room || {}) }
  goodsLoaded = true
  notifyAll()
}

async function loadGoodsState() {
  const generation = goodsGeneration
  try {
    const user = getCurrentUser()
    if (!user?.id) throw new Error('No authenticated user')
    if (generation !== goodsGeneration) return
    globalUserId = user.id
    const state = await apiRequest(`/api/goods/${user.id}`)
    if (generation !== goodsGeneration || globalUserId !== user.id) return
    applyGoodsState(state)
  } catch {
    if (generation !== goodsGeneration) return
    goodsLoaded = true
    notifyAll()
  }
}

let loadPromise = null
function ensureGoodsLoaded() {
  if (!loadPromise) loadPromise = loadGoodsState()
  return loadPromise
}

async function getActiveGoodsUserId() {
  const user = getCurrentUser()
  if (!user?.id) return null
  if (globalUserId !== user.id || !goodsLoaded) {
    resetGoodsForAccount()
    await ensureGoodsLoaded()
  }
  return globalUserId === user.id ? user.id : null
}

function resetGoodsForAccount() {
  goodsGeneration += 1
  loadPromise = null
  globalWallet = 0
  globalOwned = []
  globalCustomItems = []
  globalEquipped = { ...DEFAULT_EQUIPPED }
  globalRoom = { ...DEFAULT_ROOM }
  globalUserId = null
  goodsLoaded = false
  notifyAll()
  ensureGoodsLoaded()
}

// 방 배치처럼 잦은 로컬 조작 뒤, 확정 시점(토글/회전/드래그 종료/저장)에만 백엔드로 밀어 넣는다.
// ensureGoodsLoaded()를 먼저 기다려야 한다 — 로그인 직후처럼 globalUserId가 아직 안 채워진
// 시점에 바로 확인하면(그 전 버전) 사용자가 뭔가를 놓아도 조용히 저장이 안 되고 사라졌다.
async function syncRoomToBackend() {
  const userId = await getActiveGoodsUserId()
  if (!userId) return
  try {
    await apiRequest(`/api/goods/${userId}/room`, {
      method: 'PUT',
      body: JSON.stringify({ wallpaper: globalRoom.wallpaper, floor: globalRoom.floor, placed: globalRoom.placed }),
    })
  } catch {
    // 다음 확정 시점에 다시 전체 스냅샷을 보내므로 한 번의 실패는 무시해도 된다.
  }
}

export function useGoods() {
  const [, forceUpdate] = useState({})

  useEffect(() => {
    const handleUpdate = () => forceUpdate({})
    const syncAccountWallet = () => {
      const currentUser = getCurrentUser()
      if (!currentUser?.id) return
      getMyUser()
        .then((user) => {
          if (user?.id === currentUser.id && typeof user.dotori === 'number') {
            setGlobalWallet(user.dotori)
          }
        })
        .catch(() => {})
    }
    listeners.add(handleUpdate)
    ensureGoodsLoaded()
    syncAccountWallet()
    window.addEventListener('forestudy:user-updated', syncAccountWallet)
    window.addEventListener(ACCOUNT_CHANGED_EVENT, resetGoodsForAccount)
    return () => {
      listeners.delete(handleUpdate)
      window.removeEventListener('forestudy:user-updated', syncAccountWallet)
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, resetGoodsForAccount)
    }
  }, [])

  const isOwned = useCallback((id) => FREE_CHARACTER_ITEM_IDS.has(id) || globalOwned.includes(id), [])

  // 구매 성공 시 true. 도토리가 모자라면 false.
  const buy = useCallback(async (item) => {
    const userId = await getActiveGoodsUserId()
    if (!userId) return false
    if (globalOwned.includes(item.id)) return true
    if (globalWallet < item.price) return false
    try {
      const result = await apiRequest(`/api/goods/${userId}/buy`, {
        method: 'POST',
        body: JSON.stringify({ item_id: item.id, price: item.price }),
      })
      if (typeof result?.dotori === 'number') setGlobalWallet(result.dotori)
    } catch {
      return false
    }
    globalOwned = [...globalOwned, item.id]
    notifyAll()
    return true
  }, [])

  const spend = useCallback((amount) => {
    if (globalWallet < amount) return false
    setGlobalWallet((prev) => prev - amount)
    return true
  }, [])

  const addCustomItem = useCallback(async (item) => {
    const userId = await getActiveGoodsUserId()
    if (!userId) return false
    const generation = goodsGeneration
    try {
      const state = await apiRequest(`/api/goods/${userId}/custom-items`, {
        method: 'POST',
        body: JSON.stringify({ item }),
      })
      if (generation !== goodsGeneration || getCurrentUser()?.id !== userId) return false
      applyGoodsState(state)
    } catch {
      if (generation !== goodsGeneration || getCurrentUser()?.id !== userId) return false
      // 실패해도 로컬에는 최소한 보이도록 낙관적으로 반영한다.
      globalCustomItems = globalCustomItems.some((saved) => saved.id === item.id)
        ? globalCustomItems
        : [...globalCustomItems, item]
      globalOwned = globalOwned.includes(item.id) ? globalOwned : [...globalOwned, item.id]
      notifyAll()
    }
    return true
  }, [])

  // 커스텀 아이템 삭제: 커스텀 목록에서 지우고, 보유/착용/방 배치에 남은 참조도 함께 정리한다.
  // (기본 카탈로그 아이템에는 쓰지 않는다 — 되살릴 방법이 있는 구매 아이템과 달리 커스텀은 영구 삭제)
  const removeCustomItem = useCallback(async (id) => {
    const userId = await getActiveGoodsUserId()
    if (!userId) return
    try {
      const state = await apiRequest(`/api/goods/${userId}/custom-items/${id}`, { method: 'DELETE' })
      applyGoodsState(state)
    } catch {
      // 백엔드 호출이 실패해도 로컬에서는 완전히 지운 것처럼 보이게 한다 — 장착/방 배치에
      // 참조가 남아있으면 더 이상 CATALOG/customItems에서 찾을 수 없는 깨진 아이템으로
      // 남아 캐릭터/방 화면이 빈 스프라이트를 그리게 된다.
      globalCustomItems = globalCustomItems.filter((saved) => saved.id !== id)
      globalOwned = globalOwned.filter((ownedId) => ownedId !== id)
      globalEquipped = Object.fromEntries(
        Object.entries(globalEquipped).map(([slot, equippedId]) => [slot, equippedId === id ? null : equippedId])
      )
      globalRoom = {
        wallpaper: globalRoom.wallpaper === id ? null : globalRoom.wallpaper,
        floor: globalRoom.floor === id ? null : globalRoom.floor,
        placed: globalRoom.placed.filter((p) => p.id !== id),
      }
      notifyAll()
    }
  }, [])

  // 착용 중이면 벗고, 아니면 같은 부위 아이템을 교체 착용.
  const toggleEquip = useCallback((item) => {
    const nextItemId = globalEquipped[item.kind] === item.id ? null : item.id
    globalEquipped = { ...globalEquipped, [item.kind]: nextItemId }
    notifyAll()
    ensureGoodsLoaded().then(() => {
      if (!globalUserId) return
      apiRequest(`/api/goods/${globalUserId}/equip`, {
        method: 'POST',
        body: JSON.stringify({ slot: item.kind, item_id: nextItemId }),
      }).catch(() => {})
    })
  }, [])

  // 방 배치 토글: 없으면 기본 위치에 추가, 있으면 제거. 벽지/바닥은 표면 교체.
  const toggleRoomItem = useCallback((item) => {
    if (item.kind === 'wallpaper' || item.kind === 'floor') {
      globalRoom = { ...globalRoom, [item.kind]: globalRoom[item.kind] === item.id ? null : item.id }
    } else {
      const exists = globalRoom.placed.some((p) => p.id === item.id)
      const basePos = DEFAULT_POS[item.id] || { x: 50, y: 65 }
      // 기본 배치 위치가 없는 AI 아이템은 겹쳐서 선택하기 힘든 것을 막기 위해 미세한 랜덤 오프셋을 줍니다.
      const offset = DEFAULT_POS[item.id] ? 0 : Number((Math.random() * 8 - 4).toFixed(1))
      const placed = exists
        ? globalRoom.placed.filter((p) => p.id !== item.id)
        : [...globalRoom.placed, { id: item.id, x: basePos.x + offset, y: basePos.y + offset }]
      globalRoom = { ...globalRoom, placed }
    }
    notifyAll()
    syncRoomToBackend()
  }, [])

  const moveRoomItem = useCallback((id, x, y) => {
    globalRoom = { ...globalRoom, placed: globalRoom.placed.map((p) => (p.id === id ? { ...p, x, y } : p)) }
    notifyAll()
  }, [])

  // 가구별 크기와 회전값도 함께 저장한다. 이전에 저장한 배치에는 값이 없을 수 있어
  // 화면에서는 각각 1, 0을 기본값으로 사용한다.
  const transformRoomItem = useCallback((id, changes) => {
    globalRoom = { ...globalRoom, placed: globalRoom.placed.map((p) => (p.id === id ? { ...p, ...changes } : p)) }
    notifyAll()
    syncRoomToBackend()
  }, [])

  const saveRoom = useCallback(() => {
    syncRoomToBackend()
  }, [])

  return {
    wallet: globalWallet,
    owned: globalOwned,
    customItems: globalCustomItems,
    equipped: globalEquipped,
    room: globalRoom,
    goodsLoaded,
    isOwned,
    buy,
    spend,
    addCustomItem,
    removeCustomItem,
    toggleEquip,
    toggleRoomItem,
    moveRoomItem,
    transformRoomItem,
    saveRoom,
  }
}

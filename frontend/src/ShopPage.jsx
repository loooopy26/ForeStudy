import { useEffect, useRef, useState } from 'react'
import { useGoods } from './goods'
import { GoodsHeader, GoodsToast } from './GoodsUI'
import { CharacterCatalog } from './CharacterPage'
import { AiCreatePanel, AiFab } from './AiWorkshop'
import { getMyUser } from './api'
import './Goods.css'

function ShopPage({ onNavigate, initialSub }) {
  const goods = useGoods()
  const { wallet, removeCustomItem } = goods
  const [level, setLevel] = useState(null)
  const [tab, setTab] = useState('outfit')
  const isFromRoom = initialSub === 'ai-from-room'
  const [view, setView] = useState(initialSub === 'ai' || isFromRoom ? 'workshop' : 'catalog')
  const [toast, setToast] = useState(null)
  const roomReturnTimer = useRef(null)

  useEffect(() => {
    getMyUser()
      .then((user) => {
        if (typeof user?.level === 'number') setLevel(user.level)
      })
      .catch(() => {})
  }, [])
  useEffect(() => () => clearTimeout(roomReturnTimer.current), [])

  const handleDelete = async (item) => {
    // 커스텀 아이템은 되살릴 수 없으므로 삭제 전에 한 번 확인한다.
    if (!window.confirm(`'${item.name}'을(를) 삭제할까요? 되돌릴 수 없어요.`)) return
    await removeCustomItem(item.id)
    setToast({ text: `${item.name} 삭제 완료` })
  }

  const handleKept = (item) => {
    setToast({ text: `${item.name} 보관 완료!` })
    if (isFromRoom) {
      roomReturnTimer.current = setTimeout(() => {
        onNavigate('room-decor')
      }, 800)
    } else {
      setTab('custom')
      setView('catalog')
    }
  }

  if (view === 'catalog') {
    return (
      <CharacterCatalog
        goods={goods}
        level={level}
        tab={tab}
        onTabChange={setTab}
        onBack={() => onNavigate('village')}
        toast={toast}
        onToast={setToast}
        onDeleteCustom={handleDelete}
        actions={
          <div className="character-shop-actions">
            <AiFab onClick={() => setView('workshop')} />
          </div>
        }
      />
    )
  }

  return (
    <div className="goods-page shop-page">
      <GoodsHeader
        title="AI 아이템 공방"
        wallet={wallet}
        level={level}
        onBack={() => isFromRoom ? onNavigate('room-decor') : setView('catalog')}
      />
      <AiCreatePanel goods={goods} onKept={handleKept} onToast={setToast} />
      <GoodsToast message={toast} />
    </div>
  )
}

export default ShopPage

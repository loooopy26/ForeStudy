// 상점/내 방/캐릭터 화면 공용 UI 조각: 헤더, 탭, 아이템 카드, 토스트.
import { useEffect, useState } from 'react'
import { CoinIcon, ItemArt } from './GoodsArt'

export function GoodsHeader({ title, wallet, level = null, onBack, rightSlot }) {
  return (
    <div className="goods-header">
      <button type="button" className="goods-back-btn" onClick={onBack} aria-label="뒤로가기">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8272" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span className="goods-title">{title}</span>
      {rightSlot ?? (
        <div className="goods-coin-badge">
          <span className="goods-level-chip">Lv.{level ?? '-'}</span>
          <span className="goods-coin-divider" aria-hidden="true" />
          <span className="goods-coin-wrap">
            <CoinIcon size={17} />
            <span>{wallet.toLocaleString()}</span>
          </span>
        </div>
      )}
    </div>
  )
}

export function GoodsTabs({ tabs, active, onChange }) {
  return (
    <div className="goods-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`goods-tab${active === tab.key ? ' active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// owned: 보유 여부, active: 착용/배치 중.
// ownedLabel: 보유 시 가격 대신 보여줄 문구, showOwnedBadge: 우측 상단 '보유' 배지 여부(상점은 끔)
// onDelete: 주어지면 카드 우상단에 삭제(×) 버튼을 노출한다 (커스텀 아이템 전용).
// 카드 자체가 <button>이라 삭제 버튼을 중첩하지 않고, 래퍼 안에 형제로 나란히 둔다.
export function ItemCard({
  item,
  owned,
  active,
  onClick,
  artSize = 52,
  ownedLabel,
  onDelete,
}) {
  const footerLabel = active ? '사용 중' : owned ? (ownedLabel ?? '보유 중') : null

  const card = (
    <button type="button" className={`goods-card${active ? ' selected' : ''}`} onClick={() => onClick(item)}>
      <span className="goods-card-visual">
        <ItemArt item={item} size={artSize} />
      </span>
      <span className="goods-card-name">{item.name}</span>
      <span className="goods-card-footer">
        {footerLabel ? (
          <span className={`goods-card-owned${active ? ' on' : ''}`}>{footerLabel}</span>
        ) : (
          <span className="goods-card-price">
            <CoinIcon size={13} />
            {item.price.toLocaleString()}
          </span>
        )}
      </span>
    </button>
  )

  if (!onDelete) return card

  return (
    <div className="goods-card-wrap">
      {card}
      <button
        type="button"
        className="goods-card-delete"
        onClick={() => onDelete(item)}
        aria-label={`${item.name} 삭제`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}

// 2초 뒤 사라지는 짧은 알림. message가 바뀔 때마다 다시 띄운다.
export function GoodsToast({ message }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return undefined
    const showTimer = setTimeout(() => setVisible(true), 0)
    const hideTimer = setTimeout(() => setVisible(false), 2000)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [message])

  if (!visible || !message) return null
  return <div className="goods-toast">{message.text}</div>
}

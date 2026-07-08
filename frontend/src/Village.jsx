import { useState } from 'react'
import MainNav from './MainNav'
import villageMap from './assets/village-map.png'
import certMascot from './assets/cert-mascot.png'
import { AcornIcon } from './icons'
import './Village.css'

const PLACES = [
  { key: 'board', label: '테스트 게시판', top: '28%', left: '21%' },
  { key: 'library', label: '도서관', top: '24%', left: '84%', target: 'library' },
  { key: 'shop', label: '상점', top: '51%', left: '18%' },
  { key: 'room', label: '내 방', top: '48%', left: '75%' },
]

function Village({ onNavigate }) {
  const [showOngoing, setShowOngoing] = useState(true)

  return (
    <div className="village-page">
      <img className="village-bg" src={villageMap} alt="" aria-hidden="true" />

      <header className="village-topbar">
        <span className="village-title">마을</span>
        <div className="village-currency">
          <div className="currency-pill">
            <AcornIcon size={16} />
            <span>2,450</span>
          </div>
        </div>
      </header>

      <div className="village-map">
        {PLACES.map((p) => (
          <button
            key={p.key}
            type="button"
            className="place-pin"
            style={{ top: p.top, left: p.left }}
            onClick={p.target ? () => onNavigate(p.target) : undefined}
          >
            {p.label}
          </button>
        ))}
      </div>

      {showOngoing && (
        <div className="boss-card">
          <button type="button" className="boss-close" onClick={() => setShowOngoing(false)} aria-label="닫기">
            ×
          </button>
          <div className="boss-row">
            <div className="boss-icon">
              <img src={certMascot} alt="" />
            </div>
            <div className="boss-main">
              <p className="boss-eyebrow">진행중인 자격증</p>
              <div className="boss-head">
                <span className="boss-name">정보처리기사</span>
                <span className="boss-pct">72%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill warm" style={{ width: '72%' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <MainNav active="village" onNavigate={onNavigate} />
    </div>
  )
}

export default Village

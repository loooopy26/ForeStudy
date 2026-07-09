import { useState } from 'react'
import MainNav from './MainNav'
import villageMap from './assets/village-map.png'
import certMascot from './assets/cert-mascot.png'
import { AcornIcon } from './icons'
import './Village.css'

const PLACES = [
  {
    key: 'board',
    label: '퀘스트 게시판',
    top: '19%',
    left: '21%',
    target: 'forest',
    hotspot: { top: '31%', left: '20%', width: '32%', height: '13%' },
  },
  {
    key: 'library',
    label: '도서관',
    top: '18%',
    left: '85%',
    target: 'library',
    hotspot: { top: '31%', left: '83%', width: '34%', height: '20%' },
  },
  {
    key: 'shop',
    label: '상점',
    top: '55%',
    left: '18%',
    hotspot: { top: '56%', left: '18%', width: '32%', height: '17%' },
  },
  {
    key: 'room',
    label: '내 방',
    top: '53%',
    left: '75%',
    hotspot: { top: '55%', left: '76%', width: '37%', height: '23%' },
  },
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
            className="house-hotspot"
            aria-label={p.label}
            style={{
              top: p.hotspot.top,
              left: p.hotspot.left,
              width: p.hotspot.width,
              height: p.hotspot.height,
            }}
            onClick={p.target ? () => onNavigate(p.target) : undefined}
          />
        ))}

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

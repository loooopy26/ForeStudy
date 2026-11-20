import { useEffect, useState } from 'react'
import MainNav from './MainNav'
import CertSelect from './CertSelect'
import villageMap from './assets/village-map.png'
import certMascot from './assets/cert-mascot.png'
import { AcornIcon } from './icons'
import { useGoods } from './goods'
import { getCertificateProgress, getCurrentCertificates, getMyUser, onCertificatesUpdated } from './api'
import './Village.css'

const PLACES = [
  {
    key: 'board',
    label: '퀘스트 게시판',
    top: '24%',
    left: '18%',
    target: 'forest',
    hotspot: { top: '36%', left: '20%', width: '24%', height: '20%' },
  },
  {
    key: 'studymap',
    label: '스터디맵',
    top: '15%',
    left: '63%',
    target: 'studymap',
    hotspot: { top: '23%', left: '62%', width: '18%', height: '14%' },
  },
  {
    key: 'library',
    label: '도서관',
    top: '23%',
    left: '85%',
    target: 'library',
    hotspot: { top: '34%', left: '87%', width: '28%', height: '24%' },
  },
  {
    key: 'shop',
    label: '상점',
    top: '60%',
    left: '15%',
    target: 'shop',
    hotspot: { top: '71%', left: '18%', width: '32%', height: '21%' },
  },
  {
    key: 'dotori',
    label: '도토리그',
    top: '57%',
    left: '75%',
    target: 'dotori',
    hotspot: { top: '69%', left: '76%', width: '36%', height: '23%' },
  },
]

export function VillagePins({ onNavigate, active }) {
  return (
    <>
      {PLACES.map(({ key, label, target, hotspot }) => (
        <button
          key={key}
          type="button"
          className="house-hotspot"
          aria-label={label}
          tabIndex={-1}
          style={hotspot}
          onClick={() => onNavigate(target)}
        />
      ))}
      {PLACES.map(({ key, label, target, top, left }) => (
        <button
          key={key}
          type="button"
          className="place-pin"
          style={{ top, left }}
          aria-current={active === target ? 'page' : undefined}
          onClick={() => onNavigate(target)}
        >
          {label}
        </button>
      ))}
    </>
  )
}

function Village({ onNavigate, certName, onSelectCertificate }) {
  const { wallet } = useGoods()
  const [showOngoing, setShowOngoing] = useState(true)
  const [certificates, setCertificates] = useState(getCurrentCertificates)

  useEffect(() => onCertificatesUpdated(() => setCertificates(getCurrentCertificates())), [])
  const [progress, setProgress] = useState({ progress: 0, remainingDays: null })
  const [level, setLevel] = useState(1)
  const activeCertificate = certificates.find((certificate) => certificate.title === certName) || certificates[0]
  const activeTitle = activeCertificate?.title

  useEffect(() => {
    if (activeTitle) getCertificateProgress(activeTitle).then(setProgress).catch(() => {})
  }, [activeTitle])

  useEffect(() => {
    const syncAccount = () => {
      getMyUser()
        .then((user) => {
          if (typeof user?.level === 'number') setLevel(user.level)
        })
        .catch(() => {})
    }
    syncAccount()
    window.addEventListener('forestudy:user-updated', syncAccount)
    return () => window.removeEventListener('forestudy:user-updated', syncAccount)
  }, [])

  return (
    <div className="village-page">
      <img className="village-bg" src={villageMap} alt="" aria-hidden="true" />

      <header className="village-topbar">
        <span className="village-title">마을</span>
        <div className="village-currency">
          <div className="currency-pill">
            <span className="currency-pill-lvl">Lv.{level}</span>
            <div className="currency-pill-acorn">
              <AcornIcon size={16} />
              <span>{wallet.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="village-map">
        <VillagePins onNavigate={onNavigate} />
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
                {certificates.length > 1 ? (
                  <CertSelect
                    certificates={certificates}
                    value={activeCertificate?.title || ''}
                    onChange={onSelectCertificate}
                    menuPlacement="top"
                  />
                ) : <span className="boss-name">{activeCertificate?.title || '등록한 자격증 없음'}</span>}
                {progress.remainingDays !== null && <span className="boss-dday">D-{progress.remainingDays}</span>}
                <span className="boss-pct">{progress.progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill warm" style={{ width: `${progress.progress}%` }} />
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

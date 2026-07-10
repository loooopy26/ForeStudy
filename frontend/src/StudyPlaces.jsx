import { useState } from 'react'
import iconPinBadge from './assets/icon-pin-badge.png'
import iconLightbulb from './assets/icon-lightbulb.png'
import iconTransportWalk from './assets/icon-transport-walk.png'
import iconTransportCar from './assets/icon-transport-car.png'
import iconTransportBus from './assets/icon-transport-bus.png'
import { BackIcon, BellIcon } from './icons'
import './StudyPlaces.css'

const PLACES = [
  {
    rank: 1,
    name: '스터디카페 온',
    tag: '스터디카페',
    tagColor: '#4C9A5D',
    tagBg: '#E4F3E4',
    address: '서울 중구 세종대로 110',
    walk: '도보 8분',
    car: '자동차 4분',
    transit: '대중교통 정보 없음',
    note: '조용하고 좌석 간격이 넓어 장시간 공부에 적합해요.',
  },
  {
    rank: 2,
    name: '코지북카페',
    tag: '카페',
    tagColor: '#B0863A',
    tagBg: '#FBEFD9',
    address: '서울 중구 을지로 22',
    walk: '도보 8분',
    car: '자동차 5분',
    transit: '대중교통 정보 없음',
    note: '콘센트와 와이파이가 잘 갖춰져 있어요.',
  },
]

function StudyPlaces({ onNavigate }) {
  const [hearts, setHearts] = useState({ 0: true, 1: false })
  const [radius, setRadius] = useState(3)
  const [radiusOpen, setRadiusOpen] = useState(false)

  const toggleHeart = (index) => setHearts((state) => ({ ...state, [index]: !state[index] }))

  return (
    <>
      <div className="sp-header">
        <button type="button" className="sp-back-btn" onClick={() => onNavigate('studymap')} aria-label="뒤로가기">
          <BackIcon />
        </button>
        <span className="sp-title">내 주변 학습장소 추천</span>
        <button type="button" className="sp-round-btn" aria-label="알림">
          <BellIcon size={22} />
        </button>
      </div>

      <div className="sp-scroll scroll-area">
        <div className="sp-location-card">
          <div className="sp-location-left">
            <img src={iconPinBadge} alt="" className="sp-location-pin-icon" />
            <div>
              <div className="sp-location-title">현재 위치</div>
              <div className="sp-location-addr">서울특별시 중구 세종대로 110</div>
            </div>
          </div>
          <button type="button" className="sp-manual-btn">수동 입력</button>
        </div>

        <div className="sp-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a39a8f" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <span>가까운 공부하기 좋은 카페 알려줘</span>
        </div>

        <div className="sp-chips">
          <button type="button" className="sp-chip sp-chip-active">
            <img src={iconTransportWalk} alt="" className="sp-chip-icon" />
            도보
          </button>
          <button type="button" className="sp-chip">
            <img src={iconTransportCar} alt="" className="sp-chip-icon" />
            자동차
          </button>
          <button type="button" className="sp-chip">
            <img src={iconTransportBus} alt="" className="sp-chip-icon" />
            대중교통
          </button>
          <div className="sp-chip-radius-wrap">
            <button type="button" className="sp-chip sp-chip-radius" onClick={() => setRadiusOpen((v) => !v)}>
              반경 {radius}km
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {radiusOpen && (
              <div className="sp-radius-menu">
                {[1, 3, 5, 10].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`sp-radius-option${r === radius ? ' active' : ''}`}
                    onClick={() => {
                      setRadius(r)
                      setRadiusOpen(false)
                    }}
                  >
                    {r}km
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sp-ai-banner">
          <span className="sp-ai-sparkle">✦</span>
          <span>'조용한 카페 · 콘센트 · 와이파이'로 검색했어요</span>
        </div>

        <div className="sp-ai-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a39a8f" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>검색 결과는 10~30초 정도 걸릴 수 있어요</span>
        </div>

        <div className="sp-map">
          <div className="sp-map-grid" />
          <div className="sp-map-road sp-map-road-1" />
          <div className="sp-map-road sp-map-road-2" />
          <div className="sp-map-user-ring" />
          <img src={iconPinBadge} alt="" className="sp-map-user-pin" />
          <div className="sp-map-marker" style={{ left: '24%', top: '24%', backgroundImage: `url(${iconPinBadge})` }}><span>3</span></div>
          <div className="sp-map-marker" style={{ left: '56%', top: '18%', backgroundImage: `url(${iconPinBadge})` }}><span>3</span></div>
          <div className="sp-map-marker" style={{ left: '80%', top: '34%', backgroundImage: `url(${iconPinBadge})` }}><span>3</span></div>
          <div className="sp-map-marker" style={{ left: '64%', top: '70%', backgroundImage: `url(${iconPinBadge})` }}><span>4</span></div>
          <button type="button" className="sp-map-compass">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3d332b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </button>
          <div className="sp-map-zoom">
            <button type="button" className="sp-map-zoom-btn sp-map-zoom-in">+</button>
            <button type="button" className="sp-map-zoom-btn">−</button>
          </div>
        </div>

        {PLACES.map((place, index) => (
          <div className="sp-place-card" key={place.name}>
            <div className="sp-place-top">
              <div className="sp-place-thumb-wrap">
                <div className="sp-place-thumb">
                  <span>cafe<br />photo</span>
                </div>
                <div className="sp-place-rank">{place.rank}</div>
              </div>
              <div className="sp-place-info">
                <div className="sp-place-title">
                  <span>{place.name}</span>
                  <span className="sp-place-tag" style={{ color: place.tagColor, background: place.tagBg }}>{place.tag}</span>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill={hearts[index] ? '#E0574B' : 'none'} stroke={hearts[index] ? '#E0574B' : '#c9beae'} strokeWidth="2" className="sp-place-heart" onClick={() => toggleHeart(index)}>
                    <path d="M20.8 4.6c-1.8-1.6-4.6-1.4-6.2.4L12 7.6l-2.6-2.6c-1.6-1.8-4.4-2-6.2-.4-2 1.8-2.1 4.9-.3 6.8l8.5 8.6a.8.8 0 0 0 1.2 0l8.5-8.6c1.8-1.9 1.7-5-.3-6.8z" />
                  </svg>
                </div>
                <div className="sp-place-addr">{place.address}</div>
              </div>
            </div>
            <div className="sp-place-modes">
              <span className="sp-place-mode">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="13" cy="4" r="2" />
                  <path d="M13 8l-3 5 4 3v5" />
                  <path d="M10 13l-3 2 1 6" />
                </svg>
                {place.walk}
              </span>
              <span className="sp-place-mode">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 16l1-5 2-4h8l2 4 1 5" />
                  <rect x="3" y="16" width="18" height="4" rx="1.5" />
                </svg>
                {place.car}
              </span>
              <span className="sp-place-mode">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="13" rx="3" />
                  <circle cx="8.5" cy="19.5" r="1.3" />
                  <circle cx="15.5" cy="19.5" r="1.3" />
                </svg>
                {place.transit}
              </span>
            </div>
            <div className="sp-place-note">
              <img src={iconLightbulb} alt="" className="sp-place-note-icon" />
              <span>{place.note}</span>
            </div>
          </div>
        ))}

        <button type="button" className="sp-retry-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
          다시 검색하기
        </button>
      </div>
    </>
  )
}

export default StudyPlaces

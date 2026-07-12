import { useCallback, useEffect, useMemo, useState } from 'react'
import iconPinBadge from './assets/icon-pin-badge.png'
import iconLightbulb from './assets/icon-lightbulb.png'
import { BackIcon, BellIcon } from './icons'
import { DEFAULT_ORIGIN, fetchNearbyStudyPlaces, getCurrentPositionSafe } from './api'
import TmapView from './TmapView'
import './StudyPlaces.css'

const TAG_STYLES = [
  { color: '#4C9A5D', bg: '#E4F3E4' },
  { color: '#B0863A', bg: '#FBEFD9' },
  { color: '#4C7A9A', bg: '#E1EEF6' },
]

// 백엔드 route(distance_meters/duration_minutes) → "도보 8분" 같은 화면 문구로 변환.
function formatMode(label, route) {
  if (!route || route.duration_minutes == null) return `${label} 정보 없음`
  return `${label} ${Math.round(route.duration_minutes)}분`
}

function StudyPlaces({ onNavigate }) {
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN)
  const [usingFallback, setUsingFallback] = useState(true)
  const [radius, setRadius] = useState(3)
  const [radiusOpen, setRadiusOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState([])
  const [resolvedKeywords, setResolvedKeywords] = useState([])
  const [hearts, setHearts] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSearched, setHasSearched] = useState(false)

  const toggleHeart = (id) => setHearts((state) => ({ ...state, [id]: !state[id] }))

  const search = useCallback(
    async (coord, radiusKm, queryText) => {
      setLoading(true)
      setError('')
      setHasSearched(true)
      try {
        const data = await fetchNearbyStudyPlaces({
          latitude: coord.latitude,
          longitude: coord.longitude,
          radiusMeters: radiusKm * 1000,
          query: queryText?.trim() || undefined,
        })
        setPlaces(data.places || [])
        setResolvedKeywords(data.resolved_keywords || [])
      } catch (err) {
        setError(err.message || '주변 학습장소를 불러오지 못했습니다.')
        setPlaces([])
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  // 최초 진입: 위치 권한만 확보(실패 시 기본 좌표)해서 지도 중심으로 쓴다. 검색은 사용자가
  // 검색어를 입력하거나 검색 버튼을 눌러야만 실행한다(자동 검색 없음).
  useEffect(() => {
    let alive = true
    ;(async () => {
      const coord = await getCurrentPositionSafe()
      if (!alive) return
      setOrigin({ latitude: coord.latitude, longitude: coord.longitude })
      setUsingFallback(coord.fallback)
    })()
    return () => {
      alive = false
    }
  }, [])

  const rerunSearch = () => search(origin, radius, query)

  const mapMarkers = useMemo(
    () => [
      { id: 'origin', latitude: origin.latitude, longitude: origin.longitude, label: '●', color: '#4A7FE0', title: '현재 위치' },
      ...places.map((place, index) => ({
        id: place.id,
        latitude: place.latitude,
        longitude: place.longitude,
        label: index + 1,
        color: '#E0574B',
        title: place.name,
        subtitle: place.address || place.category,
      })),
    ],
    [origin, places],
  )

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
              <div className="sp-location-addr">
                {usingFallback
                  ? '기본 위치 (서울 시청) · 위치 권한 필요'
                  : `위도 ${origin.latitude.toFixed(4)}, 경도 ${origin.longitude.toFixed(4)}`}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="sp-manual-btn"
            onClick={async () => {
              const coord = await getCurrentPositionSafe()
              setOrigin({ latitude: coord.latitude, longitude: coord.longitude })
              setUsingFallback(coord.fallback)
              search(coord, radius, query)
            }}
          >
            위치 새로고침
          </button>
        </div>

        <form
          className="sp-search"
          onSubmit={(e) => {
            e.preventDefault()
            rerunSearch()
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a39a8f" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            className="sp-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="가까운 공부하기 좋은 카페 알려줘"
          />
        </form>

        <div className="sp-chips">
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
                      search(origin, r, query)
                    }}
                  >
                    {r}km
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="sp-chip sp-chip-active" onClick={rerunSearch}>
            검색
          </button>
        </div>

        {resolvedKeywords.length > 0 && (
          <div className="sp-ai-banner">
            <span className="sp-ai-sparkle">✦</span>
            <span>'{resolvedKeywords.join(' · ')}'(으)로 검색했어요</span>
          </div>
        )}

        <div className="sp-ai-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a39a8f" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>검색 결과는 10~30초 정도 걸릴 수 있어요</span>
        </div>

        <TmapView center={origin} markers={mapMarkers} height={210} />
        <div style={{ height: 14 }} />

        {loading && (
          <div className="sp-status sp-status-loading">주변 학습장소를 찾고 있어요...</div>
        )}
        {error && !loading && (
          <div className="sp-status sp-status-error">{error}</div>
        )}
        {!loading && !error && !hasSearched && (
          <div className="sp-status">검색어를 입력하거나 검색 버튼을 눌러 주변 학습장소를 찾아보세요.</div>
        )}
        {!loading && !error && hasSearched && places.length === 0 && (
          <div className="sp-status">근처에서 추천할 학습장소를 찾지 못했어요. 반경을 넓혀보세요.</div>
        )}

        {places.map((place, index) => {
          const tag = TAG_STYLES[index % TAG_STYLES.length]
          return (
            <div className="sp-place-card" key={place.id}>
              <div className="sp-place-top">
                <div className="sp-place-thumb-wrap">
                  <div className="sp-place-thumb">
                    <span>{place.category || '장소'}</span>
                  </div>
                  <div className="sp-place-rank">{index + 1}</div>
                </div>
                <div className="sp-place-info">
                  <div className="sp-place-title">
                    <span>{place.name}</span>
                    {place.category && (
                      <span className="sp-place-tag" style={{ color: tag.color, background: tag.bg }}>{place.category}</span>
                    )}
                    <svg width="17" height="17" viewBox="0 0 24 24" fill={hearts[place.id] ? '#E0574B' : 'none'} stroke={hearts[place.id] ? '#E0574B' : '#c9beae'} strokeWidth="2" className="sp-place-heart" onClick={() => toggleHeart(place.id)}>
                      <path d="M20.8 4.6c-1.8-1.6-4.6-1.4-6.2.4L12 7.6l-2.6-2.6c-1.6-1.8-4.4-2-6.2-.4-2 1.8-2.1 4.9-.3 6.8l8.5 8.6a.8.8 0 0 0 1.2 0l8.5-8.6c1.8-1.9 1.7-5-.3-6.8z" />
                    </svg>
                  </div>
                  <div className="sp-place-addr">{place.address || '주소 정보 없음'}</div>
                </div>
              </div>
              <div className="sp-place-modes">
                <span className="sp-place-mode">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="13" cy="4" r="2" />
                    <path d="M13 8l-3 5 4 3v5" />
                    <path d="M10 13l-3 2 1 6" />
                  </svg>
                  {formatMode('도보', place.routes?.walk)}
                </span>
                <span className="sp-place-mode">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 16l1-5 2-4h8l2 4 1 5" />
                    <rect x="3" y="16" width="18" height="4" rx="1.5" />
                  </svg>
                  {formatMode('자동차', place.routes?.car)}
                </span>
                <span className="sp-place-mode">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="13" rx="3" />
                    <circle cx="8.5" cy="19.5" r="1.3" />
                    <circle cx="15.5" cy="19.5" r="1.3" />
                  </svg>
                  {formatMode('대중교통', place.routes?.transit)}
                </span>
              </div>
              {place.recommendation_reason && (
                <div className="sp-place-note">
                  <img src={iconLightbulb} alt="" className="sp-place-note-icon" />
                  <span>{place.recommendation_reason}</span>
                </div>
              )}
            </div>
          )
        })}

        <button type="button" className="sp-retry-btn" onClick={rerunSearch} disabled={loading}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
          {loading ? '검색 중...' : hasSearched ? '다시 검색하기' : '검색하기'}
        </button>
      </div>
    </>
  )
}

export default StudyPlaces

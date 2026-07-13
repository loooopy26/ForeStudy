import { useMemo, useState } from 'react'
import { BackIcon, BellIcon } from './icons'
import iconSquirrelAcorn from './assets/icon-squirrel-acorn.png'
import iconSquirrelPoint from './assets/icon-squirrel-point.png'
import iconSquirrelCheer from './assets/icon-squirrel-cheer.png'
import iconLeaf1 from './assets/icon-leaf-1.png'
import iconLeaf2 from './assets/icon-leaf-2.png'
import iconLeaf3 from './assets/icon-leaf-3.png'
import iconTransportWalk from './assets/icon-transport-walk.png'
import iconTransportCar from './assets/icon-transport-car.png'
import iconTransportBus from './assets/icon-transport-bus.png'
import iconLightbulb from './assets/icon-lightbulb.png'
import iconWarning from './assets/icon-warning.png'
import { DEFAULT_ORIGIN, fetchExamDayAssistant, getCurrentPositionSafe, searchPlaces } from './api'
import TmapView from './TmapView'
import './ExamAssistant.css'

const NOTICES = [
  '경로 추천을 위해 현재 위치 접근 권한이 필요해요.',
  '위치 권한이 없으면 기본 위치(서울 시청)를 기준으로 계산해요.',
  '소요 시간은 예측치로 실제와 다를 수 있어요.',
]

const MODE_META = {
  walk: { label: '도보', cardClass: 'ea-transport-card-green', badgeClass: 'ea-transport-badge-green', icon: iconTransportWalk },
  car: { label: '자동차', cardClass: 'ea-transport-card-blue', badgeClass: 'ea-transport-badge-blue', icon: iconTransportCar },
  transit: { label: '대중교통', cardClass: 'ea-transport-card-orange', badgeClass: 'ea-transport-badge-orange', icon: iconTransportBus },
}

const MODE_ORDER = ['walk', 'car', 'transit']
const AMENITY_META = [
  { key: 'cafes', icon: '☕', tag: '카페' },
  { key: 'restaurants', icon: '🍚', tag: '식당' },
  { key: 'print_shops', icon: '🖨', tag: '프린트' },
]

function formatDistance(meters) {
  if (meters == null) return '-'
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`
}

function formatDuration(minutes) {
  return minutes == null ? '-' : `${Math.round(minutes)}분`
}

function ExamAssistant({ onNavigate }) {
  const [step, setStep] = useState(1)
  const [buffer, setBuffer] = useState(30)
  const [form, setForm] = useState({
    certification_name: '정보처리기사',
    exam_site_name: '서울국가자격시험장',
    exam_site_address: '서울특별시 중구 세종대로 110',
    exam_date: '2026-07-20',
    exam_start_time: '09:00',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [origin, setOrigin] = useState(null)
  const [usingFallback, setUsingFallback] = useState(false)
  // 출발지 선택: 'current'는 브라우저 위치, 'search'는 장소/주소 검색, 'map'은 지도 클릭.
  const [originMode, setOriginMode] = useState('current')
  const [originQuery, setOriginQuery] = useState('')
  const [originResults, setOriginResults] = useState([])
  const [originSearching, setOriginSearching] = useState(false)
  const [originPick, setOriginPick] = useState(null) // { latitude, longitude, label }
  const [mapPickCenter, setMapPickCenter] = useState(null) // 지도 선택 모드의 초기 중심(한 번만 설정)

  // 시험장 검색: 출발지 검색과 동일한 방식(장소명/주소 → 검색 API)으로 시험장을 찾아 선택하면
  // 이름/주소가 자동으로 채워진다. 검색 없이 직접 입력도 계속 가능하도록 입력창은 남겨둔다.
  const [examSiteQuery, setExamSiteQuery] = useState('')
  const [examSiteResults, setExamSiteResults] = useState([])
  const [examSiteSearching, setExamSiteSearching] = useState(false)
  const [examSitePick, setExamSitePick] = useState(null)

  const setField = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))
  const exam = result?.exam
  // 결과 화면에 보여줄 출발지 설명 (current 모드는 null → 기존 현재 위치 문구 사용)
  const originLabel =
    originMode === 'map'
      ? '지도에서 선택한 위치'
      : originMode === 'search'
        ? originPick?.label || originQuery.trim()
        : null

  const switchOriginMode = (mode) => {
    setOriginMode(mode)
    setError('')
    if (mode === 'map' && !mapPickCenter) {
      // 지도 선택 모드 첫 진입 시 현재 위치(실패하면 서울 시청)로 중심을 잡는다.
      getCurrentPositionSafe().then((position) =>
        setMapPickCenter({ latitude: position.latitude, longitude: position.longitude }),
      )
    }
  }

  const searchOrigin = async () => {
    const query = originQuery.trim()
    if (!query) return
    setOriginSearching(true)
    setError('')
    try {
      const data = await searchPlaces({ query })
      setOriginResults(data.places || [])
      if (!(data.places || []).length) setError('검색 결과가 없어요. 장소명이나 도로명 주소로 다시 시도해 보세요.')
    } catch (caught) {
      setError(caught.message || '장소 검색에 실패했습니다.')
    } finally {
      setOriginSearching(false)
    }
  }

  const pickOriginPlace = (place) => {
    setOriginPick({
      latitude: place.latitude,
      longitude: place.longitude,
      label: place.address ? `${place.name} (${place.address})` : place.name,
    })
    setOriginResults([])
    setError('')
  }

  const searchExamSite = async () => {
    const query = examSiteQuery.trim()
    if (!query) return
    setExamSiteSearching(true)
    setError('')
    try {
      const data = await searchPlaces({ query })
      setExamSiteResults(data.places || [])
      if (!(data.places || []).length) setError('검색 결과가 없어요. 시험장명이나 도로명 주소로 다시 시도해 보세요.')
    } catch (caught) {
      setError(caught.message || '시험장 검색에 실패했습니다.')
    } finally {
      setExamSiteSearching(false)
    }
  }

  const pickExamSite = (place) => {
    setForm((previous) => ({
      ...previous,
      exam_site_name: place.name,
      exam_site_address: place.address || place.name,
    }))
    // 검색 결과의 POI 좌표를 함께 보관해 주소를 다시 지오코딩하면서 시험장 위치가
    // 행정동 중심으로 바뀌지 않게 한다.
    setExamSitePick({ latitude: place.latitude, longitude: place.longitude })
    setExamSiteResults([])
    setExamSiteQuery('')
    setError('')
  }

  const mapMarkers = useMemo(() => {
    const markers = []
    if (origin) {
      markers.push({
        id: 'origin',
        latitude: origin.latitude,
        longitude: origin.longitude,
        label: originMode === 'current' ? '현' : '출',
        color: '#4A7FE0',
        title: originMode === 'current' ? '현재 위치' : '출발지',
        subtitle: originLabel || undefined,
      })
    }
    if (exam?.latitude != null && exam?.longitude != null) {
      markers.push({
        id: 'exam',
        latitude: exam.latitude,
        longitude: exam.longitude,
        label: '시',
        color: '#E0574B',
        title: exam.exam_site_name,
        subtitle: exam.exam_site_address,
      })
    }
    // 카페('카')/식당('식') 마커는 지도에 표시하지 않는다 — 시험장('시') 마커만 노출.
    // 카페·식당 정보는 지도 아래 amenities 목록(AMENITY_META, L.438)에서 별도로 보여준다.
    return markers
  }, [exam, origin, result, originMode, originLabel])

  const analyze = async () => {
    if (originMode === 'map' && !originPick) {
      setError('지도를 눌러 출발지를 먼저 선택해 주세요.')
      return
    }
    if (originMode === 'search' && !originPick && !originQuery.trim()) {
      setError('출발지를 검색해서 선택해 주세요.')
      return
    }
    setLoading(true)
    setError('')
    const examRequest = {
      ...form,
      ...(examSitePick ? { coordinate: examSitePick } : {}),
    }
    try {
      let data
      if (originMode === 'current') {
        const position = await getCurrentPositionSafe()
        setOrigin({ latitude: position.latitude, longitude: position.longitude })
        setUsingFallback(position.fallback)
        data = await fetchExamDayAssistant({
          origin: { latitude: position.latitude, longitude: position.longitude },
          exam: examRequest,
          bufferMinutes: buffer,
        })
      } else if (originPick) {
        // 검색 결과/지도 클릭으로 이미 좌표가 확정된 경우.
        setOrigin({ latitude: originPick.latitude, longitude: originPick.longitude })
        setUsingFallback(false)
        data = await fetchExamDayAssistant({
          origin: { latitude: originPick.latitude, longitude: originPick.longitude },
          exam: examRequest,
          bufferMinutes: buffer,
        })
      } else {
        // 검색어만 입력하고 결과를 고르지 않은 경우: 주소로 보고 백엔드 지오코딩에 맡긴다.
        data = await fetchExamDayAssistant({
          originAddress: originQuery.trim(),
          exam: examRequest,
          bufferMinutes: buffer,
        })
        setOrigin({ latitude: data.origin.latitude, longitude: data.origin.longitude })
        setUsingFallback(false)
      }
      setResult(data)
      setStep(2)
    } catch (caught) {
      setError(caught.message || 'AI 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 1) {
    return (
      <div className="ea-page">
        <div className="ea-header">
          <button type="button" className="ea-icon-btn ea-icon-btn-plain" onClick={() => onNavigate('studymap')} aria-label="뒤로가기">
            <BackIcon />
          </button>
          <span className="ea-header-title">시험 당일 AI 어시스턴트</span>
          <div className="ea-bookmark-btn"><BellIcon size={22} /></div>
        </div>

        <div className="ea-scroll scroll-area">
          <div className="ea-card" style={{ marginBottom: 14 }}>
            <div className="ea-card-title">시험 정보 입력</div>

            <label className="ea-field-label" htmlFor="exam-certification">자격증명</label>
            <div className="ea-input-row" style={{ marginBottom: 16 }}>
              <input id="exam-certification" className="ea-input-field" value={form.certification_name} onChange={setField('certification_name')} />
            </div>

            <label className="ea-field-label" htmlFor="exam-site-search">시험장 주소 검색</label>
            <div style={{ marginBottom: 16 }}>
              <div className="ea-input-row" style={{ gap: 8 }}>
                <input
                  id="exam-site-search"
                  className="ea-input-field"
                  value={examSiteQuery}
                  onChange={(event) => setExamSiteQuery(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && searchExamSite()}
                  placeholder="시험장명 또는 주소 (예: 서울국가자격시험장, 세종대로 110)"
                  aria-label="시험장 주소 검색"
                />
                <button type="button" className="ea-origin-search-btn" onClick={searchExamSite} disabled={examSiteSearching}>
                  {examSiteSearching ? '검색 중…' : '검색'}
                </button>
              </div>
              {examSiteResults.length > 0 && (
                <div className="ea-origin-results" role="listbox" aria-label="시험장 검색 결과">
                  {examSiteResults.map((place) => (
                    <button key={place.id} type="button" className="ea-origin-result" onClick={() => pickExamSite(place)}>
                      <span className="ea-origin-result-name">{place.name}</span>
                      <span className="ea-origin-result-addr">{place.address || place.category}</span>
                    </button>
                  ))}
                </div>
              )}
              {form.exam_site_address && (
                <div className="ea-origin-picked">
                  <span>📍 {form.exam_site_address}</span>
                </div>
              )}
            </div>

            <div className="ea-field-pair">
              <div style={{ flex: 1 }}>
                <label className="ea-field-label" htmlFor="exam-date">시험일</label>
                <div className="ea-input-row ea-input-row-tight">
                  <input id="exam-date" type="date" className="ea-input-field" value={form.exam_date} onChange={setField('exam_date')} />
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label className="ea-field-label" htmlFor="exam-time">시험 시작 시간</label>
                <div className="ea-input-row ea-input-row-tight">
                  <input id="exam-time" type="time" className="ea-input-field" value={form.exam_start_time} onChange={setField('exam_start_time')} />
                </div>
              </div>
            </div>

            <div className="ea-field-label">출발지</div>
            <div className="ea-origin-toggle" role="radiogroup" aria-label="출발지 선택">
              {[
                { key: 'current', label: '📍 현재 위치' },
                { key: 'search', label: '🔍 주소 검색' },
                { key: 'map', label: '🗺️ 지도에서 선택' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={originMode === key}
                  className={`ea-origin-option${originMode === key ? ' active' : ''}`}
                  onClick={() => switchOriginMode(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {originMode === 'search' && (
              <div style={{ marginBottom: 16 }}>
                <div className="ea-input-row" style={{ gap: 8 }}>
                  <input
                    id="origin-search"
                    className="ea-input-field"
                    value={originQuery}
                    onChange={(event) => {
                      setOriginQuery(event.target.value)
                      setOriginPick(null)
                    }}
                    onKeyDown={(event) => event.key === 'Enter' && searchOrigin()}
                    placeholder="장소명 또는 주소 (예: 강남역, 테헤란로 212)"
                    aria-label="출발지 검색"
                  />
                  <button type="button" className="ea-origin-search-btn" onClick={searchOrigin} disabled={originSearching}>
                    {originSearching ? '검색 중…' : '검색'}
                  </button>
                </div>
                {originPick && (
                  <div className="ea-origin-picked">
                    <span>📍 {originPick.label}</span>
                    <button type="button" onClick={() => setOriginPick(null)} aria-label="출발지 선택 해제">×</button>
                  </div>
                )}
                {originResults.length > 0 && (
                  <div className="ea-origin-results" role="listbox" aria-label="출발지 검색 결과">
                    {originResults.map((place) => (
                      <button key={place.id} type="button" className="ea-origin-result" onClick={() => pickOriginPlace(place)}>
                        <span className="ea-origin-result-name">{place.name}</span>
                        <span className="ea-origin-result-addr">{place.address || place.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {originMode === 'map' && (
              <div style={{ marginBottom: 16 }}>
                <TmapView
                  center={mapPickCenter || DEFAULT_ORIGIN}
                  markers={originPick ? [{ id: 'origin-pick', latitude: originPick.latitude, longitude: originPick.longitude, label: '출', color: '#4A7FE0', title: '출발지' }] : []}
                  height={200}
                  zoom={15}
                  onMapClick={(latitude, longitude) => {
                    setOriginPick({ latitude, longitude, label: '지도에서 선택한 위치' })
                    setError('')
                  }}
                />
                <div className="ea-buffer-hint" style={{ marginTop: 6 }}>
                  {originPick ? '출발지를 선택했어요. 다른 곳을 누르면 위치가 바뀌어요.' : '지도를 눌러 출발지를 선택하세요.'}
                </div>
              </div>
            )}

            <div className="ea-field-pair" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div className="ea-field-label">버퍼 시간 (분)</div>
                <div className="ea-buffer-row">
                  <button type="button" className="ea-buffer-btn" onClick={() => setBuffer((value) => Math.max(0, value - 5))}>−</button>
                  <span className="ea-buffer-value">{buffer}</span>
                  <button type="button" className="ea-buffer-btn" onClick={() => setBuffer((value) => Math.min(180, value + 5))}>+</button>
                </div>
                <div className="ea-buffer-hint">시험 시작 전 여유 시간을 확보해 드릴게요.</div>
              </div>
            </div>
          </div>

          <div className="ea-ai-box">
            <div>
              <div className="ea-ai-title">AI가 도와드려요!</div>
              <div className="ea-ai-desc">최적의 이동 경로, 출발 시간, 준비물 체크까지 시험 당일을 준비할 수 있어요.</div>
            </div>
            <img src={iconSquirrelAcorn} alt="" className="ea-mascot-img" />
          </div>

          {error && <div className="ea-error-box">{error}</div>}
          <button type="button" className="ea-cta" onClick={analyze} disabled={loading}>
            {loading ? 'AI 분석 중… (10~30초)' : 'AI 분석 시작하기'}
          </button>

          <div className="ea-card">
            <div className="ea-notice-heading"><img src={iconLightbulb} alt="" className="ea-notice-icon" /><span>안내사항</span></div>
            {NOTICES.map((notice) => (
              <div className="ea-notice-row" key={notice}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#5FAE6E" stroke="none" style={{ marginTop: 1, flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="ea-notice-text">{notice}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const routes = result?.routes || {}
  const guidance = result?.guidance || {}
  const nearby = result?.nearby_exam_site_places || {}
  const recommendedMode = guidance.recommended_transport_mode
  const departureRoute = (recommendedMode && routes[recommendedMode]) || MODE_ORDER.map((mode) => routes[mode]).find((route) => route?.recommended_departure_time)
  const amenities = AMENITY_META.flatMap(({ key, icon, tag }) =>
    (nearby[key] || []).slice(0, 1).map((place) => ({ ...place, icon, tag })),
  )

  return (
    <div className="ea-page">
      <div className="ea-header">
        <button type="button" className="ea-icon-btn ea-icon-btn-plain" onClick={() => setStep(1)} aria-label="뒤로가기"><BackIcon /></button>
        <span className="ea-header-title">AI 어시스턴트 결과</span>
        <div className="ea-bookmark-btn"><BellIcon size={22} /></div>
      </div>

      <div className="ea-scroll scroll-area">
        <div className="ea-departure-card" style={{ marginBottom: 12 }}>
          <div className="ea-departure-label">추천 출발 시간</div>
          <div className="ea-departure-time">{departureRoute?.recommended_departure_time || '정보 없음'}</div>
          <div className="ea-departure-sub">{recommendedMode ? `${MODE_META[recommendedMode].label} 기준 · 버퍼 ${buffer}분 포함` : `버퍼 ${buffer}분 포함`}</div>
          <div className="ea-departure-hint">
            {originLabel
              ? `출발지(${originLabel}) 기준으로 계산했어요.`
              : usingFallback
                ? '기본 위치(서울 시청)를 기준으로 계산했어요.'
                : '현재 위치를 기준으로 계산했어요.'}
          </div>
          <img src={iconSquirrelPoint} alt="" className="ea-departure-mascot" />
          <img src={iconLeaf2} alt="" className="ea-departure-leaf ea-departure-leaf-2" />
          <img src={iconLeaf3} alt="" className="ea-departure-leaf ea-departure-leaf-3" />
        </div>

        <TmapView center={exam?.latitude != null ? { latitude: exam.latitude, longitude: exam.longitude } : (origin || { latitude: 37.5665, longitude: 126.978 })} markers={mapMarkers} height={180} zoom={15} />
        <div style={{ height: 14 }} />

        <div className="ea-row" style={{ gap: 10, marginBottom: 16 }}>
          {MODE_ORDER.map((mode) => {
            const meta = MODE_META[mode]
            const route = routes[mode]
            return (
              <div className={`ea-transport-card ${meta.cardClass}`} key={mode}>
                <div className="ea-transport-heading"><img src={meta.icon} alt="" className="ea-transport-icon" /><span>{meta.label}</span></div>
                <div className="ea-transport-meta">{route ? `${formatDistance(route.distance_meters)} · ${formatDuration(route.duration_minutes)}` : '정보 없음'}</div>
                {route?.recommended_departure_time
                  ? <div className={`ea-transport-badge ${meta.badgeClass}`}>{route.recommended_departure_time} 출발 권장</div>
                  : <div className="ea-transport-hint">경로 정보를 가져오지 못했어요.</div>}
              </div>
            )
          })}
        </div>

        <div className="ea-section-title">추천 및 유의사항</div>
        <div className="ea-row" style={{ gap: 10, marginBottom: 16 }}>
          <div className="ea-advice-card">
            <div className="ea-advice-heading"><span className="ea-best-badge">Best</span><span>{recommendedMode ? `${MODE_META[recommendedMode].label} 추천` : '이동수단 추천'}</span></div>
            <div className="ea-advice-text">{guidance.recommended_transport_reason || '추천 정보를 가져오지 못했어요.'}</div>
          </div>
          <div className="ea-advice-card">
            <div className="ea-advice-heading"><img src={iconWarning} alt="" className="ea-advice-icon-img" /><span>주의사항</span></div>
            <div className="ea-advice-text ea-advice-text-sm">
              {(guidance.risk_notes || []).length > 0 ? guidance.risk_notes.map((note, index) => <div key={index}>· {note}</div>) : '특이 유의사항이 없어요.'}
            </div>
          </div>
        </div>

        <div className="ea-list-group" style={{ marginBottom: 16 }}>
          <div className="ea-list-card">
            <div className="ea-list-title">시험 당일 할 일</div>
            {(guidance.action_plan || []).length > 0 ? guidance.action_plan.map((text, index) => (
              <div className="ea-todo-row" key={index}><div className="ea-todo-num">{index + 1}</div><span className="ea-todo-text">{text}</span></div>
            )) : <div className="ea-todo-text" style={{ padding: '4px 0' }}>할 일 정보를 가져오지 못했어요.</div>}
          </div>
          <div className="ea-list-card">
            <div className="ea-list-title">준비물 체크리스트</div>
            {(guidance.preparation_items || []).length > 0 ? guidance.preparation_items.map((item) => (
              <div className="ea-check-row" key={item}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#5FAE6E" stroke="none" style={{ flexShrink: 0 }}><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M7 12l3 3 7-7" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="ea-check-text">{item}</span>
              </div>
            )) : <div className="ea-check-text" style={{ padding: '4px 0' }}>준비물 정보를 가져오지 못했어요.</div>}
            <img src={iconLeaf1} alt="" className="ea-checklist-leaf" />
          </div>
        </div>

        <div className="ea-cheer-box" style={{ marginBottom: 16 }}><img src={iconSquirrelCheer} alt="" className="ea-cheer-mascot" /><div className="ea-cheer-text">오늘의 준비가 시험 당일의 자신감이 됩니다!</div></div>

        <div className="ea-amenity-header"><span>시험장 주변 편의시설</span></div>
        {amenities.length > 0 ? (
          <div className="ea-row">
            {amenities.map((amenity) => (
              <div className="ea-amenity-card" key={`${amenity.tag}-${amenity.id}`}>
                <div className="ea-amenity-heading"><span>{amenity.icon}</span><span className="ea-amenity-name">{amenity.name}</span><span className="ea-amenity-tag">{amenity.tag}</span></div>
                <div className="ea-amenity-addr">{amenity.address || '주소 정보 없음'}</div>
                <div className="ea-amenity-dist-row"><span className="ea-amenity-dist">{formatDistance(amenity.distance_meters)}</span></div>
              </div>
            ))}
          </div>
        ) : <div className="ea-amenity-empty">주변 편의시설 정보를 찾지 못했어요.</div>}
      </div>
    </div>
  )
}

export default ExamAssistant

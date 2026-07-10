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
import { fetchExamDayAssistant, getCurrentPositionSafe } from './api'
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

  const setField = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))
  const exam = result?.exam

  const mapMarkers = useMemo(() => {
    const markers = []
    if (origin) {
      markers.push({ id: 'origin', latitude: origin.latitude, longitude: origin.longitude, label: '현', color: '#4A7FE0', title: '현재 위치' })
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
    const nearby = result?.nearby_exam_site_places || {}
    AMENITY_META.forEach(({ key, tag }) => {
      ;(nearby[key] || []).forEach((place, index) => {
        if (place.latitude == null || place.longitude == null) return
        markers.push({
          id: `${key}-${place.id ?? index}`,
          latitude: place.latitude,
          longitude: place.longitude,
          label: tag[0],
          color: '#C77A2E',
          title: place.name,
          subtitle: tag,
        })
      })
    })
    return markers
  }, [exam, origin, result])

  const analyze = async () => {
    setLoading(true)
    setError('')
    try {
      const position = await getCurrentPositionSafe()
      setOrigin({ latitude: position.latitude, longitude: position.longitude })
      setUsingFallback(position.fallback)
      const data = await fetchExamDayAssistant({
        origin: { latitude: position.latitude, longitude: position.longitude },
        exam: form,
        bufferMinutes: buffer,
      })
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

            <label className="ea-field-label" htmlFor="exam-site-name">시험장 이름</label>
            <div className="ea-input-row" style={{ marginBottom: 16 }}>
              <input id="exam-site-name" className="ea-input-field" value={form.exam_site_name} onChange={setField('exam_site_name')} />
            </div>

            <label className="ea-field-label" htmlFor="exam-site-address">시험장 주소</label>
            <div className="ea-input-row" style={{ marginBottom: 16 }}>
              <input id="exam-site-address" className="ea-input-field" value={form.exam_site_address} onChange={setField('exam_site_address')} placeholder="도로명 주소" />
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
          <div className="ea-departure-hint">{usingFallback ? '기본 위치(서울 시청)를 기준으로 계산했어요.' : '현재 위치를 기준으로 계산했어요.'}</div>
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

import { useState } from 'react'
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
import iconAmenityFood from './assets/icon-amenity-food.png'
import iconAmenityPrint from './assets/icon-amenity-print.png'
import iconAmenityCafe from './assets/icon-amenity-cafe.png'
import './ExamAssistant.css'

const NOTICES = [
  '경로 추천을 위해 현재 위치 접근 권한이 필요해요.',
  '교통 상황은 실시간으로 반영되어 추천됩니다.',
  '소요 시간은 예측치로 실제와 다를 수 있어요.',
]

const TODOS = [
  { n: 1, time: '07:40', text: '기상' },
  { n: 2, time: '08:10', text: '출발 준비 완료' },
  { n: 3, time: '08:16', text: '차량 이동 시작' },
  { n: 4, time: '08:30', text: '시험장 도착' },
  { n: 5, time: '08:40', text: '입실 완료' },
]

const CHECKLIST = ['신분증', '수험표', '검은 펜', '물', '휴대폰 무음 확인']

const AMENITIES = [
  { icon: iconAmenityCafe, name: '모닝카페', tag: '카페', tagColor: 'cafe', addr: '세종대로 118', dist: '120m' },
  { icon: iconAmenityFood, name: '한식뷔페', tag: '식당', tagColor: 'food', addr: '태평로 12', dist: '230m' },
  { icon: iconAmenityPrint, name: '스피드프린트', tag: '출력소', tagColor: 'print', addr: '무교로 8', dist: '310m' },
]

function ExamAssistant({ onNavigate }) {
  const [step, setStep] = useState(1)
  const [buffer, setBuffer] = useState(30)

  return step === 1 ? (
    <div className="ea-page">
      <div className="ea-header">
        <button type="button" className="ea-icon-btn ea-icon-btn-plain" onClick={() => onNavigate('studymap')} aria-label="뒤로가기">
          <BackIcon />
        </button>
        <span className="ea-header-title">시험 당일 AI 어시스턴트</span>
        <div className="ea-bookmark-btn">
          <BellIcon size={22} />
        </div>
      </div>

      <div className="ea-scroll scroll-area">
        <div className="ea-card" style={{ marginBottom: 14 }}>
          <div className="ea-card-title">시험 정보 입력</div>

          <div className="ea-field-label">자격증명</div>
          <div className="ea-input-row" style={{ marginBottom: 16 }}>
            <span className="ea-input-value">정보처리기사</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          <div className="ea-field-label">시험장 이름</div>
          <div className="ea-input-row" style={{ marginBottom: 16 }}>
            <span className="ea-input-value">서울국가자격시험장</span>
          </div>

          <div className="ea-field-label">시험장 주소</div>
          <div className="ea-input-row" style={{ marginBottom: 16 }}>
            <span className="ea-input-value">서울특별시 중구 세종대로 110</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5FAE6E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </div>

          <div className="ea-field-pair">
            <div style={{ flex: 1 }}>
              <div className="ea-field-label">시험일</div>
              <div className="ea-input-row ea-input-row-tight">
                <span className="ea-input-value-sm">2026-07-20 (일)</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="17" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                </svg>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="ea-field-label">시험 시작 시간</div>
              <div className="ea-input-row ea-input-row-tight">
                <span className="ea-input-value-sm">09:00</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a8078" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
            </div>
          </div>

          <div className="ea-field-pair" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="ea-field-label">버퍼 시간 (분)</div>
              <div className="ea-buffer-row">
                <button type="button" className="ea-buffer-btn" onClick={() => setBuffer((value) => Math.max(0, value - 5))}>−</button>
                <span className="ea-buffer-value">{buffer}</span>
                <button type="button" className="ea-buffer-btn" onClick={() => setBuffer((value) => value + 5)}>+</button>
              </div>
              <div className="ea-buffer-hint">시험 시작 전 여유 시간을<br />확보해 드릴게요.</div>
            </div>
          </div>
        </div>

        <div className="ea-ai-box">
          <div>
            <div className="ea-ai-title">AI가 도와드려요!</div>
            <div className="ea-ai-desc">
              최적의 이동 경로, 출발 시간, 준비물 체크까지
              <br />
              시험 당일을 완벽하게 준비할 수 있어요.
            </div>
          </div>
          <img src={iconSquirrelAcorn} alt="" className="ea-mascot-img" />
        </div>

        <button type="button" className="ea-cta" onClick={() => setStep(2)}>
          AI 분석 시작하기
        </button>

        <div className="ea-card">
          <div className="ea-notice-heading">
            <img src={iconLightbulb} alt="" className="ea-notice-icon" />
            <span>안내사항</span>
          </div>
          {NOTICES.map((notice) => (
            <div className="ea-notice-row" key={notice}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#5FAE6E" stroke="none" style={{ marginTop: 1, flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12l3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="ea-notice-text">{notice}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : (
    <div className="ea-page">
      <div className="ea-header">
        <button type="button" className="ea-icon-btn ea-icon-btn-plain" onClick={() => setStep(1)} aria-label="뒤로가기">
          <BackIcon />
        </button>
        <span className="ea-header-title">AI 어시스턴트 결과</span>
        <div className="ea-bookmark-btn">
          <BellIcon size={22} />
        </div>
      </div>

      <div className="ea-scroll scroll-area">
        <div className="ea-departure-card" style={{ marginBottom: 12 }}>
          <div className="ea-departure-label">추천 출발 시간</div>
          <div className="ea-departure-time">07:10</div>
          <div className="ea-departure-sub">(출발까지 1시간 20분)</div>
          <div className="ea-departure-hint">지금 출발하면 여유롭게 도착할 수 있어요!</div>
          <img src={iconSquirrelPoint} alt="" className="ea-departure-mascot" />
          <img src={iconLeaf2} alt="" className="ea-departure-leaf ea-departure-leaf-2" />
          <img src={iconLeaf3} alt="" className="ea-departure-leaf ea-departure-leaf-3" />
        </div>

        <div className="ea-map-placeholder" style={{ marginBottom: 14 }}>
          <svg viewBox="0 0 335 120" width="100%" height="100%" preserveAspectRatio="none">
            <rect width="335" height="120" fill="#E4EAD6" />
            <path d="M-10 95 Q60 100 100 75 T190 45 T360 15" stroke="#DCD2B8" strokeWidth="12" fill="none" strokeLinecap="round" />
            <path d="M-10 95 Q60 100 100 75 T190 45 T360 15" stroke="#5A8AD6" strokeWidth="2.5" strokeDasharray="1 7" fill="none" strokeLinecap="round" />
            <circle cx="20" cy="92" r="6" fill="#5A8AD6" stroke="#fff" strokeWidth="1.5" />
            <text x="20" y="80" fontSize="9" fill="#4a5a3a" textAnchor="middle" fontWeight="700">집</text>
            <circle cx="165" cy="55" r="5" fill="#fff" stroke="#5A8AD6" strokeWidth="2.2" />
            <text x="165" y="70" fontSize="8.5" fill="#4a5a3a" textAnchor="middle">서울역</text>
            <circle cx="308" cy="20" r="6.5" fill="#E0574B" stroke="#fff" strokeWidth="1.5" />
            <text x="308" y="35" fontSize="9" fill="#4a5a3a" textAnchor="middle" fontWeight="700">시험장</text>
          </svg>
        </div>

        <div className="ea-transport-group" style={{ marginBottom: 16 }}>
          <div className="ea-transport-card ea-transport-card-green">
            <div className="ea-transport-heading">
              <img src={iconTransportWalk} alt="" className="ea-transport-icon" />
              <span>도보</span>
            </div>
            <div className="ea-transport-meta">1.8km · 26분</div>
            <div className="ea-transport-badge ea-transport-badge-green">08:04 출발 권장</div>
          </div>
          <div className="ea-transport-card ea-transport-card-blue">
            <div className="ea-transport-heading">
              <img src={iconTransportCar} alt="" className="ea-transport-icon" />
              <span>자동차</span>
            </div>
            <div className="ea-transport-meta">3.2km · 14분</div>
            <div className="ea-transport-badge ea-transport-badge-blue">08:16 출발 권장</div>
          </div>
          <div className="ea-transport-card ea-transport-card-orange">
            <div className="ea-transport-heading">
              <img src={iconTransportBus} alt="" className="ea-transport-icon" />
              <span>대중교통</span>
            </div>
            <div className="ea-transport-meta">2.4km · 19분</div>
            <div className="ea-transport-badge ea-transport-badge-orange">08:11 출발 권장</div>
          </div>
        </div>

        <div className="ea-section-divider" />

        <div className="ea-advice-group" style={{ marginBottom: 16 }}>
          <div className="ea-section-title ea-section-title-inbox">
            <img src={iconLightbulb} alt="" className="ea-advice-icon-img" />
            <span>추천 및 유의사항</span>
          </div>
          <div className="ea-advice-group-divider" />
          <div className="ea-advice-group-row">
            <div className="ea-advice-card">
              <div className="ea-advice-heading">
                <span className="ea-best-badge">Best</span>
                <span>자동차 추천</span>
              </div>
              <div className="ea-advice-text ea-advice-text-push">시험 시작 전 여유 시간을 확보하기 쉽고 도착 시간 변동이 상대적으로 적어요.</div>
            </div>
            <div className="ea-advice-card">
              <div className="ea-advice-heading">
                <img src={iconWarning} alt="" className="ea-advice-icon-img" />
                <span>주의사항</span>
              </div>
              <div className="ea-advice-text ea-advice-text-sm">
                <div className="ea-advice-bullet">출근 시간대 정체를 고려해 최소 30분 여유를 두세요.</div>
                <div className="ea-advice-bullet">시험장 주차 가능 여부를 미리 확인하세요.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ea-list-group" style={{ marginBottom: 16 }}>
          <div className="ea-list-card">
            <div className="ea-list-title">시험 당일 할 일</div>
            {TODOS.map((todo) => (
              <div className="ea-todo-row" key={todo.n}>
                <div className="ea-todo-num">{todo.n}</div>
                <span className="ea-todo-text"><b>{todo.time}</b> {todo.text}</span>
              </div>
            ))}
          </div>
          <div className="ea-list-card">
            <div className="ea-list-title">준비물 체크리스트</div>
            {CHECKLIST.map((item) => (
              <div className="ea-check-row" key={item}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#4F8863" stroke="none" style={{ flexShrink: 0 }}>
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <path d="M7 12l3 3 7-7" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="ea-check-text">{item}</span>
              </div>
            ))}
            <img src={iconLeaf1} alt="" className="ea-checklist-leaf" />
          </div>
        </div>

        <div className="ea-cheer-box" style={{ marginBottom: 16 }}>
          <img src={iconSquirrelCheer} alt="" className="ea-cheer-mascot" />
          <div className="ea-cheer-text">"여러분의 노력이 가장 빛나는 하루가 되길 응원합니다!"</div>
        </div>

        <div className="ea-cheer-divider" />

        <div className="ea-amenity-section">
          <div className="ea-amenity-header">
            <span>시험장 주변 편의시설</span>
            <span className="ea-see-more">더보기 ›</span>
          </div>
          <div className="ea-row">
            {AMENITIES.map((amenity) => (
              <div className="ea-amenity-card" key={amenity.name}>
                <div className="ea-amenity-top-row">
                  <img src={amenity.icon} alt="" className="ea-amenity-icon-img" />
                  {amenity.tag && <span className={`ea-amenity-tag ea-amenity-tag-${amenity.tagColor}`}>{amenity.tag}</span>}
                </div>
                <div className="ea-amenity-name">{amenity.name}</div>
                <div className="ea-amenity-addr">{amenity.addr}</div>
                <div className="ea-amenity-dist-row">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5FAE6E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span className="ea-amenity-dist">{amenity.dist}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExamAssistant

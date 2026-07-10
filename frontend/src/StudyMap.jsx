import { useState } from 'react'
import villageHero from './assets/village-hero.png'
import iconPinBadge from './assets/icon-pin-badge.png'
import iconBusBadge from './assets/icon-bus-badge.png'
import iconLeaf from './assets/icon-leaf.png'
import iconSquirrel from './assets/icon-squirrel-reading.png'
import { BellIcon } from './icons'
import Header from './Header'
import './StudyMap.css'

function StudyMap({ onNavigate }) {
  const [likedCafe, setLikedCafe] = useState(true)
  const [likedExam, setLikedExam] = useState(false)

  return (
    <div className="fp-scroll scroll-area">
      <div className="fp-hero" style={{ backgroundImage: `url(${villageHero})` }}>
        <div className="fp-hero-fade-bottom" />
        <div className="fp-hero-fade-top" />

        <Header
          title="스터디맵"
          onBack={() => onNavigate('village')}
          icon={<BellIcon size={22} />}
        />
      </div>

      <div className="fp-content">
        <div className="fp-content-fade" />

        <div className="fp-section-heading">
          <img src={iconLeaf} alt="" className="fp-section-leaf" />
          <span>어떤 기능을 사용해볼까요?</span>
          <img src={iconLeaf} alt="" className="fp-section-leaf flip" />
        </div>

        <div className="fp-card" style={{ marginBottom: 14 }}>
          <div className="fp-card-heading">
            <img src={iconPinBadge} alt="" className="fp-card-icon-img" />
            <span>내 주변 학습장소 추천</span>
          </div>
          <div className="fp-card-body">
            <div className="fp-card-copy">
              <div className="fp-card-desc">
                카페, 도서관, 스터디 공간 등
                <br />
                공부하기 좋은 장소를 찾아드려요.
              </div>
              <button type="button" className="fp-cta fp-cta-right" style={{ background: '#7FA870' }} onClick={() => onNavigate('studyplaces')}>
                시작하기 <span>→</span>
              </button>
            </div>
          </div>
        </div>

        <div className="fp-card" style={{ marginBottom: 0 }}>
          <div className="fp-card-heading">
            <img src={iconBusBadge} alt="" className="fp-card-icon-img" />
            <span>시험 당일 AI 어시스턴트</span>
          </div>
          <div className="fp-card-body">
            <div className="fp-card-copy">
              <div className="fp-card-desc">
                이동 경로 추천, 출발 시간, 준비물 체크까지
                <br />
                시험당일을 완벽하게 도와드려요.
              </div>
              <button type="button" className="fp-cta fp-cta-blue fp-cta-right" style={{ background: '#6487c8' }} onClick={() => onNavigate('examassistant')}>
                시작하기 <span>→</span>
              </button>
            </div>
          </div>
        </div>

        <div className="fp-section-divider" />

        <div className="fp-records-card">
        <div className="fp-row-header">
          <span className="fp-row-title">찜한 장소</span>
          <span className="fp-see-all">전체보기 <span className="fp-see-all-arrow">›</span></span>
        </div>

        {likedCafe && (
          <div className={`fp-record${!likedExam ? ' fp-record-last' : ''}`}>
            <div className="fp-record-thumb">
              <span>cafe<br />photo</span>
            </div>
            <div className="fp-record-info">
              <div className="fp-record-title">
                <span>코지북카페</span>
                <span className="fp-tag fp-tag-cafe">카페</span>
              </div>
              <div className="fp-record-meta">서울 중구 을지로 22</div>
              <div className="fp-record-meta">610m · 도보 8분</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={likedCafe ? '#E0574B' : 'none'} stroke={likedCafe ? '#E0574B' : '#c9beae'} strokeWidth="2" className="fp-heart" onClick={() => setLikedCafe((v) => !v)}>
              <path d="M20.8 4.6c-1.8-1.6-4.6-1.4-6.2.4L12 7.6l-2.6-2.6c-1.6-1.8-4.4-2-6.2-.4-2 1.8-2.1 4.9-.3 6.8l8.5 8.6a.8.8 0 0 0 1.2 0l8.5-8.6c1.8-1.9 1.7-5-.3-6.8z" />
            </svg>
          </div>
        )}

        {likedExam && (
          <div className="fp-record fp-record-last">
            <div className="fp-record-thumb">
              <span>exam<br />hall</span>
            </div>
            <div className="fp-record-info">
              <div className="fp-record-title">
                <span>정보처리기사 시험</span>
                <span className="fp-tag fp-tag-exam">시험</span>
              </div>
              <div className="fp-record-meta">서울국가자격시험장</div>
              <div className="fp-record-meta">2026-07-20 (월) 09:00</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={likedExam ? '#E0574B' : 'none'} stroke={likedExam ? '#E0574B' : '#c9beae'} strokeWidth="2" className="fp-heart" onClick={() => setLikedExam((v) => !v)}>
              <path d="M20.8 4.6c-1.8-1.6-4.6-1.4-6.2.4L12 7.6l-2.6-2.6c-1.6-1.8-4.4-2-6.2-.4-2 1.8-2.1 4.9-.3 6.8l8.5 8.6a.8.8 0 0 0 1.2 0l8.5-8.6c1.8-1.9 1.7-5-.3-6.8z" />
            </svg>
          </div>
        )}

        {!likedCafe && !likedExam && (
          <div className="fp-records-empty">아직 찜한 장소가 없어요</div>
        )}
        </div>

        <div className="fp-quote-card">
          <div className="fp-quote-title">오늘의 한 줄</div>
          <div className="fp-quote-text">"작은 노력이 쌓여 큰 결과를 만듭니다."</div>
          <img src={iconSquirrel} alt="" className="fp-quote-character" />
        </div>
      </div>
    </div>
  )
}

export default StudyMap

import { useEffect, useState } from 'react'
import MainNav from './MainNav'
import certFlag from './assets/cert-flag.png'
import homeBackground from './assets/home-bg.png'
import homeCharacter from './assets/home-character.png'
import { clearCurrentUser, getCertificateInfo, getCurrentCertificates, getDemoUser, getStats } from './api'
import {
  AcornIcon,
  BellIcon,
  ChevronRightIcon,
  FocusIcon,
  MedalIcon,
  PlusIcon,
  StarIcon,
} from './icons'
import './Profile.css'

// SQLite 타이머 데모 유저(Library.jsx의 TIMER_DEMO_USER_ID)와 동일한 고정 id.
const TIMER_DEMO_USER_ID = 1

const INFO_LABELS = {
  description: '시험 회차',
  docRegStartDt: '필기 접수 시작',
  docRegEndDt: '필기 접수 종료',
  docExamDt: '필기 시험일',
  docPassDt: '필기 합격 발표',
  pracRegStartDt: '실기 접수 시작',
  pracRegEndDt: '실기 접수 종료',
  pracExamStartDt: '실기 시험 시작',
  pracExamEndDt: '실기 시험 종료',
  pracPassDt: '최종 합격 발표',
  contents: '구분',
  fee: '응시 수수료',
}

function formatInfoValue(key, value) {
  if (/Dt$/.test(key) && /^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`
  }
  if (/fee/i.test(key) && /^\d+$/.test(value)) return `${Number(value).toLocaleString()}원`
  return value
}
// TEMP: 백엔드 서버가 아직 안 떠 있을 때(fetch 자체가 실패) 화면 확인용으로 보여줄 값.
// 백엔드 세팅 후 이 상수와 아래 catch의 fallback 처리는 제거할 것.
const DEV_FALLBACK_STATS = { focus: 72, comprehension: 65, persistence: 80, pass_rate: 68, current_streak_days: 5 }
const DEV_FALLBACK_DOTORI = 320

function Profile({ onNavigate }) {
  const [stats, setStats] = useState(null)
  const [dotori, setDotori] = useState(null)
  const [certificates] = useState(getCurrentCertificates)
  const [selectedCertificate, setSelectedCertificate] = useState(null)
  const [certificateInfo, setCertificateInfo] = useState(null)
  const [certificateInfoError, setCertificateInfoError] = useState('')
  const [certificateInfoLoading, setCertificateInfoLoading] = useState(false)

  useEffect(() => {
    getStats(TIMER_DEMO_USER_ID).then(setStats).catch((err) => {
      if (err instanceof TypeError) setStats(DEV_FALLBACK_STATS)
    })
    getDemoUser().then((user) => setDotori(user.dotori)).catch((err) => {
      if (err instanceof TypeError) setDotori(DEV_FALLBACK_DOTORI)
    })
  }, [])

  const handleLogout = () => {
    clearCurrentUser()
    onNavigate('auth')
  }

  const openCertificateInfo = async (certificate) => {
    setSelectedCertificate(certificate)
    setCertificateInfo(null)
    setCertificateInfoError('')
    setCertificateInfoLoading(true)
    try {
      setCertificateInfo(await getCertificateInfo(certificate.title))
    } catch (error) {
      setCertificateInfoError(error.message)
    } finally {
      setCertificateInfoLoading(false)
    }
  }

  const closeCertificateInfo = () => {
    setSelectedCertificate(null)
    setCertificateInfo(null)
    setCertificateInfoError('')
  }

  const statRows = [
    { key: 'focus', label: '집중력', value: stats?.focus, Icon: FocusIcon, suffix: '%' },
    { key: 'understanding', label: '이해도', value: stats?.comprehension, Icon: StarIcon, suffix: '%' },
    { key: 'review', label: '학습 지속성', value: stats?.persistence, Icon: MedalIcon, suffix: '%' },
    { key: 'passRate', label: '합격 가능성', value: stats ? Math.round(stats.pass_rate) : undefined, Icon: StarIcon, suffix: '%' },
  ]

  return (
    <div className="profile-page">
      <div
        className="profile-scene"
        aria-hidden="true"
        style={{ backgroundImage: `linear-gradient(180deg, rgba(255,248,231,0.78) 0%, rgba(255,248,231,0.2) 34%, rgba(255,248,231,0.86) 100%), url(${homeBackground})` }}
      />

      <header className="profile-topbar">
        <div className="brand">
          <span className="brand-wordmark" aria-label="Forestudy">
            <span className="brand-f">F</span>
            <span className="brand-o-wrap">
              <span className="brand-o">o</span>
              <span className="brand-leaf" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20 4C20 4 19.5 13 13 17C8.5 19.7 4 18.5 4 18.5C4 18.5 4.3 13.5 8 10C12.5 5.7 20 4 20 4Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </span>
            <span className="brand-rest">restudy</span>
          </span>
        </div>

        <div className="profile-topbar-actions">
          <button type="button" className="profile-logout-button" onClick={handleLogout}>
            로그아웃
          </button>
          <button type="button" className="icon-button forest-bell" aria-label="알림">
            <BellIcon />
          </button>
        </div>
      </header>

      <div className="body-scroll profile-body forest-home-body">
        <section className="profile-card profile-hero-card forest-panel">
          <img className="forest-character forest-character-floating" src={homeCharacter} alt="Forestudy 캐릭터" />

          <div className="profile-info hero-copy">
            <div className="profile-level hero-level">
              <StarIcon size={15} />
              <span>Lv.12</span>
            </div>
            <p className="profile-sub">성실한 학습자</p>
            <div className="xp-row">
              <span className="xp-label">XP</span>
              <span>1,240 / 2,000</span>
            </div>
            <div className="progress-track hero-progress">
              <div className="progress-fill" style={{ width: '62%' }} />
            </div>
          </div>
        </section>

        <section className="status-card forest-panel">
          <div className="status-head">
            <h2>상태창</h2>
            <button type="button" className="status-more">
              자세히 보기 <ChevronRightIcon />
            </button>
          </div>

          <div className="status-rows">
            {statRows.map(({ key, label, value, Icon, suffix = '' }) => (
              <div className="status-row" key={key}>
                <span className="status-label">
                  <span className="status-icon-badge">
                    <Icon size={14} />
                  </span>
                  <span className="status-label-text">{label}</span>
                </span>

                <div className="progress-track">
                  <div
                    className={`progress-fill${value !== undefined && value <= 50 ? ' warm' : ''}`}
                    style={{ width: `${value ?? 0}%` }}
                  />
                </div>

                <span className="status-value">
                  {value !== undefined ? value : '-'}
                  {value !== undefined ? suffix : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mini-card-row">
          <article className="mini-card forest-panel compact">
            <p className="mini-label">보유 도토리</p>
            <div className="mini-value mini-value-acorn">
              <AcornIcon size={28} />
              <span>{dotori !== null ? dotori.toLocaleString() : '-'}</span>
            </div>
          </article>

          <article className="mini-card forest-panel compact">
            <p className="mini-label">연속 학습</p>
            <div className="mini-value mini-value-days">
              <span>{stats ? `${stats.current_streak_days}일` : '-'}</span>
            </div>
          </article>
        </section>

        <section className="ongoing-card forest-panel cert-card">
          <div className="cert-head">
            <span className="cert-head-flag-wrap" aria-hidden="true">
              <img className="cert-head-flag" src={certFlag} alt="" />
            </span>
            <p className="cert-kicker">진행 중인 자격증</p>
          </div>

          {certificates.length > 0 ? (
            <div className="cert-list">
              {certificates.map((certificate) => (
                <article key={certificate.id} className="cert-row">
                  <div className="cert-copy">
                    <div className="cert-title-line">
                      <h3>{certificate.title}</h3>
                    </div>
                    <p>{certificate.subtitle}</p>
                  </div>
                  <div className="cert-progress">진행률 {certificate.progress}%</div>
                  <button type="button" className="start-button cert-start" onClick={() => openCertificateInfo(certificate)}>
                    정보 보기
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="cert-empty">
              <p>진행 중인 자격증이 없습니다.</p>
              <span>학습할 자격증을 추가해 보세요.</span>
            </div>
          )}

          <button type="button" className="cert-add-button" onClick={() => onNavigate('addcert')}>
            <PlusIcon size={15} /> 자격증 추가하기
          </button>
        </section>
      </div>

      {selectedCertificate && (
        <div className="cert-info-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeCertificateInfo()}>
          <section className="cert-info-modal" role="dialog" aria-modal="true" aria-labelledby="cert-info-title">
            <div className="cert-info-header">
              <div>
                <p>국가기술자격 시험정보</p>
                <h2 id="cert-info-title">{selectedCertificate.title}</h2>
              </div>
              <button type="button" onClick={closeCertificateInfo} aria-label="닫기">×</button>
            </div>

            {certificateInfoLoading && <p className="cert-info-status">공공데이터에서 정보를 불러오는 중입니다.</p>}
            {certificateInfoError && (
              <div className="cert-info-error" role="alert">
                <p>{certificateInfoError}</p>
                <div className="cert-info-error-actions">
                  <button type="button" onClick={() => openCertificateInfo(selectedCertificate)}>
                    다시 시도
                  </button>
                  <a href="https://www.q-net.or.kr" target="_blank" rel="noreferrer">
                    Q-Net에서 확인
                  </a>
                </div>
              </div>
            )}

            {certificateInfo && (
              <div className="cert-info-content">
                <div className="cert-info-summary">
                  <span>종목코드 {certificateInfo.code}</span>
                  {certificateInfo.series && <span>{certificateInfo.series}</span>}
                  {certificateInfo.sub_category && <span>{certificateInfo.sub_category}</span>}
                </div>

                <h3>시험 일정</h3>
                {certificateInfo.schedules.length > 0 ? certificateInfo.schedules.slice(0, 3).map((schedule, index) => (
                  <article className="cert-schedule" key={`${schedule.description || 'schedule'}-${index}`}>
                    {Object.entries(schedule).map(([key, value]) => (
                      <div key={key}>
                        <span>{INFO_LABELS[key] || key}</span>
                        <strong>{formatInfoValue(key, value)}</strong>
                      </div>
                    ))}
                  </article>
                )) : <p className="cert-info-status">등록된 시험 일정이 없습니다.</p>}

                <h3>응시 수수료</h3>
                {certificateInfo.fees.length > 0 ? certificateInfo.fees.map((fee, index) => (
                  <div className="cert-fee" key={index}>
                    {Object.entries(fee).map(([key, value]) => (
                      <span key={key}>{INFO_LABELS[key] || key}: <strong>{formatInfoValue(key, value)}</strong></span>
                    ))}
                  </div>
                )) : <p className="cert-info-status">등록된 수수료 정보가 없습니다.</p>}

                <a href={certificateInfo.source_url} target="_blank" rel="noreferrer">공공데이터포털 원문 보기</a>
              </div>
            )}
          </section>
        </div>
      )}

      <MainNav active="profile" onNavigate={onNavigate} />
    </div>
  )
}

export default Profile

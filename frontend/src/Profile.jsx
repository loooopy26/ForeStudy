import { useEffect, useState } from 'react'
import MainNav from './MainNav'
import certFlag from './assets/cert-flag.png'
import homeBackground from './assets/home-bg.png'
import homeCharacter from './assets/home-character.png'
import { getDemoUser, getStats } from './api'
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

const CERTS = [
  { key: 'infoproc', title: '정보처리기사', subtitle: '시험일 2/24', progress: 60 },
  { key: 'sqld', title: 'SQLD', subtitle: '시험일 10/4', progress: 20 },
]

function Profile({ onNavigate }) {
  const [stats, setStats] = useState(null)
  const [dotori, setDotori] = useState(null)

  useEffect(() => {
    getStats(TIMER_DEMO_USER_ID).then(setStats).catch(() => {})
    getDemoUser().then((user) => setDotori(user.dotori)).catch(() => {})
  }, [])

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

        <button type="button" className="icon-button forest-bell" aria-label="알림">
          <BellIcon />
        </button>
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
                  <span className="status-badge">
                    <Icon size={14} />
                  </span>
                  {label}
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

          <div className="cert-list">
            {CERTS.map((cert) => (
              <article key={cert.key} className="cert-row">
                <div className="cert-copy">
                  <div className="cert-title-line">
                    <h3>{cert.title}</h3>
                  </div>
                  <p>{cert.subtitle}</p>
                </div>

                <div className="cert-progress">{`진행률 ${cert.progress}%`}</div>

                <button type="button" className="start-button cert-start" onClick={() => onNavigate('village')}>
                  시작하기
                </button>
              </article>
            ))}
          </div>

          <button type="button" className="cert-add-button" onClick={() => onNavigate('addcert')}>
            <PlusIcon size={15} /> 자격증 추가하기
          </button>
        </section>
      </div>

      <MainNav active="profile" onNavigate={onNavigate} />
    </div>
  )
}

export default Profile

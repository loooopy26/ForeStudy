import { useEffect, useState } from 'react'
import MainNav from './MainNav'
import { BrandWordmark } from './BrandLogo'
import certFlag from './assets/cert-flag.png'
import homeBackground from './assets/home-bg.png'
import homeCharacter from './assets/home-character.png'
import CharacterAvatar from './CharacterAvatar'
import CertSelect from './CertSelect'
import { useGoods, getItem } from './goods'
import {
  clearCurrentUser,
  deleteCertGoal,
  deleteMaterial,
  getCertGoal,
  getCurrentCertificates,
  getCurrentUser,
  getCertificateProgress,
  getMyUser,
  getStats,
  removeCurrentCertificate,
  setCurrentUser,
} from './api'
import {
  AcornIcon,
  BellIcon,
  FocusIcon,
  MedalIcon,
  PlusIcon,
  StarIcon,
} from './icons'
import './Profile.css'

// SQLite 타이머 데모 유저(Library.jsx의 TIMER_DEMO_USER_ID)와 동일한 고정 id.
const TIMER_DEMO_USER_ID = 1

// TEMP: 백엔드 서버가 아직 안 떠 있을 때(fetch 자체가 실패) 화면 확인용으로 보여줄 값.
// 백엔드 세팅 후 이 상수와 아래 catch의 fallback 처리는 제거할 것.
const DEV_FALLBACK_STATS = { focus: 0, comprehension: 0, persistence: 0, pass_rate: 0, current_streak_days: 0 }
const DEV_FALLBACK_DOTORI = 320

function Profile({ onNavigate, materialId, certName, onSelectCertificate }) {
  const { equipped } = useGoods()
  const [stats, setStats] = useState(null)
  const [dotori, setDotori] = useState(null)
  const [certGoalInfo, setCertGoalInfo] = useState(null)
  const [certificates, setCertificates] = useState(getCurrentCertificates)
  const [selectedCertificate, setSelectedCertificate] = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingCertificate, setDeletingCertificate] = useState(false)
  const [certDeleteError, setCertDeleteError] = useState('')
  const [nickname, setNickname] = useState(() => getCurrentUser()?.nickname || '성실한 학습자')
  const [editingNickname, setEditingNickname] = useState(false)
  const [progressByCert, setProgressByCert] = useState({})

  useEffect(() => {
    getStats(TIMER_DEMO_USER_ID, materialId).then(setStats).catch((err) => {
      if (err instanceof TypeError) setStats(DEV_FALLBACK_STATS)
    })
    getMyUser().then((user) => setDotori(user.dotori)).catch((err) => {
      if (err instanceof TypeError) setDotori(DEV_FALLBACK_DOTORI)
    })
  }, [materialId])

  useEffect(() => {
    Promise.all(certificates.map(async (certificate) => [certificate.id, await getCertificateProgress(certificate.title)]))
      .then((entries) => setProgressByCert(Object.fromEntries(entries)))
      .catch(() => {})
  }, [certificates])

  const saveNickname = () => {
    const next = nickname.trim() || '성실한 학습자'
    setNickname(next)
    setCurrentUser({ ...(getCurrentUser() || {}), nickname: next })
    setEditingNickname(false)
  }

  const handleLogout = () => {
    clearCurrentUser()
    onNavigate('auth')
  }

  const openCertificateInfo = async (certificate) => {
    setSelectedCertificate(certificate)
    setDeleteConfirmOpen(false)
    setCertGoalInfo(null)

    try {
      const goal = await getCertGoal(certificate.title)
      setCertGoalInfo(goal)
    } catch {
      setCertGoalInfo(null)
    }
  }
  const getRemainingDays = (targetDate) => {
    if (!targetDate) return null

    const today = new Date()
    const target = new Date(targetDate)
    today.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)

    return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
  }

  const closeCertificateInfo = () => {
    setSelectedCertificate(null)
    setDeleteConfirmOpen(false)
  }

  const deleteSelectedCertificate = async () => {
    if (!selectedCertificate) return
    setDeletingCertificate(true)
    setCertDeleteError('')
    try {
      if (selectedCertificate.materialId) {
        await deleteMaterial(selectedCertificate.materialId)
      }
      // 목표 시험일 + 일별 학습 플랜(curricula)도 함께 정리 — 없으면 그냥 조용히 넘어간다.
      await deleteCertGoal(selectedCertificate.title).catch(() => { })
      setCertificates(removeCurrentCertificate(selectedCertificate.id))
      closeCertificateInfo()
    } catch (err) {
      setCertDeleteError(err.message || '학습 자료 삭제에 실패했습니다.')
    } finally {
      setDeletingCertificate(false)
    }
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
          <BrandWordmark size={25} />
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
          <button
            type="button"
            className="forest-character-button forest-character-floating"
            onClick={() => onNavigate('character')}
            aria-label="내 캐릭터 꾸미기"
          >
            <div className="forest-character-avatar-wrapper">
              <CharacterAvatar equipped={equipped} getItem={getItem} className="profile-character-avatar" />
            </div>
            <span className="forest-character-hint" aria-hidden="true">꾸미기</span>
          </button>

          <div className="profile-info hero-copy">
            <div className="profile-level hero-level">
              <StarIcon size={15} />
              <span>Lv.12</span>
            </div>
            {editingNickname ? (
              <form className="profile-nickname-edit" onSubmit={(event) => { event.preventDefault(); saveNickname() }}>
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength="20" autoFocus />
                <button type="submit">저장</button>
              </form>
            ) : (
              <div className="profile-nickname-row">
                <p className="profile-sub">{nickname}</p>
                <button type="button" className="profile-nickname-button" onClick={() => setEditingNickname(true)}>수정</button>
              </div>
            )}
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
          </div>

          {certificates.length > 1 && (
            <div className="profile-status-cert-selector">
              <span>자격증별 상태</span>
              <CertSelect certificates={certificates} value={certName} onChange={onSelectCertificate} />
            </div>
          )}

          {certificates.length === 0 ? (
            <p className="status-empty-message">자격증을 등록하면 상태창이 표시됩니다.</p>
          ) : (
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
          )}
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
                  <div className="cert-progress">진행률 {progressByCert[certificate.id]?.progress ?? 0}%</div>
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
                <p>진행 중인 자격증</p>
                <h2 id="cert-info-title" className="cert-info-title-row">
                  <span>{selectedCertificate.title}</span>
                  {certGoalInfo?.target_exam_date && (
                    <span className="cert-dday">
                      D-{getRemainingDays(certGoalInfo.target_exam_date)}
                    </span>
                  )}
                </h2>
              </div>
              <button type="button" onClick={closeCertificateInfo} aria-label="닫기">×</button>
            </div>
            <div className="cert-info-progress">
              <div><span>플랜 진행률</span><strong>{progressByCert[selectedCertificate.id]?.progress ?? 0}%</strong></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${progressByCert[selectedCertificate.id]?.progress ?? 0}%` }} /></div>
            </div>

            <div className="cert-delete-area">
              {deleteConfirmOpen ? (
                <div className="cert-delete-confirm" role="alert">
                  <p>삭제하시겠습니까?</p>
                  <p className="cert-delete-warning">
                    이 자격증으로 생성된 학습 자료 요약, 퀴즈, 학습 플랜이 함께 삭제되며 되돌릴 수 없습니다.
                  </p>
                  {certDeleteError && <p className="cert-delete-error">{certDeleteError}</p>}
                  <div>
                    <button
                      type="button"
                      className="cert-delete-cancel"
                      onClick={() => setDeleteConfirmOpen(false)}
                      disabled={deletingCertificate}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="cert-delete-confirm-button"
                      onClick={deleteSelectedCertificate}
                      disabled={deletingCertificate}
                    >
                      {deletingCertificate ? '삭제 중…' : '확인'}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="cert-delete-button" onClick={() => setDeleteConfirmOpen(true)}>
                  삭제하기
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      <MainNav active="profile" onNavigate={onNavigate} />
    </div>
  )
}

export default Profile

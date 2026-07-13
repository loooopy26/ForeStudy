import { useState } from 'react'
import { BackIcon, SearchIcon, ArrowUpRightIcon, BotIcon } from './icons'
import { getCurrentCertificates, isCertificatesLoaded, refreshCertificates } from './api'
import './AddCert.css'

const POPULAR = ['정보처리기사', '정보처리산업기사', 'SQLD', 'ADsP', '컴퓨터활용능력 1급']
const ALL_CERTS = [
  '정보처리기사',
  '정보처리산업기사',
  '정보처리기능사',
  '정보보안기사',
  '정보보안산업기사',
  'SQLD',
  'SQLP',
  'ADsP',
  'ADP',
  '컴퓨터활용능력 1급',
  '컴퓨터활용능력 2급',
  '네트워크관리사 1급',
  '네트워크관리사 2급',
  '리눅스마스터 1급',
  '리눅스마스터 2급',
  '빅데이터분석기사',
  '사무자동화산업기사',
  '전자상거래운용사',
]

const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]

function toChoseong(str) {
  let out = ''
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00
    out += code >= 0 && code <= 11171 ? CHOSEONG[Math.floor(code / 588)] : ch
  }
  return out
}

function matchesQuery(name, query) {
  return name.includes(query) || toChoseong(name).includes(query)
}

function AddCert({ onNavigate }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const suggestions = query && query !== selected
    ? ALL_CERTS.filter((s) => matchesQuery(s, query))
    : []

  const selectCertificate = (title) => {
    setQuery(title)
    setSelected(title)
    setError('')
  }

  const continueCertificateFlow = async () => {
    const title = selected.trim()
    if (!title) {
      setError('추가할 자격증을 선택해 주세요.')
      return
    }
    // 자격증 목록이 아직 백엔드에서 로드되기 전이면(첫 방문 등) 확정된 목록으로 다시
    // 확인해서, 실제로는 이미 등록된 자격증을 중복 검사 없이 통과시키지 않게 한다.
    const certificates = isCertificatesLoaded() ? getCurrentCertificates() : await refreshCertificates()
    if (certificates.some((certificate) => certificate.title === title)) {
      setError('이미 진행 중인 자격증입니다.')
      return
    }
    onNavigate('certUpload', { cert: title })
  }

  return (
    <div className="addcert-page">
      <header className="screen-header">
        <button type="button" className="back-button" onClick={() => onNavigate('profile')} aria-label="뒤로가기">
          <BackIcon />
        </button>
        <div className="header-title">자격증 추가하기</div>
        <div className="header-spacer" />
      </header>

      <div className="addcert-search">
        <SearchIcon />
        <input
          type="text"
          value={query}
          placeholder="자격증명을 검색해보세요"
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected('')
            setError('')
          }}
        />
      </div>

      <div className="body-scroll addcert-body">
        {suggestions.length > 0 && (
          <div>
            <p className="section-label">예측 검색어</p>
            <div className="suggestion-card">
              {suggestions.map((s) => (
                <button
                  type="button"
                  className={`suggestion-row${selected === s ? ' selected' : ''}`}
                  key={s}
                  onClick={() => selectCertificate(s)}
                  aria-pressed={selected === s}
                >
                  <span className="suggestion-icon">
                    <SearchIcon size={15} />
                  </span>
                  <span className="suggestion-name">{s}</span>
                  <ArrowUpRightIcon />
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="section-label">인기 자격증</p>
          <div className="popular-tags">
            {POPULAR.map((p) => (
              <button
                type="button"
                className={`popular-tag${selected === p ? ' selected' : ''}`}
                key={p}
                onClick={() => selectCertificate(p)}
                aria-pressed={selected === p}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="ai-callout">
          <div className="ai-avatar">
            <BotIcon size={18} />
          </div>
          <p>자격증의 학습 자료를 등록하면 AI가 맞춤 학습 플랜을 만들어드려요.</p>
        </div>

        <div className="addcert-submit-wrap">
          {error && <p className="addcert-error">{error}</p>}
          <button type="button" className="addcert-submit" onClick={continueCertificateFlow} disabled={!selected}>
            {selected ? `${selected} 등록 계속하기` : '자격증을 선택해 주세요'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddCert

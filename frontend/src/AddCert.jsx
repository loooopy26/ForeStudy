import { useState } from 'react'
import { BackIcon, SearchIcon, ArrowUpRightIcon, BotIcon } from './icons'
import { addCurrentCertificate, getCurrentCertificates } from './api'
import './AddCert.css'

const SUGGESTIONS = ['정보처리기사', '정보처리산업기사', '정보처리기능사', '정보보안기사']
const POPULAR = ['SQLD', '컴퓨터활용능력 1급', 'ADsP', '네트워크관리사 2급', '리눅스마스터 2급']

function AddCert({ onNavigate }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const suggestions = query
    ? SUGGESTIONS.filter((s) => s.includes(query))
    : SUGGESTIONS

  const selectCertificate = (title) => {
    setQuery(title)
    setSelected(title)
    setError('')
  }

  const addCertificate = () => {
    const title = selected.trim()
    if (!title) {
      setError('추가할 자격증을 선택해 주세요.')
      return
    }
    if (getCurrentCertificates().some((certificate) => certificate.title === title)) {
      setError('이미 진행 중인 자격증입니다.')
      return
    }
    addCurrentCertificate(title)
    onNavigate('profile')
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
          <p>자격증과 시험일정을 등록하면 AI가 맞춤 학습 플랜을 만들어드려요.</p>
        </div>

        <div className="addcert-submit-wrap">
          {error && <p className="addcert-error">{error}</p>}
          <button type="button" className="addcert-submit" onClick={addCertificate} disabled={!selected}>
            {selected ? `${selected} 추가하기` : '자격증을 선택해 주세요'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddCert

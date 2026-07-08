import { useState } from 'react'
import { BackIcon, SearchIcon, ArrowUpRightIcon, BotIcon } from './icons'
import './AddCert.css'

const SUGGESTIONS = ['정보처리기사', '정보처리산업기사', '정보처리기능사', '정보보안기사']
const POPULAR = ['SQLD', '컴퓨터활용능력 1급', 'ADsP', '네트워크관리사 2급', '리눅스마스터 2급']

function AddCert({ onNavigate }) {
  const [query, setQuery] = useState('')
  const suggestions = query
    ? SUGGESTIONS.filter((s) => s.includes(query))
    : SUGGESTIONS

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
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="body-scroll addcert-body">
        <div>
          <p className="section-label">예측 검색어</p>
          <div className="suggestion-card">
            {suggestions.map((s) => (
              <button type="button" className="suggestion-row" key={s} onClick={() => setQuery(s)}>
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
              <button type="button" className="popular-tag" key={p} onClick={() => setQuery(p)}>
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
      </div>
    </div>
  )
}

export default AddCert

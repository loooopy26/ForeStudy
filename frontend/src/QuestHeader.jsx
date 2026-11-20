import { AcornIcon } from './icons'
import './questTheme.css'
import './QuestPage.css'

export default function QuestHeader({ title, titleId, level, acorns, onBack, className = '' }) {
  return (
    <header className={`quest-header ${className}`}>
      <button type="button" className="header-icon-btn" onClick={onBack} aria-label="마을로 돌아가기">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8272" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span className="header-title" id={titleId} role="heading" aria-level={1}>{title}</span>
      <div className="header-hud">
        <span className="hud-lvl">Lv.{level}</span>
        <div className="hud-acorn">
          <AcornIcon size={14} />
          <span>{acorns.toLocaleString()}</span>
        </div>
      </div>
    </header>
  )
}

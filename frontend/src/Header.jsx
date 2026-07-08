import { BackIcon } from './icons'

function Header({ title, subtitle, icon, onBack, bordered = false, action }) {
  return (
    <header className={`screen-header${bordered ? ' with-border' : ''}`}>
      {onBack ? (
        <button type="button" className="back-button" onClick={onBack} aria-label="뒤로가기">
          <BackIcon />
        </button>
      ) : (
        <div className="header-spacer" />
      )}
      <div className="header-title">
        {title}
        {subtitle && <small>{subtitle}</small>}
      </div>
      <div className="header-right">
        {action}
        <div className="header-badge">{icon}</div>
      </div>
    </header>
  )
}

export default Header

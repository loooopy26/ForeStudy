import { HomeIcon, VillageIcon } from './icons'

function MainNav({ active, onNavigate }) {
  return (
    <nav className="bottom-nav main-nav" aria-label="메인 메뉴">
      <button
        type="button"
        className={active === 'profile' ? 'active' : ''}
        onClick={() => onNavigate('profile')}
      >
        <HomeIcon size={28} />
        <span>홈</span>
      </button>
      <span className="main-nav-divider" aria-hidden="true" />
      <button
        type="button"
        className={active === 'village' ? 'active' : ''}
        onClick={() => onNavigate('village')}
      >
        <VillageIcon size={28} />
        <span>마을</span>
      </button>
    </nav>
  )
}

export default MainNav

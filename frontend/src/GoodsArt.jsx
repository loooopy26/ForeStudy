// 상점/내 방/캐릭터 화면에서 쓰는 아이템 일러스트(SVG)와 재화 아이콘.
// 실제 일러스트 에셋이 준비되면 art 키별로 이미지 교체만 하면 된다.
import { AcornIcon } from './icons'

// 재화 아이콘은 홈 화면과 같은 도토리로 통일한다.
export function CoinIcon({ size = 16 }) {
  return <AcornIcon size={size} />
}

function Hoodie({ color, trim, hood = true }) {
  return (
    <>
      <path d="M16 30 Q16 18 32 18 Q48 18 48 30 L46 50 Q32 55 18 50 Z" fill={color} stroke={trim} strokeWidth="2" />
      {hood && <path d="M22 20 Q32 8 42 20 Q37 16 32 16 Q27 16 22 20Z" fill={trim} />}
      <path d="M26 34 Q32 40 38 34" fill="none" stroke={trim} strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="45" r="1.8" fill={trim} />
    </>
  )
}

function Jacket({ color, trim }) {
  return (
    <>
      <path d="M16 28 Q16 17 32 17 Q48 17 48 28 L46 50 Q32 55 18 50 Z" fill={color} stroke={trim} strokeWidth="2" />
      <path d="M32 20 L32 50" stroke={trim} strokeWidth="2" />
      <path d="M26 17 L32 24 L38 17" fill="none" stroke={trim} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="28.5" cy="32" r="1.7" fill="#f0c04a" />
      <circle cx="28.5" cy="40" r="1.7" fill="#f0c04a" />
    </>
  )
}

function Sweater({ color, trim }) {
  return (
    <>
      <path d="M16 29 Q16 18 32 18 Q48 18 48 29 L46 50 Q32 55 18 50 Z" fill={color} stroke={trim} strokeWidth="2" />
      <path d="M18 34 H46 M18 41 H46" stroke={trim} strokeWidth="1.6" strokeDasharray="3 3" />
      <ellipse cx="32" cy="24" rx="7" ry="3.4" fill="none" stroke={trim} strokeWidth="2" />
    </>
  )
}

// art 키 → 64x64 뷰박스 일러스트
const ART = {
  hoodie: (item) => <Hoodie color={item.color} trim={item.trim} />,
  jacket: (item) => <Jacket color={item.color} trim={item.trim} />,
  sweater: (item) => <Sweater color={item.color} trim={item.trim} />,
  'leaf-hat': (item) => (
    <>
      <path d="M12 38 Q32 12 52 38 Q32 46 12 38Z" fill={item.color} stroke={item.trim} strokeWidth="2" />
      <path d="M32 16 Q34 24 32 34" stroke={item.trim} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  'straw-hat': (item) => (
    <>
      <ellipse cx="32" cy="38" rx="24" ry="8" fill={item.color} stroke={item.trim} strokeWidth="2" />
      <path d="M18 36 Q18 18 32 18 Q46 18 46 36 Q32 42 18 36Z" fill={item.color} stroke={item.trim} strokeWidth="2" />
      <path d="M18 33 Q32 39 46 33" stroke="#c96f5e" strokeWidth="3" fill="none" />
    </>
  ),
  beret: (item) => (
    <>
      <path d="M14 36 Q14 18 32 18 Q50 18 50 36 Q32 44 14 36Z" fill={item.color} stroke={item.trim} strokeWidth="2" />
      <circle cx="32" cy="15" r="3.4" fill={item.trim} />
    </>
  ),
  backpack: (item) => (
    <>
      <rect x="18" y="18" width="28" height="34" rx="10" fill={item.color} stroke={item.trim} strokeWidth="2" />
      <rect x="24" y="34" width="16" height="12" rx="4" fill={item.trim} />
      <path d="M24 18 Q32 10 40 18" fill="none" stroke={item.trim} strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="40" r="2" fill="#f0c04a" />
    </>
  ),
  satchel: (item) => (
    <>
      <rect x="14" y="26" width="36" height="24" rx="7" fill={item.color} stroke={item.trim} strokeWidth="2" />
      <path d="M14 34 H50" stroke={item.trim} strokeWidth="2" />
      <path d="M24 26 Q32 12 40 26" fill="none" stroke={item.trim} strokeWidth="3" strokeLinecap="round" />
      <rect x="28" y="32" width="8" height="8" rx="2" fill="#f0c04a" />
    </>
  ),
  scarf: (item) => (
    <>
      <path d="M16 28 Q32 20 48 28 Q48 36 32 34 Q16 36 16 28Z" fill={item.color} stroke={item.trim} strokeWidth="2" />
      <path d="M30 33 L26 50 L34 50 L36 34" fill={item.color} stroke={item.trim} strokeWidth="2" strokeLinejoin="round" />
      <path d="M27 44 H34" stroke={item.trim} strokeWidth="1.6" />
    </>
  ),
  glasses: (item) => (
    <>
      <circle cx="21" cy="34" r="9" fill="none" stroke={item.color} strokeWidth="3" />
      <circle cx="43" cy="34" r="9" fill="none" stroke={item.color} strokeWidth="3" />
      <path d="M30 34 Q32 31 34 34" fill="none" stroke={item.color} strokeWidth="3" />
    </>
  ),
  ribbon: (item) => (
    <>
      <path d="M32 32 L14 22 Q10 32 14 42 Z" fill={item.color} stroke={item.trim} strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 32 L50 22 Q54 32 50 42 Z" fill={item.color} stroke={item.trim} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="5" fill={item.trim} />
    </>
  ),
  desk: () => (
    <>
      <rect x="10" y="24" width="44" height="7" rx="3" fill="#b08a5f" stroke="#8a6647" strokeWidth="2" />
      <rect x="14" y="31" width="6" height="20" fill="#a37c50" />
      <rect x="44" y="31" width="6" height="20" fill="#a37c50" />
      <rect x="36" y="16" width="12" height="8" rx="2" fill="#8bb069" />
    </>
  ),
  'mushroom-chair': () => (
    <>
      <path d="M12 30 Q32 8 52 30 Q32 38 12 30Z" fill="#c96f5e" stroke="#a95243" strokeWidth="2" />
      <circle cx="24" cy="22" r="3" fill="#fdfbf4" />
      <circle cx="38" cy="18" r="2.4" fill="#fdfbf4" />
      <rect x="26" y="33" width="12" height="16" rx="5" fill="#f3e6cf" stroke="#c9a97e" strokeWidth="2" />
    </>
  ),
  shelf: () => (
    <>
      <rect x="12" y="18" width="40" height="6" rx="2" fill="#b08a5f" stroke="#8a6647" strokeWidth="2" />
      <rect x="12" y="38" width="40" height="6" rx="2" fill="#b08a5f" stroke="#8a6647" strokeWidth="2" />
      <rect x="18" y="8" width="7" height="10" rx="1.5" fill="#7d9c62" />
      <rect x="28" y="10" width="7" height="8" rx="1.5" fill="#c96f5e" />
      <rect x="20" y="28" width="9" height="10" rx="1.5" fill="#e9c46a" />
    </>
  ),
  bed: () => (
    <>
      <rect x="8" y="26" width="48" height="18" rx="6" fill="#9ec1d9" stroke="#7ba3bf" strokeWidth="2" />
      <rect x="8" y="20" width="14" height="12" rx="4" fill="#fdfbf4" stroke="#d8cfb8" strokeWidth="2" />
      <rect x="8" y="44" width="5" height="8" fill="#b08a5f" />
      <rect x="51" y="44" width="5" height="8" fill="#b08a5f" />
      <path d="M22 32 H56" stroke="#7ba3bf" strokeWidth="2" />
    </>
  ),
  bookshelf: () => (
    <>
      <rect x="14" y="8" width="36" height="46" rx="4" fill="#b08a5f" stroke="#8a6647" strokeWidth="2" />
      <path d="M14 24 H50 M14 39 H50" stroke="#8a6647" strokeWidth="2" />
      <rect x="18" y="12" width="6" height="10" fill="#7d9c62" />
      <rect x="26" y="14" width="6" height="8" fill="#c96f5e" />
      <rect x="34" y="12" width="6" height="10" fill="#e9c46a" />
      <rect x="20" y="28" width="6" height="9" fill="#9ec1d9" />
      <rect x="30" y="30" width="6" height="7" fill="#e8a4b0" />
      <rect x="22" y="43" width="6" height="9" fill="#c9a97e" />
    </>
  ),
  lamp: () => (
    <>
      <path d="M22 10 H42 L46 26 H18 Z" fill="#f0d59a" stroke="#d4a83f" strokeWidth="2" />
      <rect x="30" y="26" width="4" height="20" fill="#8a6647" />
      <ellipse cx="32" cy="49" rx="11" ry="4" fill="#b08a5f" stroke="#8a6647" strokeWidth="2" />
      <circle cx="32" cy="18" r="3" fill="#fff6d9" />
    </>
  ),
  plant: () => (
    <>
      <path d="M32 30 Q20 24 22 10 Q34 14 32 30Z" fill="#7d9c62" stroke="#5f7a43" strokeWidth="2" />
      <path d="M32 30 Q44 26 44 14 Q33 16 32 30Z" fill="#8bb069" stroke="#5f7a43" strokeWidth="2" />
      <path d="M22 32 H42 L39 50 H25 Z" fill="#c98d5e" stroke="#a86f43" strokeWidth="2" />
    </>
  ),
  books: () => (
    <>
      <rect x="16" y="38" width="32" height="8" rx="2" fill="#7d9c62" stroke="#5f7a43" strokeWidth="2" />
      <rect x="19" y="29" width="27" height="8" rx="2" fill="#c96f5e" stroke="#a95243" strokeWidth="2" />
      <rect x="22" y="20" width="21" height="8" rx="2" fill="#e9c46a" stroke="#d4a83f" strokeWidth="2" />
    </>
  ),
  basket: () => (
    <>
      <path d="M16 28 H48 L44 48 H20 Z" fill="#d8b98a" stroke="#b08a5f" strokeWidth="2" />
      <path d="M20 34 H44 M21 41 H43" stroke="#b08a5f" strokeWidth="1.6" />
      <ellipse cx="27" cy="26" rx="4.5" ry="5.5" fill="#a9825f" />
      <ellipse cx="37" cy="25" rx="4.5" ry="5.5" fill="#8a6647" />
      <path d="M25 21 Q27 18 29 21 M35 20 Q37 17 39 20" stroke="#5f4a33" strokeWidth="1.6" fill="none" />
    </>
  ),
  frame: () => (
    <>
      <rect x="16" y="12" width="32" height="40" rx="3" fill="#b08a5f" stroke="#8a6647" strokeWidth="2" />
      <rect x="21" y="17" width="22" height="30" fill="#fdfbf4" />
      <path d="M21 40 L29 30 L34 36 L39 28 L43 34 V47 H21 Z" fill="#8bb069" />
      <circle cx="37" cy="23" r="3" fill="#f0c04a" />
    </>
  ),
  window: () => (
    <>
      <rect x="14" y="10" width="36" height="44" rx="5" fill="#d8b98a" stroke="#b08a5f" strokeWidth="2" />
      <rect x="19" y="15" width="26" height="34" fill="#cfe6f2" />
      <path d="M32 15 V49 M19 32 H45" stroke="#b08a5f" strokeWidth="2.4" />
      <path d="M22 22 Q26 18 29 22" stroke="#fdfbf4" strokeWidth="2" fill="none" />
    </>
  ),
  rug: () => (
    <>
      <ellipse cx="32" cy="34" rx="25" ry="13" fill="#8bb069" stroke="#5f7a43" strokeWidth="2" />
      <ellipse cx="32" cy="34" rx="16" ry="8" fill="none" stroke="#fdfbf4" strokeWidth="2" strokeDasharray="4 4" />
    </>
  ),
  'wallpaper-forest': () => (
    <>
      <rect x="10" y="10" width="44" height="44" rx="5" fill="#e6eedd" stroke="#c4d3b2" strokeWidth="2" />
      <path d="M18 30 L23 20 L28 30 Z M34 26 L39 16 L44 26 Z M26 44 L31 34 L36 44 Z" fill="#8bb069" />
    </>
  ),
  'wallpaper-stripe': () => (
    <>
      <rect x="10" y="10" width="44" height="44" rx="5" fill="#fdf6e3" stroke="#e3d5b3" strokeWidth="2" />
      <path d="M18 10 V54 M28 10 V54 M38 10 V54 M48 10 V54" stroke="#f0dfb6" strokeWidth="5" />
    </>
  ),
  'floor-wood': () => (
    <>
      <rect x="10" y="14" width="44" height="36" rx="5" fill="#d8b98a" stroke="#b08a5f" strokeWidth="2" />
      <path d="M10 26 H54 M10 38 H54 M28 14 V26 M40 26 V38 M24 38 V50" stroke="#c0a071" strokeWidth="2" />
    </>
  ),
  'floor-grass': () => (
    <>
      <rect x="10" y="14" width="44" height="36" rx="5" fill="#a8c68f" stroke="#7d9c62" strokeWidth="2" />
      <path d="M18 42 Q20 36 22 42 M30 32 Q32 26 34 32 M42 44 Q44 38 46 44 M24 22 Q26 16 28 22" stroke="#5f7a43" strokeWidth="2" fill="none" />
    </>
  ),
}

export function ItemArt({ item, size = 56 }) {
  const draw = ART[item.art]
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {draw ? draw(item) : <circle cx="32" cy="32" r="20" fill="#e3d5b3" />}
    </svg>
  )
}

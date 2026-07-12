// 상점/내 방/캐릭터 화면에서 쓰는 아이템 이미지 렌더러.
// 기본 카탈로그와 AI 커스텀 아이템 모두 같은 visual 레시피로 그린다.
import { AcornIcon } from './icons'

export function CoinIcon({ size = 16 }) {
  return <AcornIcon size={size} />
}

const DEFAULT_VISUAL = {
  kind: 'outfit',
  variant: null,
  primary: '#86a96d',
  secondary: '#5b6f44',
  accent: '#f0b94a',
  motif: 'leaf',
  pattern: 'solid',
  finish: 'soft',
  silhouette: 'rounded',
  material: 'cloth',
  ornament: 'none',
  secondaryMotif: 'sparkle',
  iconPose: 'front',
  detailLevel: 'balanced',
}

const VISUAL_BY_ART = {
  hoodie: { kind: 'outfit', variant: 'hoodie', motif: 'leaf' },
  jacket: { kind: 'outfit', variant: 'jacket', motif: 'star' },
  sweater: { kind: 'outfit', variant: 'sweater', motif: 'stripe', pattern: 'stripe' },
  'leaf-hat': { kind: 'hat', variant: 'leaf-cap', motif: 'leaf' },
  'straw-hat': { kind: 'hat', variant: 'wide-brim', motif: 'ribbon' },
  beret: { kind: 'hat', variant: 'beret', motif: 'acorn' },
  backpack: { kind: 'bag', variant: 'backpack', motif: 'badge' },
  satchel: { kind: 'bag', variant: 'satchel', motif: 'buckle' },
  scarf: { kind: 'accessory', variant: 'scarf', motif: 'stripe', pattern: 'stripe' },
  glasses: { kind: 'accessory', variant: 'glasses', motif: 'sparkle' },
  ribbon: { kind: 'accessory', variant: 'ribbon', motif: 'heart' },
  desk: { kind: 'furniture', variant: 'desk', primary: '#b68a5b', secondary: '#745037', accent: '#78a76f' },
  'mushroom-chair': { kind: 'furniture', variant: 'chair', primary: '#c96f5e', secondary: '#a95243', accent: '#fff4da', motif: 'dot' },
  shelf: { kind: 'furniture', variant: 'shelf', primary: '#b68a5b', secondary: '#745037', accent: '#7d9c62' },
  bed: { kind: 'furniture', variant: 'bed', primary: '#8fb8d4', secondary: '#5d88a8', accent: '#fff6e6' },
  bookshelf: { kind: 'furniture', variant: 'bookcase', primary: '#aa7b4f', secondary: '#704b31', accent: '#e4bd55' },
  lamp: { kind: 'furniture', variant: 'lamp', primary: '#f0d184', secondary: '#a46e3c', accent: '#fff7c7' },
  plant: { kind: 'decor', variant: 'plant', primary: '#78a76f', secondary: '#4f7c48', accent: '#c98251' },
  books: { kind: 'decor', variant: 'books', primary: '#6f8fc9', secondary: '#c96f5e', accent: '#e4bd55' },
  basket: { kind: 'decor', variant: 'basket', primary: '#d0a36a', secondary: '#8f623e', accent: '#a9825f' },
  frame: { kind: 'decor', variant: 'frame', primary: '#b68a5b', secondary: '#745037', accent: '#78a76f' },
  window: { kind: 'decor', variant: 'window', primary: '#c79a67', secondary: '#76543a', accent: '#bfe2f2' },
  rug: { kind: 'decor', variant: 'rug', primary: '#83ad77', secondary: '#4f7c48', accent: '#fff6e6' },
  nightstand: { kind: 'furniture', variant: 'nightstand', primary: '#c49a68', secondary: '#8a6647', accent: '#f5df8d' },
  chest: { kind: 'furniture', variant: 'chest', primary: '#b68a5b', secondary: '#745037', accent: '#7d9c62' },
  'wall-lamp': { kind: 'decor', variant: 'sconce', primary: '#f0d184', secondary: '#a46e3c', accent: '#fff7c7' },
  dog: { kind: 'decor', variant: 'dog', primary: '#eecf9b', secondary: '#b98a52', accent: '#fdf3e0' },
  'wallpaper-forest': { kind: 'wallpaper', variant: 'forest', primary: '#dcebd1', secondary: '#89aa70', accent: '#f5df8d', motif: 'tree' },
  'wallpaper-stripe': { kind: 'wallpaper', variant: 'stripe', primary: '#fbf2d7', secondary: '#e7ce92', accent: '#d69b7e', pattern: 'stripe' },
  'floor-wood': { kind: 'floor', variant: 'wood', primary: '#d1a76c', secondary: '#93623f', accent: '#e7c68c', pattern: 'plank' },
  'floor-grass': { kind: 'floor', variant: 'grass', primary: '#9fbe82', secondary: '#668c55', accent: '#d8e7b6', pattern: 'blade' },
}

const KIND_VARIANTS = {
  outfit: ['hoodie', 'jacket', 'sweater', 'cape'],
  hat: ['leaf-cap', 'wide-brim', 'beret', 'beanie'],
  bag: ['backpack', 'satchel', 'pouch'],
  accessory: ['scarf', 'glasses', 'ribbon', 'charm'],
  furniture: ['desk', 'chair', 'shelf', 'bed', 'bookcase', 'lamp'],
  decor: ['plant', 'books', 'basket', 'frame', 'window', 'rug', 'crystal'],
  wallpaper: ['forest', 'stripe', 'cloud', 'night'],
  floor: ['wood', 'grass', 'tile', 'plank'],
}

const ASSET = '/assets/'

function getItemImage(item) {
  if (item.custom) return null
  const image = item.image
  if (!image) return null
  // AI로 생성된 아이템은 백엔드가 절대 URL(http://.../generated-items/...)을 내려준다.
  // 카탈로그 아이템은 /assets/ 밑의 로컬 파일명만 갖고 있어 접두사를 붙여야 한다.
  return /^https?:\/\//.test(image) ? image : `${ASSET}${image}`
}

function hashText(value = '') {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

export function getItemVisual(item = {}) {
  const artVisual = VISUAL_BY_ART[item.art] || {}
  const visual = { ...DEFAULT_VISUAL, ...artVisual, ...(item.visual || {}) }
  visual.id = item.id
  visual.kind = visual.kind || item.kind || DEFAULT_VISUAL.kind
  visual.variant = visual.variant || KIND_VARIANTS[visual.kind]?.[hashText(item.id) % KIND_VARIANTS[visual.kind].length]
  visual.primary = item.visual?.primary || item.color || visual.primary || DEFAULT_VISUAL.primary
  visual.secondary = item.visual?.secondary || item.trim || visual.secondary || DEFAULT_VISUAL.secondary
  visual.accent = visual.accent || DEFAULT_VISUAL.accent
  visual.motif = visual.motif || 'sparkle'
  visual.pattern = visual.pattern || 'solid'
  visual.finish = visual.finish || 'soft'
  visual.silhouette = visual.silhouette || DEFAULT_VISUAL.silhouette
  visual.material = visual.material || DEFAULT_VISUAL.material
  visual.ornament = visual.ornament || DEFAULT_VISUAL.ornament
  visual.secondaryMotif = visual.secondaryMotif || DEFAULT_VISUAL.secondaryMotif
  visual.iconPose = visual.iconPose || DEFAULT_VISUAL.iconPose
  visual.detailLevel = visual.detailLevel || DEFAULT_VISUAL.detailLevel
  return visual
}

function poseTransform(visual) {
  if (visual.iconPose === 'tilted') return 'translate(32 32) rotate(-6) translate(-32 -32)'
  if (visual.iconPose === 'three-quarter') return 'translate(2 -1) skewY(-3)'
  if (visual.iconPose === 'stacked') return 'translate(0 -1)'
  return undefined
}

function DetailPattern({ visual }) {
  if (visual.detailLevel === 'simple') return null
  const stroke = visual.secondary
  const accent = visual.accent
  return (
    <>
      {visual.pattern === 'check' && (
        <path d="M20 25 H44 M20 35 H44 M26 19 V47 M38 19 V47" stroke={stroke} strokeWidth="1.1" opacity="0.24" />
      )}
      {visual.pattern === 'sprinkle' && (
        <>
          <Motif type="sparkle" x={18} y={22} size={2.6} color={accent} />
          <Motif type="sparkle" x={47} y={34} size={2.3} color={accent} />
          <circle cx="41" cy="20" r="1.8" fill={accent} opacity="0.7" />
        </>
      )}
      {visual.material === 'knit' && (
        <path d="M20 29 Q24 26 28 29 T36 29 T44 29 M19 39 Q23 36 27 39 T35 39 T43 39" stroke={stroke} strokeWidth="1.4" fill="none" opacity="0.24" />
      )}
      {visual.material === 'wood' && (
        <path d="M18 26 Q28 21 39 25 M19 40 Q29 35 44 39" stroke={accent} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.55" />
      )}
      {visual.material === 'glass' && (
        <path d="M21 18 L16 31 M35 16 L25 41" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.38" />
      )}
    </>
  )
}

function OrnamentLayer({ visual }) {
  if (visual.detailLevel === 'simple' || visual.ornament === 'none') return null
  const color = visual.accent
  if (visual.ornament === 'flower') {
    return (
      <g transform="translate(44 22)">
        <circle cx="0" cy="-4" r="3" fill="#fff6d8" />
        <circle cx="4" cy="0" r="3" fill="#fff6d8" />
        <circle cx="0" cy="4" r="3" fill="#fff6d8" />
        <circle cx="-4" cy="0" r="3" fill="#fff6d8" />
        <circle cx="0" cy="0" r="2.5" fill={color} />
      </g>
    )
  }
  if (visual.ornament === 'button') {
    return (
      <>
        <circle cx="44" cy="25" r="4" fill={color} stroke={visual.secondary} strokeWidth="1.2" />
        <path d="M42.5 25 H45.5 M44 23.5 V26.5" stroke={visual.secondary} strokeWidth="0.9" strokeLinecap="round" />
      </>
    )
  }
  if (visual.ornament === 'patch') {
    return <rect x="40" y="22" width="10" height="8" rx="2" fill={color} stroke={visual.secondary} strokeWidth="1.2" />
  }
  if (visual.ornament === 'book') {
    return (
      <g transform="translate(41 20)">
        <rect x="0" y="0" width="11" height="9" rx="1.5" fill="#fff4d6" stroke={visual.secondary} strokeWidth="1.2" />
        <path d="M5.5 1 V8" stroke={visual.secondary} strokeWidth="0.8" />
      </g>
    )
  }
  const motif = visual.ornament === 'star' ? 'sparkle' : visual.ornament
  return <Motif type={motif} x={45} y={24} size={4.8} color={color} />
}

function Motif({ type, x = 32, y = 32, size = 8, color = '#f0c04a' }) {
  if (type === 'leaf') {
    return (
      <path
        d={`M${x - size} ${y + size * 0.15} Q${x - size * 0.1} ${y - size} ${x + size} ${y - size * 0.5} Q${x + size * 0.3} ${y + size * 0.8} ${x - size} ${y + size * 0.15}Z`}
        fill={color}
      />
    )
  }
  if (type === 'heart') {
    return <path d={`M${x} ${y + size} C${x - size * 1.8} ${y - size * 0.4} ${x - size} ${y - size * 1.5} ${x} ${y - size * 0.4} C${x + size} ${y - size * 1.5} ${x + size * 1.8} ${y - size * 0.4} ${x} ${y + size}Z`} fill={color} />
  }
  if (type === 'dot') {
    return (
      <>
        <circle cx={x - size * 0.8} cy={y - size * 0.4} r={size * 0.42} fill={color} />
        <circle cx={x + size * 0.55} cy={y + size * 0.1} r={size * 0.35} fill={color} />
      </>
    )
  }
  if (type === 'stripe') return <path d={`M${x - size * 1.4} ${y - size * 0.4} H${x + size * 1.4} M${x - size * 1.1} ${y + size * 0.45} H${x + size * 1.1}`} stroke={color} strokeWidth="2.2" strokeLinecap="round" />
  if (type === 'acorn') return <ellipse cx={x} cy={y} rx={size * 0.55} ry={size * 0.75} fill={color} />
  if (type === 'fern') {
    return (
      <path
        d={`M${x - size * 0.6} ${y + size * 0.2} Q${x - size * 0.2} ${y - size * 0.9} ${x} ${y - size * 0.1} Q${x + size * 0.25} ${y - size * 0.95} ${x + size * 0.7} ${y + size * 0.1} Q${x + size * 0.45} ${y + size * 0.3} ${x} ${y + size * 0.2} Q${x - size * 0.2} ${y + size * 0.35} ${x - size * 0.6} ${y + size * 0.2}Z`}
        fill={color}
      />
    )
  }
  if (type === 'cloud') {
    return <path d={`M${x - size * 1.2} ${y} C${x - size * 0.7} ${y - size * 0.9} ${x - size * 0.1} ${y - size * 0.9} ${x + size * 0.2} ${y} C${x + size * 0.8} ${y - size * 0.8} ${x + size * 1.3} ${y - size * 0.5} ${x + size * 1.1} ${y + size * 0.2} C${x + size * 1.5} ${y + size * 0.8} ${x + size * 0.4} ${y + size * 1} ${x - size * 0.2} ${y + size * 0.7} C${x - size * 1} ${y + size * 0.85} ${x - size * 1.3} ${y + size * 0.35} ${x - size * 1.2} ${y}`} fill={color} />
  }
  return (
    <path
      d={`M${x} ${y - size} L${x + size * 0.3} ${y - size * 0.25} L${x + size} ${y} L${x + size * 0.3} ${y + size * 0.25} L${x} ${y + size} L${x - size * 0.3} ${y + size * 0.25} L${x - size} ${y} L${x - size * 0.3} ${y - size * 0.25}Z`}
      fill={color}
    />
  )
}

function Outfit({ visual }) {
  const cape = visual.variant === 'cape' || visual.silhouette === 'flowy'
  const isBearHood = visual.id === 'bear-hood'
  const isAnimalSweater = visual.id === 'animal-sweater'
  const isYellowRaincoat = visual.id === 'yellow-raincoat'
  const isGreenJacket = visual.id === 'green-jacket'

  return (
    <>
      {/* 1. Behind-body layers */}
      {/* Cape back layer */}
      {cape && <path d="M18 24 Q32 12 46 24 L52 54 Q32 62 12 54Z" fill={visual.secondary} opacity="0.82" />}
      
      {/* Hoodie back hood layer (with ears for bear-hood) */}
      {(visual.variant === 'hoodie' || isBearHood) && (
        <g>
          {/* Hood background */}
          <path d="M22 20 Q32 8 42 20 Q36 17 32 17 Q28 17 22 20Z" fill={visual.secondary} />
          {/* Bear ears if bear hood */}
          {isBearHood && (
            <g>
              <circle cx="23" cy="11" r="5.5" fill={visual.secondary} />
              <circle cx="23" cy="11" r="2.8" fill="#f3c4c9" />
              <circle cx="41" cy="11" r="5.5" fill={visual.secondary} />
              <circle cx="41" cy="11" r="2.8" fill="#f3c4c9" />
            </g>
          )}
        </g>
      )}

      {/* Raincoat hood outline */}
      {isYellowRaincoat && (
        <path d="M19 21 Q32 4 45 21 Q32 17 19 21Z" fill={visual.secondary} />
      )}

      {/* 2. Main Body */}
      <path d="M15 31 Q17 18 32 17 Q47 18 49 31 L46 52 Q32 58 18 52Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.5" strokeLinejoin="round" />

      {/* 3. Collar / Neck area */}
      {isAnimalSweater ? (
        // Ribbed crew collar
        <path d="M24 19 Q32 23 40 19" stroke={visual.secondary} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      ) : isGreenJacket ? (
        // Open jacket neckline revealing shirt inside
        <g>
          <path d="M26 19 L32 27 L38 19 Z" fill="#fff8e8" />
          <path d="M26 19 L32 27 L38 19" stroke={visual.secondary} strokeWidth="2" fill="none" />
        </g>
      ) : (
        // Standard collar overlay
        <path d="M23 19 Q32 11 41 19 L40 29 H24 Z" fill={visual.secondary} opacity="0.8" />
      )}

      {/* 4. Inside chest pattern / overlays */}
      {isBearHood ? (
        // Bear chest face design
        <g>
          <ellipse cx="32" cy="38" rx="8.5" ry="6.5" fill="#fff6e6" stroke={visual.secondary} strokeWidth="1" />
          <circle cx="32" cy="37" r="1.5" fill="#5c4e3c" />
          <path d="M30 39 Q32 41 34 39" stroke="#5c4e3c" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <circle cx="28.5" cy="35" r="1" fill="#5c4e3c" />
          <circle cx="35.5" cy="35" r="1" fill="#5c4e3c" />
        </g>
      ) : isAnimalSweater ? (
        // Animal Paw Print on chest
        <g transform="translate(0 3)">
          <circle cx="32" cy="35" r="4.2" fill={visual.accent} />
          <circle cx="26" cy="29.5" r="1.8" fill={visual.accent} />
          <circle cx="32" cy="27.5" r="1.8" fill={visual.accent} />
          <circle cx="38" cy="29.5" r="1.8" fill={visual.accent} />
        </g>
      ) : isYellowRaincoat ? (
        // Raincoat buttons/toggles and center flap
        <g>
          {/* Vertical center flap */}
          <path d="M32 20 V52" stroke={visual.secondary} strokeWidth="2.2" />
          {/* Toggles */}
          <rect x="29" y="27" width="6" height="2.5" rx="1.2" fill="#8f623e" stroke={visual.secondary} strokeWidth="0.8" />
          <path d="M26 28 H38" stroke={visual.secondary} strokeWidth="1.2" />
          
          <rect x="29" y="37" width="6" height="2.5" rx="1.2" fill="#8f623e" stroke={visual.secondary} strokeWidth="0.8" />
          <path d="M26 38 H38" stroke={visual.secondary} strokeWidth="1.2" />

          <rect x="29" y="47" width="6" height="2.5" rx="1.2" fill="#8f623e" stroke={visual.secondary} strokeWidth="0.8" />
          <path d="M26 48 H38" stroke={visual.secondary} strokeWidth="1.2" />
        </g>
      ) : isGreenJacket ? (
        // Open jacket style with zipper line and pockets
        <g>
          <path d="M32 27 V52" stroke={visual.secondary} strokeWidth="2.2" />
          <rect x="18" y="39" width="8" height="7" rx="2" fill={visual.secondary} opacity="0.65" stroke={visual.secondary} strokeWidth="1" />
          <rect x="38" y="39" width="8" height="7" rx="2" fill={visual.secondary} opacity="0.65" stroke={visual.secondary} strokeWidth="1" />
        </g>
      ) : visual.variant === 'hoodie' ? (
        // Standard hoodie details: kangaroo pocket & drawstrings
        <g>
          {/* Drawstrings */}
          <path d="M28 20 V27 M36 20 V27" stroke="#fff8e8" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="28" cy="28.5" r="1.5" fill={visual.accent} />
          <circle cx="36" cy="28.5" r="1.5" fill={visual.accent} />
          
          {/* Kangaroo Pocket */}
          <path d="M23 48 L26 39 H38 L41 48 Z" fill={visual.secondary} opacity="0.4" stroke={visual.secondary} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M26 41 L23 45 M38 41 L41 45" stroke={visual.secondary} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ) : (
        // Fallback default details (pocket, button, motif)
        <g>
          <rect x="23" y="32" width="18" height="13" rx="4" fill={visual.accent} opacity="0.8" />
          <path d="M24 34 H40" stroke={visual.secondary} strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="32" cy="24" r="3.2" fill={visual.accent} opacity="0.88" />
          <Motif type={visual.motif} x={32} y={38} size={7} color={visual.accent} />
        </g>
      )}

      {/* 5. Extra Patterns (e.g. sweater knit details/stripes) */}
      {isAnimalSweater && (
        <g opacity="0.45" stroke={visual.secondary} strokeWidth="1.8" strokeLinecap="round">
          {/* Knitted horizontal stitch effect */}
          <path d="M17 32 H47 M17 46 H47" strokeDasharray="3 3" />
        </g>
      )}

      {visual.pattern === 'stripe' && !isAnimalSweater && (
        <path d="M18 35 H46 M19 42 H45" stroke={visual.secondary} strokeWidth="1.8" strokeDasharray="4 3" />
      )}
    </>
  )
}

function Hat({ visual }) {
  const isLeafHat = visual.id === 'leaf-hat'
  const isStrawHat = visual.id === 'straw-hat'
  const isAcornBeret = visual.id === 'acorn-beret'

  if (isLeafHat) {
    return (
      <g>
        {/* Leaf cap body */}
        <path d="M13 39 Q31 13 51 38 Q32 46 13 39Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Leaf stem on top */}
        <path d="M32 17 Q28 10 23 11" stroke={visual.secondary} strokeWidth="2.8" fill="none" strokeLinecap="round" />
        {/* Leaf veins */}
        <path d="M32 17 Q35 27 32 38" stroke={visual.secondary} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M28 25 Q32 28 35 30" stroke={visual.secondary} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.8" />
        <path d="M25 32 Q32 34 37 35" stroke={visual.secondary} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.8" />
        {/* Small ladybug / detail */}
        <circle cx="42" cy="28" r="2.5" fill="#e57373" stroke={visual.secondary} strokeWidth="0.8" />
        <circle cx="42.5" cy="27.5" r="0.6" fill="#000" />
      </g>
    )
  }

  if (isStrawHat || visual.variant === 'wide-brim' || visual.silhouette === 'wide') {
    return (
      <g>
        {/* Straw hat brim */}
        <ellipse cx="32" cy="41" rx="25" ry="8" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Straw hat crown */}
        <path d="M18 38 Q19 18 32 17 Q45 18 46 38 Q32 44 18 38Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        
        {/* Woven straw texture lines */}
        <g stroke={visual.secondary} strokeWidth="0.8" opacity="0.45" strokeDasharray="3 4">
          <path d="M20 28 Q32 32 44 28" fill="none" />
          <path d="M22 23 Q32 27 42 23" fill="none" />
          <path d="M24 18 Q32 22 40 18" fill="none" />
        </g>

        {/* Colorful band around crown */}
        <path d="M17.8 35.5 Q32 41 46.2 35.5" stroke={visual.accent} strokeWidth="3.2" fill="none" />
        <path d="M17.8 35.5 Q32 41 46.2 35.5" stroke={visual.secondary} strokeWidth="0.8" fill="none" opacity="0.4" />

        {/* Small Ribbon Bow at the back/side */}
        <g transform="translate(43, 33)">
          <path d="M0 2 C2 -1 6 -1 4 2 C6 5 2 5 0 2Z" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.2" />
          <path d="M1 2 L5 8 M3 2 L7 6" stroke={visual.secondary} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      </g>
    )
  }

  if (isAcornBeret || visual.variant === 'beret') {
    return (
      <g>
        {/* Acorn cap body */}
        <path d="M13 38 Q15 18 34 18 Q52 19 51 36 Q33 47 13 38Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        
        {/* Acorn stem on top */}
        <path d="M34 18 Q36 9 39 10" stroke={visual.secondary} strokeWidth="3" fill="none" strokeLinecap="round" />
        
        {/* Acorn shell scale-like texture patterns */}
        <g stroke={visual.secondary} strokeWidth="1.5" fill="none" opacity="0.65" strokeLinecap="round">
          <path d="M22 23 Q24 25 26 23 M28 23 Q30 25 32 23 M34 23 Q36 25 38 23" />
          <path d="M18 28 Q20 30 22 28 M24 28 Q26 30 28 28 M30 28 Q32 30 34 28 M36 28 Q38 30 40 28 M42 28 Q44 30 46 28" />
          <path d="M15 33 Q17 35 19 33 M21 33 Q23 35 25 33 M27 33 Q29 35 31 33 M33 33 Q35 35 37 33 M39 33 Q41 35 43 33 M45 33 Q47 35 49 33" />
        </g>

        {/* Acorn decoration motif on front */}
        <g transform="translate(12, 12)">
          <Motif type={visual.motif} x={20} y={23} size={4.5} color={visual.accent} />
        </g>
      </g>
    )
  }

  // Fallback generic hat
  return (
    <>
      <path d="M13 39 Q31 13 51 38 Q32 48 13 39Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
      <path d="M32 17 Q35 27 32 38" stroke={visual.secondary} strokeWidth="2" fill="none" strokeLinecap="round" />
      <Motif type={visual.motif} x={40} y={33} size={5} color={visual.accent} />
      <circle cx="42" cy="21" r="3.2" fill={visual.accent} opacity="0.85" />
    </>
  )
}

function Bag({ visual }) {
  const isBackpack = visual.id === 'green-backpack' || visual.variant === 'backpack'
  const isSatchel = visual.id === 'brown-satchel' || visual.variant === 'satchel'

  if (isBackpack) {
    return (
      <g>
        {/* Backpack handle strap */}
        <path d="M24 18 Q32 10 40 18" fill="none" stroke={visual.secondary} strokeWidth="3" strokeLinecap="round" />
        
        {/* Rolled hiking mat / sleeping bag strapped on top */}
        <rect x="20" y="10" width="24" height="8" rx="4" fill={visual.accent} stroke={visual.secondary} strokeWidth="2" />
        <path d="M25 10 V18 M39 10 V18" stroke={visual.secondary} strokeWidth="1.5" />
        <ellipse cx="20" cy="14" rx="1.5" ry="4" fill={visual.secondary} opacity="0.3" />

        {/* Main backpack body */}
        <rect x="18" y="17" width="28" height="36" rx="11" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        
        {/* Big front pocket */}
        <rect x="22" y="34" width="20" height="13" rx="4" fill={visual.secondary} opacity="0.35" stroke={visual.secondary} strokeWidth="1.5" />
        <path d="M22 39 H42" stroke={visual.secondary} strokeWidth="1.5" />
        <circle cx="32" cy="43" r="2.2" fill={visual.accent} />

        {/* Side mesh pockets */}
        <path d="M15 30 Q13 30 13 36 L18 43" stroke={visual.secondary} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M49 30 Q51 30 51 36 L46 43" stroke={visual.secondary} strokeWidth="1.6" fill="none" strokeLinecap="round" />

        {/* Backpack straps on the front */}
        <path d="M24 22 H40" stroke={visual.secondary} strokeWidth="1.8" strokeLinecap="round" />
        <Motif type={visual.motif} x={32} y={28} size={4.8} color={visual.accent} />
      </g>
    )
  }

  if (isSatchel || visual.variant === 'satchel' || visual.variant === 'pouch' || visual.silhouette === 'wide') {
    return (
      <g>
        {/* Messenger bag cross body shoulder strap */}
        <path d="M14 18 Q32 10 50 28" fill="none" stroke={visual.secondary} strokeWidth="2" strokeDasharray="3 3" opacity="0.6" />
        {/* Satchel top handle */}
        <path d="M23 27 Q32 11 41 27" fill="none" stroke={visual.secondary} strokeWidth="3" strokeLinecap="round" />
        
        {/* Main satchel body */}
        <rect x="13" y="27" width="38" height="25" rx="8" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        
        {/* Front cover flap */}
        <path d="M13 27 H51 V36 Q32 44 13 36 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2" strokeLinejoin="round" />
        
        {/* Leather buckle straps */}
        <rect x="21" y="27" width="4" height="20" rx="1" fill={visual.secondary} opacity="0.8" />
        <rect x="39" y="27" width="4" height="20" rx="1" fill={visual.secondary} opacity="0.8" />
        <circle cx="23" cy="41" r="1.5" fill={visual.accent} />
        <circle cx="41" cy="41" r="1.5" fill={visual.accent} />

        {/* Gold metal buckle clasp */}
        <rect x="28" y="34" width="8" height="8" rx="2" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.2" />
        <path d="M32 34 V42" stroke={visual.secondary} strokeWidth="1.5" />
      </g>
    )
  }

  // Fallback generic bag
  return (
    <>
      <path d="M24 18 Q32 10 40 18" fill="none" stroke={visual.secondary} strokeWidth="3" strokeLinecap="round" />
      <rect x="18" y="17" width="28" height="36" rx="11" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
      <rect x="23" y="35" width="18" height="12" rx="5" fill={visual.secondary} opacity="0.72" />
      <Motif type={visual.motif} x={32} y={28} size={5} color={visual.accent} />
      <path d="M24 24 H40" stroke={visual.secondary} strokeWidth="1.8" strokeLinecap="round" />
    </>
  )
}

function Accessory({ visual }) {
  const isGlasses = visual.variant === 'glasses'
  const isRibbon = visual.variant === 'ribbon'
  const isScarf = visual.id === 'red-scarf' || visual.variant === 'scarf'

  if (isGlasses) {
    return (
      <g>
        {/* Left lens frame */}
        <circle cx="21" cy="34" r="9" fill="none" stroke={visual.primary} strokeWidth="3.2" />
        <circle cx="21" cy="34" r="9" fill="none" stroke={visual.secondary} strokeWidth="1" />
        {/* Right lens frame */}
        <circle cx="43" cy="34" r="9" fill="none" stroke={visual.primary} strokeWidth="3.2" />
        <circle cx="43" cy="34" r="9" fill="none" stroke={visual.secondary} strokeWidth="1" />
        {/* Glasses bridge */}
        <path d="M30 34 Q32 31 34 34" fill="none" stroke={visual.secondary} strokeWidth="3.2" strokeLinecap="round" />
        
        {/* Lenses glass shine highlights */}
        <path d="M16 31 L20 27 M38 31 L42 27" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.6" />

        <circle cx="21" cy="34" r="4" fill={visual.accent} opacity="0.85" />
        <circle cx="43" cy="34" r="4" fill={visual.accent} opacity="0.85" />
        <Motif type="sparkle" x={48} y={23} size={4} color={visual.accent} />
      </g>
    )
  }

  if (isRibbon) {
    return (
      <g>
        {/* Ribbon tails hanging down */}
        <path d="M26 34 L18 52 L29 46 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2" strokeLinejoin="round" />
        <path d="M38 34 L46 52 L35 46 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2" strokeLinejoin="round" />
        
        {/* Left bow loop */}
        <path d="M32 32 L13 22 Q9 32 13 42 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" strokeLinejoin="round" />
        {/* Right bow loop */}
        <path d="M32 32 L51 22 Q55 32 51 42 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" strokeLinejoin="round" />
        
        {/* Center knot */}
        <circle cx="32" cy="32" r="5.5" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.5" />
        <path d="M24 39 Q32 44 40 39" stroke={visual.secondary} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </g>
    )
  }

  if (isScarf) {
    return (
      <g>
        {/* Main scarf wrapped around neck */}
        <path d="M15 29 Q32 20 49 29 Q48 38 32 35 Q16 38 15 29Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        
        {/* Scarf hanging tail */}
        <path d="M30 35 L26 52 H35 L37 36" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" strokeLinejoin="round" />
        
        {/* Fringes at the bottom of the tail */}
        <g stroke={visual.secondary} strokeWidth="1.8" strokeLinecap="round">
          <line x1="27" y1="52" x2="27" y2="57" />
          <line x1="30.5" y1="52" x2="30.5" y2="58" />
          <line x1="34" y1="52" x2="34" y2="57" />
        </g>

        {/* Ribbed pattern on the hanging tail */}
        <path d="M28 40 H34 M27 46 H35" stroke={visual.secondary} strokeWidth="1.5" opacity="0.6" />

        <Motif type={visual.motif} x={32} y={43} size={4.5} color={visual.accent} />
        <path d="M22 31 H42" stroke={visual.secondary} strokeWidth="1.7" strokeLinecap="round" />
      </g>
    )
  }

  // Fallback generic accessory
  return (
    <>
      <path d="M15 29 Q32 20 49 29 Q48 38 32 35 Q16 38 15 29Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
      <path d="M30 35 L26 52 H35 L37 36" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" strokeLinejoin="round" />
      <Motif type={visual.motif} x={32} y={44} size={5} color={visual.accent} />
      <path d="M22 31 H42" stroke={visual.secondary} strokeWidth="1.7" strokeLinecap="round" />
    </>
  )
}

function Furniture({ visual, rotate = 0 }) {
  const isChair = visual.variant === 'chair'
  const isBed = visual.variant === 'bed'
  const isBookcase = visual.variant === 'bookcase' || visual.variant === 'shelf' || visual.silhouette === 'boxy'
  const isLamp = visual.variant === 'lamp'
  const isNightstand = visual.variant === 'nightstand'
  const isChest = visual.variant === 'chest'
  const isDesk = visual.variant === 'desk' || visual.id === 'wood-desk'

  if (isChair) {
    return (
      <g>
        {/* Back rest - mushroom cap style */}
        <path d="M13 30 Q32 9 51 30 Q32 40 13 30Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        <Motif type={visual.motif} x={30} y={24} size={5} color={visual.accent} />
        
        {/* Connection bars between cap and stem */}
        <path d="M26 30 V35 M38 30 V35" stroke={visual.secondary} strokeWidth="2.2" />

        {/* Seat cushion / stem base (sitting on the ground) */}
        <rect x="25" y="34" width="14" height="20" rx="7" fill={visual.accent} stroke={visual.secondary} strokeWidth="2.2" />
      </g>
    )
  }

  if (isBed) {
    const isPinkBed = visual.id === 'pink-bed'
    
    if (rotate === 90 || rotate === 270) {
      return (
        <g>
          {/* Bed posts */}
          <rect x="12" y="12" width="4" height="24" rx="1.5" fill={visual.secondary} />
          <rect x="48" y="12" width="4" height="24" rx="1.5" fill={visual.secondary} />
          
          {/* Headboard */}
          <rect x="16" y="15" width="32" height="14" rx="3" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.2" />
          {/* Pink bed heart cutout */}
          {isPinkBed && (
            <path d="M32 20 C31 18 33 18 32 20 C31 18 33 18 32 20" fill="#fff" opacity="0.8" />
          )}

          {/* Mattress */}
          <rect x="14" y="26" width="36" height="23" rx="4" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.2" />
          
          {/* Front legs */}
          <rect x="15" y="47" width="4" height="7" rx="1" fill={visual.secondary} />
          <rect x="45" y="47" width="4" height="7" rx="1" fill={visual.secondary} />

          {/* Sheets */}
          <rect x="14.8" y="27" width="34.4" height="7" fill={visual.accent} />

          {/* Double Pillows */}
          <rect x="17" y="21" width="13" height="8" rx="2" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.8" />
          <circle cx="23.5" cy="25" r="1.5" fill={visual.secondary} opacity="0.15" />
          <rect x="34" y="21" width="13" height="8" rx="2" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.8" />
          <circle cx="40.5" cy="25" r="1.5" fill={visual.secondary} opacity="0.15" />

          {/* Comforter crease */}
          <path d="M14 33 H50" stroke={visual.secondary} strokeWidth="2" />
          
          {/* Motif on comforter */}
          {isPinkBed ? (
            <path d="M32 41 C31 39 33 39 32 41" fill={visual.accent} />
          ) : (
            <Motif type={visual.motif} x={32} y={40} size={4.5} color={visual.accent} />
          )}
        </g>
      )
    }

    return (
      <g>
        {/* Headboard */}
        <rect x="8" y="20" width="6" height="26" rx="2" fill={visual.secondary} stroke={visual.secondary} strokeWidth="1" />
        {/* Bed headboard decorative top */}
        {isPinkBed ? (
          <path d="M11 26 C10 24 12 24 11 26" fill={visual.accent} />
        ) : (
          <circle cx="11" cy="22" r="2" fill={visual.accent} />
        )}
        
        {/* Mattress & Blanket */}
        <rect x="14" y="27" width="42" height="19" rx="6" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        
        {/* Pillow */}
        <rect x="16" y="20" width="13" height="11" rx="3.5" fill={visual.accent} stroke={visual.secondary} strokeWidth="2" />
        
        {/* Blanket fold crease */}
        <path d="M24 34 H56" stroke={visual.secondary} strokeWidth="2" />
        
        {/* Legs */}
        <path d="M12 46 V54 M53 46 V54" stroke={visual.secondary} strokeWidth="3.2" strokeLinecap="round" />
      </g>
    )
  }

  if (isBookcase) {
    const isShelfOnly = visual.id === 'wood-shelf' || visual.variant === 'shelf'
    if (isShelfOnly) {
      return (
        <g>
          {/* Top shelf board */}
          <rect x="10" y="20" width="44" height="5" rx="1.5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2" />
          {/* Bottom shelf board */}
          <rect x="10" y="38" width="44" height="5" rx="1.5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2" />
          {/* Back bracket frames */}
          <path d="M15 20 V48 M49 20 V48" stroke={visual.secondary} strokeWidth="2.4" strokeLinecap="round" />
          
          {/* Small details / books on shelf */}
          <rect x="18" y="28" width="6" height="10" rx="1" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.2" />
          <rect x="25" y="30" width="6" height="8" rx="1" fill="#c96f5e" stroke={visual.secondary} strokeWidth="1.2" />
          {/* Tiny plant pot */}
          <rect x="38" y="12" width="7" height="8" rx="1.5" fill="#d0a36a" stroke={visual.secondary} strokeWidth="1.2" />
          <path d="M38 12 Q41.5 6 45 12" fill="#86a96d" />
        </g>
      )
    }

    // Tall Bookcase
    return (
      <g>
        <rect x="13" y="10" width="38" height="45" rx="5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        <path d="M14 25 H50 M14 40 H50" stroke={visual.secondary} strokeWidth="2" />
        
        {/* Books inside */}
        <rect x="18" y="14" width="6" height="9" rx="1.4" fill={visual.accent} />
        <rect x="27" y="15" width="6" height="8" rx="1.4" fill="#c96f5e" />
        <rect x="36" y="13" width="6" height="10" rx="1.4" fill="#6f8fc9" />
        <rect x="21" y="29" width="6" height="9" rx="1.4" fill="#f0c04a" />
        
        {/* Plant on top shelf */}
        <Motif type="fern" x={44} y={20} size={4.5} color={visual.secondary} />
      </g>
    )
  }

  if (isLamp) {
    return (
      <g>
        {/* Glowing light effect rings */}
        <circle cx="32" cy="19" r="16" fill={visual.accent} opacity="0.15" />
        {/* Lamp Shade */}
        <path d="M22 10 H42 L47 27 H17 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Glow bulb */}
        <circle cx="32" cy="19" r="4" fill={visual.accent} opacity="0.85" />
        {/* Stand stem */}
        <path d="M32 27 V49" stroke={visual.secondary} strokeWidth="4" strokeLinecap="round" />
        {/* Base stand */}
        <ellipse cx="32" cy="52" rx="13" ry="4" fill={visual.primary} stroke={visual.secondary} strokeWidth="2" />
        {/* Shade accent stripe */}
        <path d="M24 16 Q32 12 40 16" stroke={visual.secondary} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </g>
    )
  }

  if (isNightstand) {
    return (
      <g>
        {/* Cabinet body */}
        <rect x="14" y="18" width="36" height="32" rx="5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Top drawer */}
        <rect x="19" y="24" width="26" height="9" rx="2.5" fill={visual.accent} opacity="0.6" stroke={visual.secondary} strokeWidth="1.5" />
        <circle cx="32" cy="28.5" r="1.9" fill={visual.secondary} />
        {/* Bottom design accent */}
        <path d="M19 40 H45" stroke={visual.secondary} strokeWidth="1.6" opacity="0.55" />
        {/* Cab legs */}
        <path d="M18 50 V55 M46 50 V55" stroke={visual.secondary} strokeWidth="3.4" strokeLinecap="round" />
      </g>
    )
  }

  if (isChest) {
    return (
      <g>
        {/* Chest box body */}
        <rect x="12" y="26" width="40" height="25" rx="6" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        
        {/* Planks vertical lines */}
        <path d="M22 26 V50 M42 26 V50" stroke={visual.secondary} strokeWidth="1.2" opacity="0.5" />
        
        {/* Lid cover */}
        <path d="M12 34 H52" stroke={visual.secondary} strokeWidth="2" />
        <path d="M16 22 Q32 15 48 22 L52 27 H12 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" strokeLinejoin="round" />

        {/* Lock clasp */}
        <rect x="28" y="31" width="8" height="8" rx="2" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.5" />
        <circle cx="32" cy="35" r="1" fill={visual.secondary} />
      </g>
    )
  }

  if (isDesk) {
    return (
      <g>
        {/* Desk top surface */}
        <rect x="8" y="24" width="48" height="8" rx="2.5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Desk legs */}
        <path d="M15 32 V53 M49 32 V53" stroke={visual.secondary} strokeWidth="4.2" strokeLinecap="round" />
        {/* Desk side panel / drawer look */}
        <rect x="36" y="14" width="13" height="9" rx="2.5" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.2" />
        {/* Notepad / cup on desk */}
        <Motif type="cloud" x={24} y={16} size={4.8} color={visual.secondary} />
      </g>
    )
  }

  // Fallback generic furniture
  return (
    <g>
      <rect x="9" y="25" width="46" height="8" rx="4" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
      <path d="M16 33 V53 M48 33 V53" stroke={visual.secondary} strokeWidth="4" strokeLinecap="round" />
      <rect x="36" y="14" width="13" height="9" rx="2.5" fill={visual.accent} />
    </g>
  )
}

function Decor({ visual }) {
  const isBooks = visual.variant === 'books' || visual.id === 'book-pile'
  const isFrame = visual.variant === 'frame'
  const isWindow = visual.variant === 'window'
  const isBasket = visual.variant === 'basket' || visual.id === 'acorn-basket'
  const isRug = visual.variant === 'rug'
  const isSconce = visual.variant === 'sconce' || visual.id === 'wall-lamp'
  const isDog = visual.variant === 'dog' || visual.id === 'dog-friend'
  const isPlant = visual.variant === 'plant' || visual.id === 'plant-pot'

  if (isBooks) {
    return (
      <g>
        {/* Stack of three books */}
        <rect x="15" y="39" width="34" height="8" rx="2.5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.2" />
        <rect x="19" y="30" width="28" height="8" rx="2.5" fill={visual.secondary} stroke={visual.secondary} strokeWidth="2.2" />
        <rect x="23" y="21" width="22" height="8" rx="2.5" fill={visual.accent} stroke={visual.secondary} strokeWidth="2.2" />
        {/* Pages stripe line */}
        <path d="M20 22 H44 M16 41 H48 M20 32 H46" stroke="#fff" strokeWidth="1.2" opacity="0.8" />
      </g>
    )
  }

  if (isFrame || isWindow) {
    if (isWindow) {
      return (
        <g>
          {/* Outer window frame */}
          <rect x="15" y="11" width="34" height="42" rx="5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
          {/* Blue window pane view */}
          <rect x="20" y="16" width="24" height="32" rx="2" fill="#bfe2f2" stroke={visual.secondary} strokeWidth="1.2" />
          {/* Window pane crosses */}
          <path d="M32 16 V48 M20 32 H44" stroke={visual.secondary} strokeWidth="1.8" />
          {/* Curtains */}
          <path d="M20 16 Q26 26 20 48 M44 16 Q38 26 44 48" stroke={visual.accent} strokeWidth="2.8" fill="none" opacity="0.85" />
        </g>
      )
    }

    // Picture Frame
    return (
      <g>
        {/* Frame borders */}
        <rect x="15" y="11" width="34" height="42" rx="5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Inner canvas */}
        <rect x="20" y="16" width="24" height="32" rx="2" fill={visual.accent} opacity="0.78" stroke={visual.secondary} strokeWidth="1" />
        {/* Landscape sketch (hills and sun) */}
        <path d="M20 40 L28 31 L34 37 L40 28 L44 35 V48 H20 Z" fill={visual.secondary} opacity="0.45" />
        <circle cx="38" cy="22" r="3.2" fill="#ff8a80" />
      </g>
    )
  }

  if (isBasket) {
    return (
      <g>
        {/* Wicker basket body */}
        <path d="M17 28 H47 L43 50 H21 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Woven cross weave lines */}
        <path d="M21 35 H43 M22 42 H42" stroke={visual.secondary} strokeWidth="1.7" />
        
        {/* Acorns inside the basket */}
        <g>
          {/* Acorn 1 */}
          <ellipse cx="26" cy="24" rx="4.5" ry="5.5" fill={visual.accent} stroke={visual.secondary} strokeWidth="1" />
          <path d="M22.5 22 Q26 18 29.5 22Z" fill={visual.secondary} />
          {/* Acorn 2 */}
          <ellipse cx="38" cy="23" rx="4.5" ry="5.5" fill={visual.secondary} stroke={visual.secondary} strokeWidth="1" />
          <path d="M34.5 21 Q38 17 41.5 21Z" fill={visual.accent} />
          {/* Acorn 3 */}
          <ellipse cx="32" cy="27" rx="5" ry="6" fill={visual.accent} stroke={visual.secondary} strokeWidth="1.2" />
          <path d="M28 25 Q32 20 36 25Z" fill={visual.secondary} />
        </g>
      </g>
    )
  }

  if (isRug) {
    const isBlueRug = visual.id === 'blue-rug'
    return (
      <g>
        {/* Rug base */}
        <ellipse cx="32" cy="35" rx="26" ry="14" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Stitching inner oval ring */}
        <ellipse cx="32" cy="35" rx="17" ry="8" fill="none" stroke={visual.accent} strokeWidth="2" strokeDasharray="4 4" />
        
        {/* Custom pattern in center */}
        {isBlueRug ? (
          // Cloud pattern
          <path d="M30 35 C31 33 33 33 34 35 C35 34 37 34 36 36 C37 37 35 38 32 37 Z" fill="#fff" opacity="0.8" />
        ) : (
          // Leaf motif
          <Motif type="leaf" x={25} y={34} size={5} color={visual.secondary} />
        )}
      </g>
    )
  }

  if (isSconce) {
    return (
      <g>
        {/* Light glow aura */}
        <circle cx="32" cy="27" r="16" fill={visual.accent} opacity="0.32" />
        {/* Shade cone */}
        <path d="M24 18 H40 L44 31 H20 Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Bulb */}
        <circle cx="32" cy="24" r="3.5" fill="#fff" stroke={visual.secondary} strokeWidth="1" />
        {/* Wall bracket arms */}
        <path d="M32 31 V41" stroke={visual.secondary} strokeWidth="3" strokeLinecap="round" />
        <rect x="25" y="41" width="14" height="6" rx="2" fill={visual.secondary} />
      </g>
    )
  }

  if (isDog) {
    return (
      <g>
        {/* Sitting Dog body */}
        <ellipse cx="28" cy="42" rx="18" ry="11" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* White chest fluff */}
        <ellipse cx="27" cy="46" rx="10" ry="5.5" fill={visual.accent} opacity="0.85" />
        {/* Tail */}
        <path d="M12 39 Q5 34 11 28" stroke={visual.secondary} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        {/* Head */}
        <circle cx="44" cy="33" r="10.5" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
        {/* Ears */}
        <path d="M36 26 L38.5 18.5 L44 24.5 Z" fill={visual.secondary} />
        <path d="M50 24.5 L54.5 18.5 L56.5 27 Z" fill={visual.secondary} />
        {/* Muzzle */}
        <ellipse cx="45.5" cy="37" rx="5.2" ry="3.8" fill={visual.accent} />
        <circle cx="45.5" cy="35" r="1.5" fill={visual.secondary} />
        {/* Eyes */}
        <path d="M39.5 31.5 q1.7 1.5 3.4 0 M49.5 31.5 q1.7 1.5 3.4 0" stroke={visual.secondary} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        {/* Feet paws */}
        <path d="M34 50 h6 M25 51.5 h6" stroke={visual.secondary} strokeWidth="2.2" strokeLinecap="round" />
      </g>
    )
  }

  if (isPlant) {
    return (
      <g>
        {/* Clay pot */}
        <path d="M21 34 H43 L39 52 H25 Z" fill="#c98251" stroke="#9b623a" strokeWidth="2.4" />
        <rect x="19" y="32" width="26" height="4" rx="1" fill="#b36c3e" stroke="#9b623a" strokeWidth="1.5" />
        {/* Green leaves growing out */}
        <path d="M32 32 Q20 22 22 9 Q34 13 32 32Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.2" />
        <path d="M32 32 Q45 23 44 12 Q34 16 32 32Z" fill={visual.accent} stroke={visual.secondary} strokeWidth="2.2" />
        <path d="M32 32 Q32 16 36 6 Q38 18 32 32Z" fill="#a7c48c" stroke={visual.secondary} strokeWidth="1.5" />
      </g>
    )
  }

  // Fallback generic decor
  return (
    <>
      <path d="M32 31 Q20 24 22 9 Q34 13 32 31Z" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.2" />
      <path d="M32 31 Q45 25 44 13 Q34 16 32 31Z" fill={visual.accent} stroke={visual.secondary} strokeWidth="2.2" />
      <path d="M21 33 H43 L39 52 H25 Z" fill="#c98251" stroke="#9b623a" strokeWidth="2.4" />
      <path d="M24 43 Q32 38 40 43" stroke={visual.secondary} strokeWidth="1.8" strokeLinecap="round" />
    </>
  )
}

function Surface({ visual }) {
  const isFloor = visual.kind === 'floor'
  const isWood = visual.variant === 'wood'
  const isGrass = visual.variant === 'grass'
  const isStripe = visual.variant === 'stripe'
  return (
    <>
      <rect x="9" y="13" width="46" height="38" rx="7" fill={visual.primary} stroke={visual.secondary} strokeWidth="2.4" />
      {isFloor ? (
        <>
          {isWood ? (
            <>
              <path d="M11 25 H53 M11 38 H53 M22 13 V25 M38 25 V38 M28 38 V51" stroke={visual.secondary} strokeWidth="1.8" opacity="0.64" />
              <path d="M17 20 Q25 16 34 20 M19 33 Q29 29 42 33 M16 44 Q24 41 33 44" stroke={visual.accent} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.72" />
            </>
          ) : (
            <>
              <path d="M11 25 H53 M11 38 H53 M24 13 V51 M40 13 V51" stroke={visual.secondary} strokeWidth="1.5" opacity="0.3" />
              <circle cx="22" cy="30" r="4" fill={visual.secondary} opacity="0.28" />
              <circle cx="42" cy="39" r="4" fill={visual.secondary} opacity="0.2" />
              <Motif type="fern" x={45} y={22} size={4.2} color={visual.accent} />
            </>
          )}
        </>
      ) : (
        <>
          {isStripe ? (
            <>
              <path d="M20 13 V51 M32 13 V51 M44 13 V51" stroke={visual.secondary} strokeWidth="4" opacity="0.42" />
              <circle cx="20" cy="24" r="3.5" fill={visual.accent} opacity="0.5" />
              <circle cx="43" cy="38" r="3.5" fill={visual.accent} opacity="0.42" />
            </>
          ) : (
            <>
              <path d="M18 41 L24 29 L31 41 Z M34 36 L40 23 L48 36 Z" fill={visual.secondary} opacity="0.72" />
              <circle cx="22" cy="24" r="3.2" fill={visual.accent} opacity="0.58" />
              <circle cx="43" cy="22" r="3.2" fill={visual.accent} opacity="0.48" />
            </>
          )}
          <Motif type={visual.motif === 'tree' ? 'leaf' : visual.motif} x={25} y={25} size={5} color={visual.accent} />
        </>
      )}
    </>
  )
}

function ItemDrawing({ visual, rotate = 0 }) {
  if (visual.kind === 'hat') return <Hat visual={visual} />
  if (visual.kind === 'bag') return <Bag visual={visual} />
  if (visual.kind === 'accessory') return <Accessory visual={visual} />
  if (visual.kind === 'furniture') return <Furniture visual={visual} rotate={rotate} />
  if (visual.kind === 'decor') return <Decor visual={visual} />
  if (visual.kind === 'wallpaper' || visual.kind === 'floor') return <Surface visual={visual} />
  return <Outfit visual={visual} />
}

export function ItemArt({ item, size = 56, framed = true, rotate = 0 }) {
  const image = getItemImage(item)
  if (image) {
    return (
      <img
        className="item-art item-art-img"
        src={image}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          filter: framed ? 'drop-shadow(0 4px 6px rgba(102, 83, 42, 0.18))' : 'drop-shadow(0 5px 6px rgba(102, 83, 42, 0.28))',
        }}
      />
    )
  }

  const visual = getItemVisual(item)
  const seed = hashText(`${item.id}-${visual.primary}-${visual.variant}`)
  const bgA = seed % 2 === 0 ? '#fff8e8' : '#f2f7ee'
  const bgB = seed % 3 === 0 ? '#e7f0dd' : '#f6ead4'

  return (
    <svg className="item-art" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        {framed && (
          <linearGradient id={`itemBg-${seed}`} x1="12" y1="10" x2="52" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor={bgA} />
            <stop offset="1" stopColor={bgB} />
          </linearGradient>
        )}
        <filter id={`itemShadow-${seed}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#6f5939" floodOpacity="0.22" />
        </filter>
      </defs>
      {framed && (
        <>
          <rect x="4" y="4" width="56" height="56" rx="17" fill={`url(#itemBg-${seed})`} />
          <circle cx="52" cy="13" r="4" fill={visual.accent} opacity="0.24" />
          <circle cx="12" cy="50" r="6" fill={visual.primary} opacity="0.12" />
        </>
      )}
      <g filter={`url(#itemShadow-${seed})`} transform={poseTransform(visual)}>
        <ItemDrawing visual={visual} rotate={rotate} />
        <DetailPattern visual={visual} />
        <OrnamentLayer visual={visual} />
      </g>
      {/* KindBadge 제거됨 */}
      {item.custom && <Motif type="sparkle" x={51} y={51} size={4.2} color={visual.accent} />}
    </svg>
  )
}

function KindBadge({ kind, color = '#ffffff', accent = '#f0b94a' }) {
  const x = 50
  const y = 12
  const r = 8
  if (!kind) return null
  // small rounded square background
  const bg = <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx="4" fill="#fff" opacity="0.9" stroke="#e9e3d6" />
  if (kind === 'outfit') {
    return (
      <g>
        {bg}
        <path d="M42 12 Q48 6 54 12" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M46 15 L50 12 L54 15" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    )
  }
  if (kind === 'hat') {
    return (
      <g>
        {bg}
        <path d="M44 13 Q50 8 56 13 Q50 16 44 13Z" fill={color} stroke={color} strokeWidth="1" />
      </g>
    )
  }
  if (kind === 'bag') {
    return (
      <g>
        {bg}
        <rect x="46" y="8" width="12" height="10" rx="2" fill={color} />
        <path d="M50 8 V6 A4 4 0 0 1 58 6 V8" stroke={accent} strokeWidth="1.4" fill="none" />
      </g>
    )
  }
  if (kind === 'accessory') {
    return (
      <g>
        {bg}
        <Motif type="sparkle" x={50} y={12} size={4} color={accent} />
      </g>
    )
  }
  if (kind === 'furniture' || kind === 'decor') {
    return (
      <g>
        {bg}
        <rect x="48" y="10" width="8" height="6" rx="1" fill={color} />
        <path d="M50 16 V18 M54 16 V18" stroke={accent} strokeWidth="1" />
      </g>
    )
  }
  return (
    <g>
      {bg}
      <Motif type="sparkle" x={50} y={12} size={3.6} color={accent} />
    </g>
  )
}

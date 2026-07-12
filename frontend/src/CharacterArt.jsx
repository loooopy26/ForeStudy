// The avatar is drawn from JSX/SVG primitives so clothes can be layered over
// the same body without relying on a flattened character image.
// Style: flat kawaii calico cat — clean outlines, no texture filters.
import { useId } from 'react'

const OUTLINE = '#6b4a30'
const FUR = '#fffcf4'
const FUR_SHADE = '#f1e3cc'
const PATCH = '#c98d55'
const PATCH_DARK = '#a96f3d'
const TAN = '#d9ab6e'
const PINK_EAR = '#f7a8b3'
const BLUSH = '#f5a3a8'
const EYE = '#2f1d12'
const MOUTH = '#8a4a35'
const TONGUE = '#f2908a'

const px = (item, key, fallback) =>
  item?.[key] || item?.visual?.[key === 'color' ? 'primary' : 'secondary'] || fallback

function LayerImage({ item }) {
  return <image href={`/layers/${item.layer}`} x="0" y="0" width="240" height="300" />
}

function OutfitTorso({ item, ids }) {
  if (item.layer) return <LayerImage item={item} />
  const color = px(item, 'color', '#7d9c62')
  const trim = px(item, 'trim', '#5f7a43')
  const variant = item.art === 'hoodie' || item.art === 'sweater' ? item.art : 'jacket'
  const long = item.id === 'yellow-raincoat' || item.art === 'raincoat'
  const bottom = long ? 252 : 226

  return (
    <g clipPath={`url(#${ids.body})`}>
      <path d={`M 66 160 Q 122 144 178 160 L 182 ${bottom} Q 122 ${bottom + 12} 62 ${bottom} Z`} fill={color} />
      <path d={`M 64 ${bottom - 7} Q 122 ${bottom + 3} 180 ${bottom - 7}`} fill="none" stroke={trim} strokeWidth="4" opacity="0.78" />

      {variant === 'jacket' && (
        <>
          <path d="M 96 158 Q 108 174 122 180 Q 136 174 148 158" fill="none" stroke={trim} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M 122 180 V ${bottom - 8}`} stroke={trim} strokeWidth="3" strokeLinecap="round" />
          <circle cx="122" cy="194" r="3" fill={trim} />
          <circle cx="122" cy="211" r="3" fill={trim} />
          <rect x="82" y="206" width="19" height="12" rx="5" fill="none" stroke={trim} strokeWidth="2.4" />
          <rect x="141" y="206" width="19" height="12" rx="5" fill="none" stroke={trim} strokeWidth="2.4" />
        </>
      )}

      {variant === 'hoodie' && (
        <>
          <path d="M 88 162 Q 122 188 156 162 Q 151 182 122 186 Q 93 182 88 162 Z" fill={trim} opacity="0.9" />
          <path d="M 113 182 v 13 M 131 182 v 13" stroke={trim} strokeWidth="2.7" strokeLinecap="round" />
          <circle cx="113" cy="197" r="2.3" fill={trim} />
          <circle cx="131" cy="197" r="2.3" fill={trim} />
          <path d="M 98 204 Q 122 196 146 204 L 143 219 Q 122 225 101 219 Z" fill="none" stroke={trim} strokeWidth="2.6" strokeLinejoin="round" />
        </>
      )}

      {variant === 'sweater' && (
        <>
          <path d="M 89 162 Q 122 177 155 162" fill="none" stroke={trim} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M 64 194 H 180 M 63 207 H 181" stroke={trim} strokeWidth="4.2" opacity="0.58" />
        </>
      )}
    </g>
  )
}

function PantsDrawing({ item, ids }) {
  if (item.layer) return <LayerImage item={item} />
  const color = px(item, 'color', '#4a6b8c')
  const trim = px(item, 'trim', '#3b5670')
  return (
    <g clipPath={`url(#${ids.body})`}>
      <path d="M 66 222 Q 122 232 178 222 L 175 250 L 136 250 L 132 246 Q 127 242 122 242 Q 117 242 112 246 L 108 250 L 69 250 Z" fill={color} />
      <path d="M 122 232 V 240 M 74 246 H 106 M 138 246 H 170" fill="none" stroke={trim} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </g>
  )
}

// Both arms hang down in front of the belly, paws at the lower belly.
const ARM_RIGHT_PATH = 'M 150 158 C 162 165 168 182 166 199 C 164 212 156 220 147 218 C 139 216 136 208 140 200 C 143 191 143 178 142 169 C 142 162 145 158 150 158 Z'
const ARM_LEFT_PATH = 'M 94 158 C 82 165 76 182 78 199 C 80 212 88 220 97 218 C 105 216 108 208 104 200 C 101 191 101 178 102 169 C 102 162 99 158 94 158 Z'

function ArmRight({ outfit, ids }) {
  const color = outfit ? px(outfit, 'color', '#7d9c62') : null
  const trim = outfit ? px(outfit, 'trim', '#5f7a43') : null
  return (
    <g>
      <path d={ARM_RIGHT_PATH} fill={FUR} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
      {color && !outfit.layer && (
        <g clipPath={`url(#${ids.armRight})`}>
          <rect x="134" y="152" width="40" height="36" fill={color} />
          <path d="M 137 184 Q 153 191 169 182" fill="none" stroke={trim} strokeWidth="3.2" opacity="0.82" />
        </g>
      )}
      <path d="M 143 209 q 3 6 6 0 M 150 211 q 3 6 6 -1" fill="none" stroke={OUTLINE} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </g>
  )
}

function ArmLeft({ outfit, ids }) {
  const color = outfit ? px(outfit, 'color', '#7d9c62') : null
  const trim = outfit ? px(outfit, 'trim', '#5f7a43') : null
  return (
    <g className="cat-arm-left">
      <path d={ARM_LEFT_PATH} fill={FUR} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
      {color && !outfit.layer && (
        <g clipPath={`url(#${ids.armLeft})`}>
          <rect x="70" y="152" width="40" height="36" fill={color} />
          <path d="M 107 184 Q 91 191 75 182" fill="none" stroke={trim} strokeWidth="3.2" opacity="0.82" />
        </g>
      )}
      <path d="M 95 209 q 3 6 6 0 M 88 211 q 3 6 6 -1" fill="none" stroke={OUTLINE} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </g>
  )
}

// Easter-egg greeting arm: normally invisible; CSS (`.cat-arm-wave` in
// CharacterPage.css) occasionally swaps it in for the left arm and wiggles it.
const ARM_WAVE_PATH = 'M 48 118 L 73 177 A 10.5 10.5 0 0 0 92 169 L 68 110 A 13.5 13.5 0 1 0 48 118 Z'
function ArmWave({ outfit, ids }) {
  const color = outfit ? px(outfit, 'color', '#7d9c62') : null
  const trim = outfit ? px(outfit, 'trim', '#5f7a43') : null
  return (
    <g className="cat-arm-wave" aria-hidden="true">
      <path d={ARM_WAVE_PATH} fill={FUR} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
      {color && !outfit.layer && (
        <g clipPath={`url(#${ids.armWave})`}>
          <path d="M 60 149 L 82 139 L 100 178 L 68 192 Z" fill={color} />
          <path d="M 60 149 L 82 139" fill="none" stroke={trim} strokeWidth="3.2" opacity="0.82" />
        </g>
      )}
      {/* Paw pad + toes face the viewer while waving. */}
      <circle cx="57" cy="116" r="5.4" fill={PINK_EAR} opacity="0.95" />
      <circle cx="50" cy="107" r="2.6" fill={PINK_EAR} opacity="0.9" />
      <circle cx="57" cy="104" r="2.6" fill={PINK_EAR} opacity="0.9" />
      <circle cx="64" cy="107" r="2.6" fill={PINK_EAR} opacity="0.9" />
    </g>
  )
}

function BagBack({ item }) {
  if (!item || item.layer || (item.art !== 'backpack' && item.visual?.variant !== 'backpack')) return null
  const color = px(item, 'color', '#7d9c62')
  const trim = px(item, 'trim', '#5f7a43')
  return (
    <g>
      <rect x="48" y="172" width="28" height="58" rx="13" fill={color} stroke={OUTLINE} strokeWidth="2.8" />
      <rect x="166" y="172" width="28" height="58" rx="13" fill={color} stroke={OUTLINE} strokeWidth="2.8" />
      <path d="M 53 188 H 71 M 171 188 H 189" stroke={trim} strokeWidth="3" strokeLinecap="round" />
    </g>
  )
}

function BagFront({ item, ids }) {
  if (!item) return null
  if (item.layer) return <LayerImage item={item} />
  const color = px(item, 'color', '#b08a5f')
  const trim = px(item, 'trim', '#8a6647')
  if (item.art === 'backpack' || item.visual?.variant === 'backpack') {
    return <path d="M 88 158 C 90 182 91 203 92 220 M 156 158 C 154 182 153 203 152 220" fill="none" stroke={trim} strokeWidth="6" strokeLinecap="round" clipPath={`url(#${ids.body})`} />
  }
  return (
    <g>
      <path d="M 94 160 C 120 182 150 206 166 220" fill="none" stroke={trim} strokeWidth="6" strokeLinecap="round" clipPath={`url(#${ids.body})`} />
      <rect x="152" y="212" width="42" height="30" rx="10" fill={color} stroke={OUTLINE} strokeWidth="2.8" />
      <path d="M 153 223 Q 173 215 193 223" fill="none" stroke={trim} strokeWidth="3" />
      <circle cx="173" cy="231" r="3.2" fill={trim} />
    </g>
  )
}

function NeckAccessory({ item }) {
  if (item.layer) return <LayerImage item={item} />
  const color = px(item, 'color', '#c96f5e')
  const trim = px(item, 'trim', '#a95243')
  return (
    <g>
      <path d="M 82 150 Q 122 172 162 150 Q 160 170 122 181 Q 84 170 82 150 Z" fill={color} stroke={trim} strokeWidth="3" />
      <path d="M 110 173 L 107 206 Q 122 213 135 206 L 132 173" fill={color} stroke={trim} strokeWidth="3" strokeLinejoin="round" />
    </g>
  )
}

function FaceAccessory({ item }) {
  if (item.layer) return <LayerImage item={item} />
  const color = px(item, 'color', '#6b5b45')
  if (item.art === 'glasses' || item.visual?.variant === 'glasses') {
    return (
      <g fill="rgba(255,255,255,0.12)" stroke={color} strokeWidth="3.2">
        <circle cx="95" cy="107" r="17" />
        <circle cx="149" cy="107" r="17" />
        <path d="M 112 104 Q 122 100 132 104 M 78 104 L 58 97 M 166 104 L 186 97" fill="none" strokeLinecap="round" />
      </g>
    )
  }
  return (
    <g>
      <path d="M 170 38 l -24 -13 q -5 13 2 25 Z M 170 38 l 24 -13 q 5 13 -2 25 Z" fill={color} stroke={OUTLINE} strokeWidth="2.5" />
      <circle cx="170" cy="38" r="6" fill="#e8a4b0" stroke={OUTLINE} strokeWidth="2" />
    </g>
  )
}

function Hat({ item }) {
  if (item.layer) return <LayerImage item={item} />
  const color = px(item, 'color', '#8bb069')
  const trim = px(item, 'trim', '#5f7a43')
  if (item.art === 'leaf-hat') return <g><path d="M 82 42 C 98 16 148 12 164 40 Q 122 26 82 42 Z" fill={color} stroke={trim} strokeWidth="3" /><path d="M 123 18 V 6" stroke={trim} strokeWidth="3" strokeLinecap="round" /></g>
  if (item.art === 'straw-hat') return <g><ellipse cx="122" cy="40" rx="56" ry="12" fill={color} stroke={trim} strokeWidth="3" /><path d="M 92 36 Q 96 12 150 14 Q 156 24 156 36 Z" fill={color} stroke={trim} strokeWidth="3" /><path d="M 94 31 Q 122 38 154 31" fill="none" stroke={trim} strokeWidth="5" /></g>
  return <g><path d="M 86 38 Q 100 10 152 20 Q 164 28 160 42 Q 136 37 118 34 Q 100 42 86 38 Z" fill={color} stroke={trim} strokeWidth="3" /><circle cx="122" cy="13" r="4.5" fill={trim} /></g>
}

function CatArt({ equipped, getItem }) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const ids = {
    body: `cat-body-${rawId}`,
    armRight: `cat-arm-right-${rawId}`,
    armLeft: `cat-arm-left-${rawId}`,
    armWave: `cat-arm-wave-${rawId}`,
    head: `cat-head-${rawId}`,
    tail: `cat-tail-${rawId}`,
  }
  const get = (slot) => equipped?.[slot] ? getItem(equipped[slot]) : null
  const outfit = get('outfit')
  const pants = get('pants')
  const bag = get('bag')
  const accessory = get('accessory')
  const hat = get('hat')
  const faceAccessory = accessory && (accessory.art === 'glasses' || accessory.art === 'ribbon' || accessory.visual?.variant === 'glasses' || accessory.visual?.variant === 'ribbon')

  const bodyPath = 'M 90 148 C 77 164 71 192 73 220 C 75 244 80 264 89 272 C 95 277 104 276 108 269 C 111 262 112 246 117 241 C 120 239 124 239 127 241 C 132 246 133 262 136 269 C 140 276 149 277 155 272 C 164 264 168 244 169 220 C 171 192 165 164 152 148 C 133 139 109 139 90 148 Z'
  const headPath = 'M 54 104 C 54 66 82 44 122 44 C 162 44 190 66 190 104 C 190 138 162 158 122 158 C 82 158 54 138 54 104 Z'
  const tailPath = 'M 158 246 C 184 252 208 238 211 212 C 213 194 206 182 196 184 C 188 186 185 194 187 206 C 189 222 178 232 160 231 Z'

  return (
    <svg className="cat-art" viewBox="0 0 240 300" aria-hidden="true">
      <defs>
        <clipPath id={ids.body}><path d={bodyPath} /></clipPath>
        <clipPath id={ids.armRight}><path d={ARM_RIGHT_PATH} /></clipPath>
        <clipPath id={ids.armLeft}><path d={ARM_LEFT_PATH} /></clipPath>
        <clipPath id={ids.armWave}><path d={ARM_WAVE_PATH} /></clipPath>
        <clipPath id={ids.head}><path d={headPath} /></clipPath>
        <clipPath id={ids.tail}><path d={tailPath} /></clipPath>
      </defs>

      {/* Soft ground shadow keeps the cat anchored, like the reference. */}
      <ellipse cx="122" cy="282" rx="54" ry="8" fill="#d9c9ae" opacity="0.38" />

      {/* Striped tail curls up behind the body. */}
      <g>
        <path d={tailPath} fill={PATCH} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
        <g clipPath={`url(#${ids.tail})`}>
          <path d="M 190 186 q 15 4 20 17" fill="none" stroke={PATCH_DARK} strokeWidth="7" strokeLinecap="round" />
          <path d="M 184 203 q 17 6 18 21" fill="none" stroke={PATCH_DARK} strokeWidth="7" strokeLinecap="round" />
        </g>
      </g>
      {bag && <BagBack item={bag} />}

      {/* Chubby pear body with two stubby feet. */}
      <path d={bodyPath} fill={FUR} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
      <g clipPath={`url(#${ids.body})`}>
        <ellipse cx="122" cy="164" rx="36" ry="13" fill={FUR_SHADE} opacity="0.45" />
        <ellipse cx="148" cy="234" rx="15" ry="12" fill={PATCH} />
        <ellipse cx="99" cy="256" rx="12" ry="11" fill={TAN} />
      </g>
      {outfit && <OutfitTorso item={outfit} ids={ids} />}
      {pants && <PantsDrawing item={pants} ids={ids} />}
      {bag && <BagFront item={bag} ids={ids} />}

      <ArmLeft outfit={outfit} ids={ids} />
      <ArmRight outfit={outfit} ids={ids} />
      <path d="M 94 266 q 2 7 6 0 M 101 268 q 3 7 6 0 M 137 268 q 3 7 6 0 M 144 266 q 3 7 6 0" fill="none" stroke={OUTLINE} strokeWidth="2.1" strokeLinecap="round" opacity="0.75" />
      {accessory && !faceAccessory && <NeckAccessory item={accessory} />}

      <g className="cat-head">
        {/* Ears sit behind the head dome; the right ear belongs to the calico patch. */}
        <path d="M 66 66 C 58 38 66 20 80 17 C 94 20 106 34 111 50 C 96 52 80 58 66 66 Z" fill={FUR} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
        <path d="M 74 56 C 70 41 75 30 83 28 C 91 31 98 39 101 48 C 91 50 82 52 74 56 Z" fill={PINK_EAR} />
        <path d="M 178 64 C 186 36 178 19 164 16 C 150 19 138 32 133 48 C 148 51 164 56 178 64 Z" fill={PATCH} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
        <path d="M 170 54 C 174 40 169 29 161 27 C 153 30 146 38 143 47 C 153 49 162 51 170 54 Z" fill={PINK_EAR} />

        <path d={headPath} fill={FUR} stroke={OUTLINE} strokeWidth="3" />

        {/* Calico patches: big brown patch over the viewer-right crown + tan spots left. */}
        <g clipPath={`url(#${ids.head})`}>
          <path d="M 118 36 C 152 34 184 52 195 86 C 198 101 190 111 177 108 C 156 103 135 80 127 56 C 124 48 120 42 118 36 Z" fill={PATCH} />
          <ellipse cx="166" cy="76" rx="7.5" ry="6.5" fill={PATCH_DARK} opacity="0.75" />
          <ellipse cx="102" cy="62" rx="8" ry="7" fill={TAN} />
          <ellipse cx="85" cy="84" rx="6.5" ry="6" fill={PATCH_DARK} opacity="0.85" />
        </g>

        {/* Face: big glossy eyes, tiny nose, open happy mouth, blush. */}
        <ellipse cx="95" cy="107" rx="9.5" ry="12.5" fill={EYE} />
        <ellipse cx="149" cy="107" rx="9.5" ry="12.5" fill={EYE} />
        <circle cx="92" cy="101" r="3.4" fill="#fff" />
        <circle cx="146" cy="101" r="3.4" fill="#fff" />
        <circle cx="98" cy="112" r="1.5" fill="#fff" opacity="0.85" />
        <circle cx="152" cy="112" r="1.5" fill="#fff" opacity="0.85" />
        <path d="M 116 116 Q 122 112 128 116 Q 126 122 122 122 Q 118 122 116 116 Z" fill="#42291a" />
        <path d="M 111 124 Q 116 128 122 126 Q 128 128 133 124 C 132 136 128 141 122 141 C 116 141 112 136 111 124 Z" fill={MOUTH} />
        <path d="M 117 135 Q 122 131 127 135 Q 125 139 122 139 Q 119 139 117 135 Z" fill={TONGUE} />
        <ellipse cx="77" cy="122" rx="8.5" ry="6" fill={BLUSH} opacity="0.8" />
        <ellipse cx="167" cy="122" rx="8.5" ry="6" fill={BLUSH} opacity="0.8" />
        <path d="M 62 102 L 42 96 M 60 111 L 39 110 M 62 120 L 43 124 M 182 102 L 202 96 M 184 111 L 205 110 M 182 120 L 201 124" fill="none" stroke={OUTLINE} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
        {accessory && faceAccessory && <FaceAccessory item={accessory} />}
        {hat && <Hat item={hat} />}
      </g>

      {/* Greeting paw overlaps the cheek edge, so it renders last. */}
      <ArmWave outfit={outfit} ids={ids} />
    </svg>
  )
}

export default CatArt

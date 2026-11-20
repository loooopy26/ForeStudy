import characterBase from './assets/cat-mascot.png'
import './CharacterAvatar.css'

const CHARACTER_IMAGE_VERSION = '20261120-19'

const CHARACTER_IDS = new Set([
  'bear-hood',
  'animal-sweater',
  'green-jacket',
  'navy-hoodie',
  'pink-hoodie',
  'yellow-raincoat',
  'blue-jeans',
  'brown-slacks',
  'green-shorts',
  'leaf-hat',
  'straw-hat',
  'acorn-beret',
])

const PROVIDED_CHARACTER_IMAGES = {
  base: '/characters/provided-1.png',
  bearOutfit: '/characters/provided-2.png',
  animalSweater: '/characters/provided-3.png',
  brownPants: '/characters/provided-4.png',
  hat: '/characters/provided-5.png',
  bearBrown: '/characters/provided-6.png',
  animalBrown: '/characters/provided-7.png',
}

const COMPOSITE_IMAGES = {
  'bear-hood|blue-jeans|': '/characters/combo-bear-blue.png',
  'bear-hood|brown-slacks|': '/characters/combo-bear-brown.png',
  'bear-hood|green-shorts|': '/characters/combo-bear-green.png',
  'animal-sweater|blue-jeans|': '/characters/combo-sweater-blue.png',
  'animal-sweater|brown-slacks|': '/characters/combo-sweater-brown.png',
  'animal-sweater|green-shorts|': '/characters/combo-sweater-green.png',
  'green-jacket|blue-jeans|': '/characters/combo-jacket-blue.png',
  'green-jacket|brown-slacks|': '/characters/combo-jacket-brown.png',
  'green-jacket|green-shorts|': '/characters/combo-jacket-green.png',
  'navy-hoodie|blue-jeans|': '/characters/combo-navy-blue.png',
  'navy-hoodie|brown-slacks|': '/characters/combo-navy-brown.png',
  'navy-hoodie|green-shorts|': '/characters/combo-navy-green.png',
  'pink-hoodie|blue-jeans|': '/characters/combo-pink-blue.png',
  'pink-hoodie|brown-slacks|': '/characters/combo-pink-brown.png',
  'pink-hoodie|green-shorts|': '/characters/combo-pink-green.png',
  'yellow-raincoat|blue-jeans|': '/characters/combo-yellow-blue.png',
  'yellow-raincoat|brown-slacks|': '/characters/combo-yellow-brown.png',
  'yellow-raincoat|green-shorts|': '/characters/combo-yellow-green.png',
  '|blue-jeans|leaf-hat': '/characters/combo-leaf-base-blue.png',
  'bear-hood|blue-jeans|leaf-hat': '/characters/combo-leaf-bear-blue.png',
  'bear-hood|brown-slacks|leaf-hat': '/characters/combo-leaf-bear-brown.png',
  'bear-hood|green-shorts|leaf-hat': '/characters/combo-leaf-bear-green.png',
  'animal-sweater|blue-jeans|straw-hat': '/characters/combo-straw-sweater-blue.png',
  'animal-sweater|brown-slacks|straw-hat': '/characters/combo-straw-sweater-brown.png',
  'animal-sweater|green-shorts|straw-hat': '/characters/combo-straw-sweater-green.png',
  'green-jacket|blue-jeans|straw-hat': '/characters/combo-straw-jacket-blue.png',
  'green-jacket|brown-slacks|straw-hat': '/characters/combo-straw-jacket-brown.png',
  'green-jacket|green-shorts|straw-hat': '/characters/combo-straw-jacket-green.png',
  'pink-hoodie|blue-jeans|straw-hat': '/characters/combo-straw-pink-blue.png',
  'pink-hoodie|brown-slacks|straw-hat': '/characters/combo-straw-pink-brown.png',
  'navy-hoodie|blue-jeans|acorn-beret': '/characters/combo-acorn-navy-blue.png',
  'navy-hoodie|brown-slacks|acorn-beret': '/characters/combo-acorn-navy-brown.png',
  'navy-hoodie|green-shorts|acorn-beret': '/characters/combo-acorn-navy-green.png',
  'yellow-raincoat|blue-jeans|acorn-beret': '/characters/combo-acorn-yellow-blue.png',
  'yellow-raincoat|brown-slacks|acorn-beret': '/characters/combo-acorn-yellow-brown.png',
  'yellow-raincoat|green-shorts|acorn-beret': '/characters/combo-acorn-yellow-green.png',
  'animal-sweater|brown-slacks|acorn-beret': '/characters/combo-acorn-sweater-brown.png',
  'animal-sweater|green-shorts|acorn-beret': '/characters/combo-acorn-sweater-green.png',
}

function versionImage(path) {
  return `${path}?v=${CHARACTER_IMAGE_VERSION}`
}

function getCharacterImage(equipped, getItem) {
  const outfit = equipped.outfit || ''
  const pants = equipped.pants || ''
  const hat = equipped.hat || ''
  if (outfit === 'bear-hood' && pants === 'brown-slacks' && !hat) {
    return versionImage(PROVIDED_CHARACTER_IMAGES.bearBrown)
  }
  if (outfit === 'animal-sweater' && pants === 'brown-slacks' && !hat) {
    return versionImage(PROVIDED_CHARACTER_IMAGES.animalBrown)
  }
  if (!outfit && !pants && hat) return versionImage(PROVIDED_CHARACTER_IMAGES.hat)
  if (outfit === 'bear-hood' && !pants && !hat) {
    return versionImage(PROVIDED_CHARACTER_IMAGES.bearOutfit)
  }
  if (outfit === 'animal-sweater' && !pants && !hat) {
    return versionImage(PROVIDED_CHARACTER_IMAGES.animalSweater)
  }
  if (!outfit && pants === 'brown-slacks' && !hat) {
    return versionImage(PROVIDED_CHARACTER_IMAGES.brownPants)
  }
  if (!outfit && !pants && !hat) return versionImage(PROVIDED_CHARACTER_IMAGES.base)

  const compositeKey = `${outfit}|${pants}|${hat}`
  if (COMPOSITE_IMAGES[compositeKey]) return versionImage(COMPOSITE_IMAGES[compositeKey])

  const selectedId = outfit || pants || hat
  const item = getItem(selectedId)
  if (item?.characterImage) return versionImage(item.characterImage)
  if (CHARACTER_IDS.has(selectedId)) return versionImage(`/characters/${selectedId}.png`)
  return versionImage('/characters/base.png')
}

function CharacterAvatar({ equipped = {}, getItem = () => null, className = '' }) {
  const characterImage = getCharacterImage(equipped, getItem)

  return (
    <div className={`character-avatar ${className}`}>
      <img className="character-avatar-base" src={characterImage || characterBase} alt="고양이 캐릭터" draggable={false} />
    </div>
  )
}

export default CharacterAvatar

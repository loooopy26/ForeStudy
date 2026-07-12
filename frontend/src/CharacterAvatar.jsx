// 캐릭터 아바타 래퍼.
// 고양이는 CharacterArt(SVG)로 직접 그린다 — 몸과 옷이 같은 좌표계라 항상 정확히 맞는다.
// 숨쉬기 애니메이션은 이 래퍼(.character-avatar) 한 곳에만 → 파츠가 어긋나지 않음.
import CatArt from './CharacterArt'

function CharacterAvatar({ equipped, getItem, className = "" }) {
  return (
    <div className={`character-avatar ${className}`}>
      <CatArt equipped={equipped} getItem={getItem} />
    </div>
  )
}

export default CharacterAvatar

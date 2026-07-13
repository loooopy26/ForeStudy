// 캐릭터 아바타 래퍼. 사용자가 제공한 고양이 원본 이미지를 캐릭터·프로필·레벨업
// 화면에서 동일하게 사용한다.
import catMascot from './assets/cat-mascot.png'

function CharacterAvatar({ className = "" }) {
  return (
    <div className={`character-avatar ${className}`}>
      <img className="cat-art" src={catMascot} alt="손을 흔드는 고양이 캐릭터" />
    </div>
  )
}

export default CharacterAvatar

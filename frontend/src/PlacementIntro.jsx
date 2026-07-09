import Header from './Header'
import { QuizIcon } from './icons'
import './Shell.css'

function PlacementIntro({ onNavigate, certName, materialId, placementQuiz }) {
  return (
    <>
      <Header title="배치고사" icon={<QuizIcon />} onBack={() => onNavigate('certUpload', { cert: certName })} />

      <div className="done-screen">
        <div className="done-badge done-check">
          <QuizIcon size={44} />
        </div>
        <div>
          <div className="done-title">배치고사를 시작하시겠습니까?</div>
          <div className="done-desc">
            {certName ? `${certName} ` : ''}학습 수준을 확인하는 객관식 10문제예요.
            <br />
            준비되면 시작해 주세요.
          </div>
        </div>
      </div>

      <div className="cta-area">
        <button type="button" className="cta-button" onClick={() => onNavigate('placementTest', { cert: certName, materialId, placementQuiz })}>
          시작하기
        </button>
      </div>
    </>
  )
}

export default PlacementIntro

import { useState } from 'react'
import ConfirmModal from './ConfirmModal'
import Header from './Header'
import { deleteMaterial } from './api'
import { QuizIcon } from './icons'
import './Shell.css'

function PlacementIntro({ onNavigate, certName, materialId, placementQuiz }) {
  const [pendingLeave, setPendingLeave] = useState(false)

  const handleBack = () => setPendingLeave(true)

  const confirmLeave = () => {
    setPendingLeave(false)
    if (materialId) deleteMaterial(materialId).catch(() => {})
    onNavigate('certUpload', { cert: certName })
  }

  const cancelLeave = () => setPendingLeave(false)

  return (
    <>
      <Header title="배치고사" icon={<QuizIcon />} onBack={handleBack} />

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
      <ConfirmModal
        open={pendingLeave}
        message="작성 중인 자료 분석·배치고사가 사라집니다. 나가시겠습니까?"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    </>
  )
}

export default PlacementIntro

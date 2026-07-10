import { useEffect, useRef, useState } from 'react'
import ConfirmModal from './ConfirmModal'
import { createPlacementQuiz, deleteMaterial, getMaterial, setMaterialId, uploadMaterial } from './api'
import { BackIcon, MedalIcon, UploadIcon, DocIcon } from './icons'
import './CertUpload.css'

const PROCESSING_MESSAGES = {
  requesting_document_parse: '문서에서 텍스트를 추출하고 있어요',
  chunking_document: '학습하기 좋은 단위로 내용을 나누고 있어요',
  creating_embeddings: '내용을 AI가 검색할 수 있도록 정리하고 있어요',
  saving_search_index: '학습 자료 검색 정보를 저장하고 있어요',
  generating_summary: 'AI가 핵심 내용과 개념을 요약하고 있어요',
  saving_summary: '요약 결과를 저장하고 있어요',
  quiz: '현재 수준을 확인할 배치고사 문제를 만들고 있어요',
}

// 2초 간격 * 900회 = 최대 30분. 대용량 문서는 백엔드 파싱만 최대 20분(services/upstage.py의
// _ASYNC_POLL_TIMEOUT_SECONDS)이 걸릴 수 있어 그보다 여유 있게 잡는다.
const MAX_POLL_ATTEMPTS = 900

function CertUpload({ certName, onNavigate }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progressMessage, setProgressMessage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  // 폴링이 시간 초과로 포기했지만 백엔드는 계속 처리 중인 material.
  // 재시도 시 이 값이 있으면 재업로드 대신 이어서 상태만 확인한다.
  const [pendingMaterialId, setPendingMaterialId] = useState(null)
  // 지금 이 화면에서 생성/처리 중인 material — 화면을 나갈 때 정리 대상으로 추적한다.
  const [activeMaterialId, setActiveMaterialId] = useState(null)
  const [pendingLeave, setPendingLeave] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!uploading) {
      clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [uploading])

  const addFiles = (fileList) => {
    if (!fileList) return
    setFiles((prev) => {
      const next = [...prev]
      for (const file of Array.from(fileList)) {
        if (!next.some((item) => item.name === file.name)) next.push(file)
      }
      return next
    })
    setError('')
    setPendingMaterialId(null)
  }

  const removeFile = (name) => {
    setFiles((prev) => prev.filter((file) => file.name !== name))
    setPendingMaterialId(null)
  }

  const waitForMaterialReady = async (materialId) => {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i += 1) {
      const material = await getMaterial(materialId)
      if (material.processed_status === 'ready') return material
      if (material.processed_status === 'failed') {
        throw new Error(material.processing_error || '자료 처리에 실패했습니다.')
      }
      setProgressMessage(
        PROCESSING_MESSAGES[material.processing_stage] || '학습 자료를 준비하고 있어요',
      )
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    // 서버에서는 계속 처리 중이므로 material은 살려두고, 재시도 시 이어서 확인하게 한다.
    setPendingMaterialId(materialId)
    throw new Error(
      '자료 처리 시간이 많이 길어지고 있습니다. 서버에서는 계속 처리 중이니 잠시 후 "이어서 확인"을 눌러주세요.',
    )
  }

  const completeUpload = async () => {
    if (!certName || (files.length === 0 && !pendingMaterialId) || uploading) return
    setUploading(true)
    setElapsed(0)
    setError('')
    try {
      let materialId = pendingMaterialId
      if (materialId) {
        setActiveMaterialId(materialId)
        setProgressMessage('기존에 업로드한 자료의 처리를 확인하고 있어요')
      } else {
        setProgressMessage('파일을 업로드하고 있어요')
        const uploaded = await uploadMaterial(files[0], `${certName} 학습 자료`)
        materialId = uploaded.material_id
        setActiveMaterialId(materialId)
        setProgressMessage('문서에서 텍스트를 추출하고 있어요')
      }
      await waitForMaterialReady(materialId)
      setPendingMaterialId(null)
      setProgressMessage(PROCESSING_MESSAGES.quiz)
      const placementQuiz = await createPlacementQuiz(materialId)
      setMaterialId(materialId)
      // 자격증은 아직 "등록된 것"이 아니다 — 일별 학습 플랜까지 다 만들고 최종 확인을
      // 눌러야 진짜로 등록된다(LearningPlanView의 confirmAndFinish). 그 전에 나가면
      // 배치고사/자료가 전부 정리되고 자격증도 목록에 안 남아야 하기 때문.
      setActiveMaterialId(null)
      onNavigate('placementIntro', { cert: certName, materialId, placementQuiz })
    } catch (err) {
      setError(err.message || '자료 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      setProgressMessage('')
    }
  }

  const hasInFlightWork = uploading || !!activeMaterialId || !!pendingMaterialId

  const handleBack = () => {
    if (!hasInFlightWork) {
      onNavigate('addcert')
      return
    }
    setPendingLeave(true)
  }

  const confirmLeaveBack = () => {
    setPendingLeave(false)
    const materialToDelete = activeMaterialId || pendingMaterialId
    if (materialToDelete) {
      deleteMaterial(materialToDelete).catch(() => {})
    }
    onNavigate('addcert')
  }

  const cancelLeaveBack = () => setPendingLeave(false)

  return (
    <div className="upload-page">
      <header className="screen-header">
        <button type="button" className="back-button" onClick={handleBack} aria-label="뒤로가기">
          <BackIcon />
        </button>
        <div className="header-title">자료 업로드</div>
        <div className="header-spacer" />
      </header>

      <div className="body-scroll upload-body">
        <div className="upload-cert-chip">
          <span className="upload-cert-icon">
            <MedalIcon size={18} />
          </span>
          <span className="upload-cert-name">{certName || '선택한 자격증'}</span>
        </div>

        <label className="upload-dropzone">
          <UploadIcon size={30} />
          <p className="upload-dropzone-title">학습 자료를 선택하거나 끌어다 놓으세요</p>
          <p className="upload-dropzone-sub">PDF, PPT, DOCX 자료를 업로드하면 AI가 배치고사를 준비합니다.</p>
          <input
            type="file"
            multiple
            hidden
            accept=".pdf,.ppt,.pptx,.doc,.docx"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        {files.length > 0 && (
          <div className="upload-file-list">
            {files.map((file) => (
              <div className="upload-file-row" key={file.name}>
                <DocIcon size={16} />
                <span className="upload-file-name">{file.name}</span>
                <button
                  type="button"
                  className="upload-file-remove"
                  onClick={() => removeFile(file.name)}
                  aria-label="삭제"
                  disabled={uploading}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {uploading && (
          <div className="upload-progress">
            <p className="upload-progress-current">{progressMessage || '학습 자료를 준비하고 있어요'}</p>
            <p className="upload-progress-timer">
              {elapsed}초 경과
              {elapsed > 60 ? ' · 분량이 많은 자료는 몇 분 정도 걸릴 수 있어요.' : ''}
            </p>
          </div>
        )}
        {error && <p className="addcert-error">{error}</p>}
      </div>

      <div className="cta-area">
        <button
          type="button"
          className="cta-button"
          disabled={(files.length === 0 && !pendingMaterialId) || uploading}
          onClick={completeUpload}
        >
          {uploading
            ? '분석 중...'
            : pendingMaterialId
              ? '이어서 확인'
              : '등록 완료'}
        </button>
      </div>
      <ConfirmModal
        open={pendingLeave}
        message="작성 중인 자료 분석·배치고사가 사라집니다. 나가시겠습니까?"
        onConfirm={confirmLeaveBack}
        onCancel={cancelLeaveBack}
      />
    </div>
  )
}

export default CertUpload

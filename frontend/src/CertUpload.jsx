import { useEffect, useRef, useState } from 'react'
import { addCurrentCertificate, createPlacementQuiz, getMaterial, setMaterialId, uploadMaterial } from './api'
import { BackIcon, MedalIcon, UploadIcon, DocIcon, CheckIcon } from './icons'
import './CertUpload.css'

const STAGES = [
  { key: 'uploaded', label: '자료 업로드 확인' },
  { key: 'parsing', label: '자료 분석 중 (문서 파싱 · 임베딩)' },
  { key: 'summarizing', label: 'AI 요약 자료 생성 중' },
  { key: 'quiz', label: '배치고사 문제 생성 중' },
]

// processing_stage(백엔드가 보고하는 실제 파이프라인 단계)를 화면에 보여줄 단계로 매핑.
// parsing/embedding은 화면상 하나의 "자료 분석" 단계로 합쳐서 보여준다.
const BACKEND_STAGE_TO_UI_STAGE = {
  parsing: 'parsing',
  embedding: 'parsing',
  summarizing: 'summarizing',
}

const MAX_POLL_ATTEMPTS = 180 // 2초 간격 * 180회 = 최대 6분

function CertUpload({ certName, onNavigate }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [stage, setStage] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
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
  }

  const removeFile = (name) => {
    setFiles((prev) => prev.filter((file) => file.name !== name))
  }

  const waitForMaterialReady = async (materialId) => {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i += 1) {
      const material = await getMaterial(materialId)
      if (material.processed_status === 'ready') return material
      if (material.processed_status === 'failed') {
        throw new Error(material.processing_error || '자료 처리에 실패했습니다.')
      }
      const uiStage = BACKEND_STAGE_TO_UI_STAGE[material.processing_stage] || 'parsing'
      setStage(uiStage)
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error('자료 처리 시간이 많이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.')
  }

  const completeUpload = async () => {
    if (!certName || files.length === 0 || uploading) return
    setUploading(true)
    setElapsed(0)
    setError('')
    try {
      setStage('uploaded')
      const uploaded = await uploadMaterial(files[0], `${certName} 학습 자료`)
      const materialId = uploaded.material_id
      setStage('parsing')
      await waitForMaterialReady(materialId)
      setStage('quiz')
      const placementQuiz = await createPlacementQuiz(materialId)
      setMaterialId(materialId)
      addCurrentCertificate(certName, { materialId, subtitle: '학습 준비 중' })
      onNavigate('placementIntro', { cert: certName, materialId, placementQuiz })
    } catch (err) {
      setError(err.message || '자료 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      setStage('')
    }
  }

  const stageIndex = STAGES.findIndex((s) => s.key === stage)

  return (
    <div className="upload-page">
      <header className="screen-header">
        <button type="button" className="back-button" onClick={() => onNavigate('addcert')} aria-label="뒤로가기">
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
            <ol className="upload-progress-steps">
              {STAGES.map((s, index) => {
                const state = index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'pending'
                return (
                  <li key={s.key} className={`upload-progress-step upload-progress-step-${state}`}>
                    <span className="upload-progress-marker">
                      {state === 'done' ? <CheckIcon size={12} /> : <span className="upload-progress-dot" />}
                    </span>
                    {s.label}
                  </li>
                )
              })}
            </ol>
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
          disabled={files.length === 0 || uploading}
          onClick={completeUpload}
        >
          {uploading ? STAGES[stageIndex]?.label || '처리 중...' : '등록 완료'}
        </button>
      </div>
    </div>
  )
}

export default CertUpload

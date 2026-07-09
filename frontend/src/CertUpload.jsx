import { useState } from 'react'
import { addCurrentCertificate, createPlacementQuiz, getMaterial, setMaterialId, uploadMaterial } from './api'
import { BackIcon, MedalIcon, UploadIcon, DocIcon } from './icons'
import './CertUpload.css'

function CertUpload({ certName, onNavigate }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

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
    for (let i = 0; i < 60; i += 1) {
      const material = await getMaterial(materialId)
      if (material.processed_status === 'ready') return material
      if (material.processed_status === 'failed') {
        throw new Error(material.processing_error || '자료 처리에 실패했습니다.')
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error('자료 처리 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.')
  }

  const completeUpload = async () => {
    if (!certName || files.length === 0 || uploading) return
    setUploading(true)
    setError('')
    try {
      const uploaded = await uploadMaterial(files[0], `${certName} 학습 자료`)
      const materialId = uploaded.material_id
      await waitForMaterialReady(materialId)
      const placementQuiz = await createPlacementQuiz(materialId)
      setMaterialId(materialId)
      addCurrentCertificate(certName, { materialId, subtitle: '학습 준비 중' })
      onNavigate('placementIntro', { cert: certName, materialId, placementQuiz })
    } catch (err) {
      setError(err.message || '자료 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

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
        {error && <p className="addcert-error">{error}</p>}
      </div>

      <div className="cta-area">
        <button
          type="button"
          className="cta-button"
          disabled={files.length === 0 || uploading}
          onClick={completeUpload}
        >
          {uploading ? '자료 분석 중...' : '등록 완료'}
        </button>
      </div>
    </div>
  )
}

export default CertUpload

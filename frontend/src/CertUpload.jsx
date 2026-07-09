import { useState } from 'react'
import { addCurrentCertificate } from './api'
import { BackIcon, MedalIcon, UploadIcon, DocIcon } from './icons'
import './CertUpload.css'

function CertUpload({ certName, onNavigate }) {
  const [files, setFiles] = useState([])

  const addFiles = (fileList) => {
    if (!fileList) return
    const names = Array.from(fileList).map((f) => f.name)
    setFiles((prev) => [...prev, ...names.filter((n) => !prev.includes(n))])
  }

  const removeFile = (name) => {
    setFiles((prev) => prev.filter((n) => n !== name))
  }

  const completeUpload = () => {
    if (!certName || files.length === 0) return
    addCurrentCertificate(certName)
    onNavigate('placementIntro', { cert: certName })
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
          <p className="upload-dropzone-title">파일을 선택하거나 끌어다 놓으세요</p>
          <p className="upload-dropzone-sub">시험 접수증, 학습자료 등 (PDF, 이미지)</p>
          <input
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        {files.length > 0 && (
          <div className="upload-file-list">
            {files.map((name) => (
              <div className="upload-file-row" key={name}>
                <DocIcon size={16} />
                <span className="upload-file-name">{name}</span>
                <button
                  type="button"
                  className="upload-file-remove"
                  onClick={() => removeFile(name)}
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cta-area">
        <button
          type="button"
          className="cta-button"
          disabled={files.length === 0}
          onClick={completeUpload}
        >
          등록 완료
        </button>
      </div>
    </div>
  )
}

export default CertUpload

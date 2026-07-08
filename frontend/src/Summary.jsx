import { useEffect, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { SummaryIcon, DocIcon } from './icons'
import { getMaterial } from './api'
import './Summary.css'

const POLL_STATUSES = new Set(['pending', 'processing'])

// ai_summary는 "**소제목**" / "- 항목" 같은 마크다운 스타일 텍스트로 오므로
// 별도 라이브러리 없이 줄 단위로 소제목/리스트/문단만 구분해 렌더링한다.
function parseSummaryBlocks(text) {
  const blocks = []
  let list = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      list = null
      continue
    }
    const heading = line.match(/^\*\*(.+?)\*\*$/)
    if (heading) {
      list = null
      blocks.push({ type: 'heading', text: heading[1] })
      continue
    }
    if (line.startsWith('- ')) {
      if (!list) {
        list = { type: 'list', items: [] }
        blocks.push(list)
      }
      list.items.push(line.slice(2))
      continue
    }
    list = null
    blocks.push({ type: 'p', text: line })
  }
  return blocks
}

function SummaryBody({ text }) {
  return (
    <div className="summary-block">
      {parseSummaryBlocks(text).map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h4 className="summary-block-heading" key={i}>
              {block.text}
            </h4>
          )
        }
        if (block.type === 'list') {
          return (
            <ul className="summary-block-list" key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )
        }
        return (
          <p className="summary-block-p" key={i}>
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

function Summary({ onNavigate, materialId }) {
  const [material, setMaterial] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!materialId) return
    let cancelled = false
    let timer = null

    const load = () => {
      getMaterial(materialId)
        .then((data) => {
          if (cancelled) return
          setMaterial(data)
          setError(null)
          if (POLL_STATUSES.has(data.processed_status)) {
            timer = setTimeout(load, 4000)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err.message)
        })
    }
    load()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [materialId])

  return (
    <>
      <Header title="AI 요약" icon={<SummaryIcon />} onBack={() => onNavigate('library')} />

      <div className="body-scroll">
        {!materialId && <p className="summary-sub">도서관에서 자료를 먼저 선택해주세요.</p>}

        {materialId && (
          <div className="doc-row">
            <DocIcon />
            <span>{material?.title || '불러오는 중...'}</span>
          </div>
        )}

        {error && <p className="material-upload-error">{error}</p>}

        {materialId && !error && material?.processed_status && POLL_STATUSES.has(material.processed_status) && (
          <div>
            <h1 className="summary-heading">AI가 요약을 만들고 있어요</h1>
            <p className="summary-sub">잠시만 기다려주세요. 자동으로 갱신됩니다.</p>
          </div>
        )}

        {material?.processed_status === 'failed' && (
          <div>
            <h1 className="summary-heading">요약 생성에 실패했어요</h1>
            <p className="summary-sub">{material.processing_error || '알 수 없는 오류가 발생했습니다.'}</p>
          </div>
        )}

        {material?.processed_status === 'ready' && (
          <>
            <div>
              <h1 className="summary-heading">핵심 개념 {material.key_concepts?.length ?? 0}가지를 정리했어요</h1>
              <p className="summary-sub">업로드한 자료에서 자동으로 추출했어요</p>
            </div>

            {material.ai_summary && (
              <div className="summary-section">
                <p className="summary-section-label">전체 요약</p>
                <SummaryBody text={material.ai_summary} />
              </div>
            )}

            <div className="summary-section">
              <p className="summary-section-label">핵심 개념</p>
              <div className="bullet-list">
                {(material.key_concepts || []).map((c, i) => (
                  <div className="bullet-card" key={i}>
                    <div className="bullet-num">{i + 1}</div>
                    <div>
                      <div className="bullet-term">{c.concept}</div>
                      <div className="bullet-desc">{c.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <BottomNav active="summary" onNavigate={onNavigate} />
    </>
  )
}

export default Summary

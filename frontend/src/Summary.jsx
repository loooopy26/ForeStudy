import { useEffect, useState } from 'react'
import Header from './Header'
import BottomNav from './BottomNav'
import { SummaryIcon, DocIcon } from './icons'
import { getMaterial } from './api'
import './Summary.css'

const POLL_STATUSES = new Set(['pending', 'processing'])

// ai_summary는 "### 제목" / "**소제목**" / "**굵게** 섞인 문장" / "- 항목" / "1. 항목" /
// "---" 구분선 같은 마크다운 스타일 텍스트로 오므로, 별도 라이브러리 없이
// 줄 단위로 제목 레벨/리스트/구분선/문단을 구분하고 문장 내 **굵게**만 인라인 처리한다.
function parseSummaryBlocks(text) {
  const blocks = []
  let list = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      list = null
      continue
    }
    if (/^-{3,}$/.test(line)) {
      list = null
      blocks.push({ type: 'hr' })
      continue
    }
    const mdHeading = line.match(/^(#{1,6})\s+(.*)$/)
    if (mdHeading) {
      list = null
      blocks.push({ type: 'heading', level: mdHeading[1].length, text: mdHeading[2] })
      continue
    }
    const boldLineHeading = line.match(/^\*\*(.+?)\*\*$/)
    if (boldLineHeading) {
      list = null
      blocks.push({ type: 'heading', level: 3, text: boldLineHeading[1] })
      continue
    }
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      if (!list || list.ordered) {
        list = { type: 'list', ordered: false, items: [] }
        blocks.push(list)
      }
      list.items.push(bullet[1])
      continue
    }
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (numbered) {
      if (!list || !list.ordered) {
        list = { type: 'list', ordered: true, items: [] }
        blocks.push(list)
      }
      list.items.push(numbered[1])
      continue
    }
    list = null
    blocks.push({ type: 'p', text: line })
  }
  return blocks
}

// "**굵게**"만 <strong>으로 바꾸고 나머지는 그대로 둔다.
function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/)
    return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{part}</span>
  })
}

function SummaryBody({ text }) {
  return (
    <div className="summary-block">
      {parseSummaryBlocks(text).map((block, i) => {
        if (block.type === 'hr') {
          return <hr className="summary-block-hr" key={i} />
        }
        if (block.type === 'heading') {
          const className = block.level <= 2 ? 'summary-block-heading-lg' : 'summary-block-heading'
          return (
            <p className={className} key={i}>
              {renderInline(block.text)}
            </p>
          )
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag className="summary-block-list" key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ListTag>
          )
        }
        return (
          <p className="summary-block-p" key={i}>
            {renderInline(block.text)}
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
                      <div className="bullet-term">{renderInline(c.concept)}</div>
                      <div className="bullet-desc">{renderInline(c.description)}</div>
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

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './MarkdownText.css'

const components = {
  table: ({ ...props }) => (
    <div className="markdown-table-wrap">
      <table {...props} />
    </div>
  ),
}

function MarkdownText({ children, className }) {
  // className(예: goal-suggested-text)과 markdown-text를 같은 엘리먼트에 같이 걸면
  // font-size/line-height/color를 두 클래스가 동일 우선순위로 경합하게 되어(css 로드
  // 순서에 따라 결과가 흔들림) markdown-text 쪽 "inherit"이 뜻하지 않게 이겨버릴 수
  // 있다. className은 바깥 래퍼에, markdown-text는 그 자식에 둬서 진짜 부모→자식
  // 상속으로 안전하게 값을 물려받게 한다.
  return (
    <div className={className}>
      <div className="markdown-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {children || ''}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default MarkdownText

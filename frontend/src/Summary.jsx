import Header from './Header'
import BottomNav from './BottomNav'
import { SummaryIcon, DocIcon } from './icons'
import './Summary.css'

const BULLETS = [
  { n: 1, term: '기본 키 (Primary Key)', desc: '테이블의 각 행을 고유하게 식별하는 값으로 중복과 NULL을 허용하지 않습니다.' },
  { n: 2, term: '외래 키 (Foreign Key)', desc: '다른 테이블의 기본 키를 참조하여 테이블 간 관계를 연결합니다.' },
  { n: 3, term: '정규화 (Normalization)', desc: '데이터 중복을 줄이고 무결성을 높이기 위해 테이블 구조를 정리하는 과정입니다.' },
  { n: 4, term: '트랜잭션 (Transaction)', desc: '하나의 작업 단위로 묶여 모두 성공하거나 모두 취소되는 연산 묶음입니다.' },
  { n: 5, term: '인덱스 (Index)', desc: '검색 속도를 높이기 위해 별도로 관리하는 자료구조입니다.' },
]

function Summary({ onNavigate }) {
  return (
    <>
      <Header title="AI 요약" icon={<SummaryIcon />} onBack={() => onNavigate('library')} />

      <div className="body-scroll">
        <div className="doc-row">
          <DocIcon />
          <span>데이터베이스 개념 복습.pdf</span>
        </div>

        <div>
          <h1 className="summary-heading">핵심 개념 5가지를 정리했어요</h1>
          <p className="summary-sub">업로드한 자료에서 자동으로 추출했어요</p>
        </div>

        <div className="bullet-list">
          {BULLETS.map((b) => (
            <div className="bullet-card" key={b.n}>
              <div className="bullet-num">{b.n}</div>
              <div>
                <div className="bullet-term">{b.term}</div>
                <div className="bullet-desc">{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav active="summary" onNavigate={onNavigate} />
    </>
  )
}

export default Summary

import { ReviewIcon, SummaryIcon, QuizIcon, ChatIcon } from './icons'

const ITEMS = [
  { key: 'review', label: '복습하기', Icon: ReviewIcon },
  { key: 'summary', label: 'AI 요약', Icon: SummaryIcon },
  { key: 'quiz', label: 'AI 퀴즈', Icon: QuizIcon },
  { key: 'chat', label: 'AI 질문', Icon: ChatIcon },
]

function BottomNav({ active, onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="주요 기능">
      {ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          className={active === key ? 'active' : ''}
          onClick={() => onNavigate(key)}
        >
          <Icon size={24} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}

export default BottomNav

import { useState } from 'react'
import { SearchIcon } from './icons'
import camp from './assets/dotori-join-cert.webp'
import books from './assets/dotori-join-exam.webp'
import laptop from './assets/dotori-join-project.webp'
import checklist from './assets/dotori-join-other.webp'
import joinAction from './assets/dotori-join-action.webp'
import membersIcon from './assets/dotori-create-members.webp'

const CATEGORIES = {
  cert: { label: '자격증', image: camp },
  exam: { label: '시험공부', image: books },
  project: { label: '프로젝트', image: laptop },
  other: { label: '기타', image: checklist },
}

export default function DotoriJoinList({ rooms, onJoin, error }) {
  const [query, setQuery] = useState('')
  const words = query.toLocaleLowerCase('ko-KR').replaceAll('#', '').trim().split(/\s+/).filter(Boolean)
  const matchingRooms = rooms.filter((room) => {
    const roomCategory = room.category ?? 'other'
    const keywords = [room.name, CATEGORIES[roomCategory]?.label, ...(room.tags ?? []), room.goalText]
      .join(' ').toLocaleLowerCase('ko-KR')
    return words.every((word) => keywords.includes(word))
  })

  return (
    <div className="league-scroll league-join-list">
      <div className="league-join-search">
        <SearchIcon size={21} />
        <input type="search" aria-label="방 이름이나 키워드로 검색하기" placeholder="방 이름이나 키워드로 검색하기" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {error && <p className="league-error" role="alert">{error}</p>}
      <div className="league-join-results">
        {matchingRooms.map((room) => {
          const full = room.members.length >= room.limit
          const art = CATEGORIES[room.category]?.image ?? checklist
          return (
            <button key={room.id} type="button" className="league-join-card" onClick={() => onJoin(room.id)} disabled={full}>
              <img className="league-join-thumb" src={art} alt="" />
              <span className="league-join-card-copy">
                <strong>{room.name}</strong>
                {!!room.tags?.length && <span className="league-join-tags">
                  {room.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                </span>}
                <span className="league-join-count"><img src={membersIcon} alt="참여 인원" /> {room.members.length} / {room.limit}</span>
              </span>
              {full ? <span className="league-join-full">정원 마감</span> : <img className="league-join-action" src={joinAction} alt="참여하기" />}
            </button>
          )
        })}
        {matchingRooms.length === 0 && (
          <p className="league-panel league-join-empty" role="status">
            {rooms.length ? '조건에 맞는 방이 없어요.' : '참여할 수 있는 방이 없어요.'}
          </p>
        )}
      </div>
    </div>
  )
}

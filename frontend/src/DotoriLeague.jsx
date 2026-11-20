import { useState } from 'react'
import { getCurrentUser } from './api'
import { BackIcon, BellIcon, ChevronRightIcon } from './icons'
import DotoriJoinList from './DotoriJoinList'
import Header from './Header'
import MainNav from './MainNav'
import QuestHeader from './QuestHeader'
import createButton from './assets/dotori-lobby-create.webp'
import joinButton from './assets/dotori-lobby-join.webp'
import joinBanner from './assets/dotori-join-banner.webp'
import controller from './assets/dotori-lobby-controller.webp'
import tent from './assets/dotori-lobby-tent.webp'
import roomNameIcon from './assets/dotori-create-name.webp'
import goalIcon from './assets/dotori-create-goal.webp'
import periodIcon from './assets/dotori-create-period.webp'
import membersIcon from './assets/dotori-create-members.webp'
import createRoomButton from './assets/dotori-create-button.webp'
import goldSquirrel from './assets/dotori-rank-gold.webp'
import silverSquirrel from './assets/dotori-rank-silver.webp'
import bronzeSquirrel from './assets/dotori-rank-bronze.webp'
import roomMemberCat from './assets/dotori-rank-member-cat.webp'
import rankingCrown from './assets/dotori-rank-crown.webp'
import squirrel from './assets/icon-squirrel-reading.png'
import squirrelAcorn from './assets/icon-squirrel-acorn.png'
import squirrelPoint from './assets/icon-squirrel-point.png'
import mascot from './assets/cert-mascot.png'
import './DotoriLeague.css'

const GOAL_UNITS = { hours: '시간', quizzes: '문제' }
const BROWSE_SAMPLE_ROOMS = [
  {
    id: 'study-cert', name: '정보처리기사 스터디', category: 'cert', limit: 6,
    tags: ['정보처리기사', '필기', '스터디'], names: ['다인', '수경', '성진', '현주'],
  },
  {
    id: 'study-exam', name: '운영체제 같이 공부해요!', category: 'exam', limit: 5,
    tags: ['운영체제', '중간고사', '전공'], names: ['유진', '민서', '지우'],
  },
  {
    id: 'study-project', name: '졸업 프로젝트 팀 모집', category: 'project', limit: 4,
    tags: ['프로젝트', '웹개발', '팀원모집'], names: ['서연', '지호'],
  },
].map(({ names, ...room }) => ({
  ...room,
  joined: false,
  visibility: 'public',
  goal: 'hours',
  target: 20,
  weeks: 1,
  progress: 0,
  members: names.map((name, index) => ({ name, level: 4 - index, xp: (4 - index) * 300, totalXp: (4 - index) * 600, art: index })),
  activity: [],
}))
const SAMPLE_ROOMS = [
  {
    id: 'exam', name: '정보처리기사 도전방', joined: true, limit: 6, goal: 'hours', target: 20, weeks: 1, progress: 12,
    members: [
      { name: '다인', level: 6, xp: 3200, totalXp: 7800, art: 0 },
      { name: '수경', level: 5, xp: 2840, totalXp: 8100, art: 1 },
      { name: '성진', level: 5, xp: 2500, totalXp: 6100, art: 2 },
      { name: '현주', level: 4, xp: 1980, totalXp: 4200, art: 3 },
    ],
    activity: ['다인 님이 공부 시간 2시간을 기록했어요.', '수경 님이 이번 주 목표에 참여했어요.'],
  },
  ...BROWSE_SAMPLE_ROOMS,
  {
    id: 'morning', name: '아침 도토리 스터디', joined: false, limit: 4, goal: 'hours', target: 10, weeks: 1, progress: 3,
    category: 'other', tags: ['아침공부', '습관', '스터디'],
    members: [
      { name: '유진', level: 4, xp: 1100, totalXp: 3340, art: 1 },
      { name: '민서', level: 3, xp: 900, totalXp: 2100, art: 2 },
    ],
    activity: ['유진 님이 공부 시간 3시간을 기록했어요.'],
  },
]
const AVATARS = [squirrelAcorn, mascot, squirrelPoint, squirrel]
const PODIUM_ART = [goldSquirrel, silverSquirrel, bronzeSquirrel]
const NUMBERS = new Intl.NumberFormat('ko-KR')

function readRooms(key) {
  try {
    const rooms = JSON.parse(localStorage.getItem(key))
    if (Array.isArray(rooms)) {
      const savedIds = new Set(rooms.map((room) => room.id))
      return [...BROWSE_SAMPLE_ROOMS.filter((room) => !savedIds.has(room.id)), ...rooms]
    }
  } catch {
    // The lobby remains available when browser storage is unavailable.
  }
  return SAMPLE_ROOMS
}

function LeagueHeader({ title, onBack }) {
  return (
    <header className="league-header">
      <button type="button" className="league-icon-button" onClick={onBack} aria-label="뒤로 가기"><BackIcon /></button>
      <h1>{title}</h1>
    </header>
  )
}

function Members({ room, memberIcon }) {
  const visibleMembers = memberIcon ? room.members : room.members.slice(0, 4)
  return (
    <span className={memberIcon ? 'league-members league-members-all' : 'league-members'} role="img" aria-label={`참여 인원 ${room.members.length}/${room.limit}명`}>
      <span className="league-member-faces" aria-hidden="true">
        {visibleMembers.map((member, index) => <img key={index} src={memberIcon ?? AVATARS[member.art]} alt="" />)}
      </span>
      <span aria-hidden="true">{room.members.length}/{room.limit}</span>
    </span>
  )
}

function RoomCard({ room, onClick }) {
  return (
    <button type="button" className="league-room-card" onClick={onClick}>
      <span className="league-room-thumb league-camp" aria-hidden="true" />
      <span className="league-room-card-copy"><strong>{room.name}</strong><Members room={room} /></span>
      <ChevronRightIcon size={19} />
    </button>
  )
}

function goalSummary(room) {
  if (room.goalText) return { label: room.goalText }

  const unit = GOAL_UNITS[room.goal]
  const percent = Math.min(100, Math.round(room.progress / room.target * 100))
  const period = room.weeks === 1 ? '이번 주' : `${room.weeks}주 동안`
  const action = room.goal === 'hours' ? '공부하기' : '풀기'

  return {
    label: `${period} ${room.target}${unit} ${action}`,
    progress: `${room.progress} / ${room.target}${unit} (${percent}%)`,
    percent,
  }
}

function FeaturedRoom({ room, onClick }) {
  const goal = goalSummary(room)
  const level = Math.round(room.members.reduce((total, member) => total + member.level, 0) / room.members.length)
  return (
    <button type="button" className="league-featured-room" onClick={onClick}>
      <span className="league-featured-info">
        <img className="league-featured-tent" src={tent} alt="" />
        <strong className="league-featured-title">{room.name}</strong>
        <Members room={room} memberIcon={roomMemberCat} />
        <span className="league-featured-level" title="방 멤버 평균 레벨">Lv.{level}</span>
      </span>
      <span className="league-featured-goal">{goal.label}</span>
      {goal.progress && <span className="league-featured-progress">
        <progress aria-hidden="true" value={goal.percent} max="100" />
        <span>{goal.progress}</span>
      </span>}
      <ChevronRightIcon size={18} />
    </button>
  )
}

function RoomPenalty({ room }) {
  const goal = goalSummary(room)
  return (
    <section className="league-panel league-penalty">
      <h2><img src={goalIcon} alt="" /> 꼴지의 벌칙</h2>
      <p>{room.goalText || '"시험 끝나고 밥 사기"'}</p>
      {goal.progress && <>
        <progress value={goal.percent} max="100" aria-label="목표 달성률" />
        <small>{goal.progress}</small>
      </>}
    </section>
  )
}

function RoomRanking({ room }) {
  const [period, setPeriod] = useState('xp')
  const sorted = [...room.members].sort((a, b) => b[period] - a[period])
  return (
    <section className="league-ranking">
      <div className="league-section-heading">
        <h2><img className="league-ranking-icon" src={rankingCrown} alt="" /> 방 랭킹</h2>
        <select aria-label="랭킹 기간" value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="xp">주간</option><option value="totalXp">전체</option>
        </select>
      </div>
      <ol className="league-podium">
        {sorted.slice(0, 3).map((member, index) => (
          <li key={index} className={`league-place place-${index + 1}`}>
            <img src={PODIUM_ART[index]} alt="" />
            <div>
              <span className="league-medal" aria-label={`${index + 1}위`}>{index + 1}</span>
              <strong>{member.name}</strong><small>Lv.{member.level}</small><span>{NUMBERS.format(member[period])} XP</span>
            </div>
          </li>
        ))}
      </ol>
      {sorted.slice(3).map((member, index) => (
        <div className="league-rank-row" key={index}>
          <span>{index + 4}</span>
          <span className="league-rank-name">
            {index > 0 && <img src={AVATARS[member.art]} alt="" />}
            <strong>{member.name}</strong>
          </span>
          <small className="league-chip">Lv.{member.level}</small><span>{NUMBERS.format(member[period])} XP</span>
        </div>
      ))}
    </section>
  )
}

function CreateRoom({ onBack, onCreate }) {
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = data.get('name').trim()
    const goalText = data.get('goalText').trim()
    if (!name) {
      setError('방 이름을 입력해 주세요.')
      return
    }
    if (!goalText) {
      setError('내기나 벌칙 내용을 입력해 주세요.')
      return
    }
    setError(onCreate({
      name,
      goalText,
      weeks: Number(data.get('weeks')),
      limit: Number(data.get('limit')),
      visibility: data.get('visibility'),
    }) || '')
  }

  return (
    <div className="league-scroll league-create-scroll">
      <div className="league-create-scene">
        <div className="league-create-hero">
          <Header
            title={<span role="heading" aria-level={1}>방 만들기</span>}
            onBack={onBack}
            icon={<span aria-hidden="true"><BellIcon size={22} /></span>}
          />
        </div>
        <form className="league-create-form" onSubmit={submit}>
          <label className="league-field"><span><img src={roomNameIcon} alt="" /> 방 이름</span><input name="name" placeholder="예) 정보처리기사 도전방" maxLength={30} required /></label>
          <label className="league-field"><span><img src={goalIcon} alt="" /> 벌칙 설정</span>
            <textarea name="goalText" rows={2} maxLength={120} placeholder="예) 기출 10문제 풀기 · 못 채우면 간식 준비" required />
          </label>
          <label className="league-field league-field-inline"><span id="league-weeks-label"><img src={periodIcon} alt="" /> 기간</span>
            <select name="weeks" aria-labelledby="league-weeks-label" defaultValue={1}><option value="1">1주 (이번 주)</option><option value="2">2주</option><option value="4">4주</option></select>
          </label>
          <label className="league-field league-field-inline"><span id="league-limit-label"><img src={membersIcon} alt="" /> 최대 인원</span>
            <select name="limit" aria-labelledby="league-limit-label" defaultValue={6}><option value="4">4명</option><option value="6">6명</option><option value="8">8명</option><option value="10">10명</option></select>
          </label>
          <fieldset className="league-visibility">
            <legend>방 공개 여부</legend>
            <div className="league-visibility-options">
              <label><input type="radio" name="visibility" value="public" defaultChecked /><span>공개</span></label>
              <label><input type="radio" name="visibility" value="private" /><span>비공개</span></label>
            </div>
          </fieldset>
          {error && <p className="league-error" role="alert">{error}</p>}
          <button type="submit" className="league-create-submit">
            <img src={createRoomButton} alt="방 만들기" width={700} height={176} />
          </button>
        </form>
      </div>
    </div>
  )
}

export default function DotoriLeague({ onNavigate }) {
  const user = getCurrentUser()
  const storageKey = `forestudy_dotori_league_${user?.id ?? 'guest'}`
  const [rooms, setRooms] = useState(() => readRooms(storageKey))
  const [view, setView] = useState('lobby')
  const [roomId, setRoomId] = useState(null)
  const [error, setError] = useState('')
  const room = rooms.find((entry) => entry.id === roomId)
  const joined = rooms.filter((entry) => entry.joined)
  const joinable = rooms.filter((entry) => !entry.joined && entry.visibility !== 'private')
  const featured = joined.at(-1)

  const openRoom = (entry) => {
    setRoomId(entry.id)
    setView('room')
  }

  const saveRooms = (nextRooms) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextRooms))
      setRooms(nextRooms)
      return ''
    } catch {
      return '방 정보를 저장할 수 없어요. 브라우저의 저장 공간을 확인해 주세요.'
    }
  }

  const currentMember = { name: user?.nickname || '나', level: user?.level ?? 1, xp: 0, totalXp: 0, art: 3 }
  const createRoom = (values) => {
    const entry = {
      ...values, id: crypto.getRandomValues(new Uint32Array(4)).join('-'), joined: true, members: [currentMember], activity: ['방이 만들어졌어요.'],
    }
    const issue = saveRooms([...readRooms(storageKey), entry])
    if (!issue) openRoom(entry)
    return issue
  }

  const joinRoom = (id) => {
    const latestRooms = readRooms(storageKey)
    const entry = latestRooms.find((item) => item.id === id)
    if (entry?.visibility === 'private' && !entry.joined) {
      setRooms(latestRooms)
      setError('비공개 방에는 참여할 수 없어요.')
      return
    }
    if (!entry || (!entry.joined && entry.members.length >= entry.limit)) {
      setRooms(latestRooms)
      setError('참여할 수 있는 자리가 없어요.')
      return
    }
    const updated = entry.joined ? entry : {
      ...entry, joined: true, members: [...entry.members, currentMember],
      activity: [`${currentMember.name} 님이 방에 참여했어요.`, ...entry.activity],
    }
    const issue = saveRooms(latestRooms.map((item) => item.id === id ? updated : item))
    setError(issue)
    if (!issue) openRoom(updated)
  }

  const openList = (list) => {
    setError('')
    setView(list)
  }

  return (
    <div className={`league-page league-${view}-page`}>
      {view === 'lobby' && <>
        <div className="league-scroll league-lobby">
          <section className="league-lobby-hero" aria-labelledby="league-lobby-title">
            <QuestHeader
              title="도토리그"
              titleId="league-lobby-title"
              level={user?.level ?? 1}
              acorns={user?.dotori ?? 0}
              onBack={() => onNavigate('village')}
              className="league-brand"
            />
            <p className="league-lobby-intro">친구들과 함께 목표를 정하고 공부하며 랭킹을 겨뤄보세요!</p>
          </section>
          <div className="league-lobby-actions">
            <button type="button" onClick={() => setView('create')}><img src={createButton} alt="방 만들기" /></button>
            <button type="button" onClick={() => openList('join')}><img src={joinButton} alt="방 참여하기" /></button>
          </div>
          <section className="league-joined">
            <div className="league-section-heading">
              <h2>참여 중인 방</h2>
              <button className="league-text-button" type="button" onClick={() => openList('joined')}>전체보기 <ChevronRightIcon size={13} /></button>
            </div>
            {featured ? <FeaturedRoom room={featured} onClick={() => openRoom(featured)} /> : <p className="league-lobby-empty">참여 중인 방이 없어요.</p>}
            <button type="button" className="league-game-shortcut" onClick={() => onNavigate('room')}>
              <img src={controller} alt="" />
              <span><strong>정답비 게임</strong><span>문제를 풀고 점수를 모아보세요!</span></span>
              <ChevronRightIcon size={18} />
            </button>
          </section>
        </div>
        <MainNav active="village" onNavigate={onNavigate} />
      </>}

      {view === 'create' && <CreateRoom onBack={() => setView('lobby')} onCreate={createRoom} />}

      {view === 'join' && <>
        <LeagueHeader title={<img src={joinBanner} alt="방 참여하기" width={650} height={271} />} onBack={() => setView('lobby')} />
        <DotoriJoinList rooms={joinable} onJoin={joinRoom} error={error} />
      </>}

      {view === 'joined' && <>
        <LeagueHeader title="참여 중인 방" onBack={() => setView('lobby')} />
        <div className="league-scroll league-list league-landscape-footer">
          {joined.map((entry) => (
            <RoomCard key={entry.id} room={entry} onClick={() => openRoom(entry)} />
          ))}
        </div>
      </>}

      {view === 'room' && room && <>
        <Header
          title={<span role="heading" aria-level={1}>랭킹</span>}
          onBack={() => setView('lobby')}
          icon={<span aria-hidden="true"><BellIcon size={22} /></span>}
        />
        <div className="league-scroll league-room">
          <div className="league-room-banner">
            <div><h2>{room.name}</h2><Members room={room} memberIcon={roomMemberCat} /></div>
          </div>
          <RoomRanking room={room} />
          <RoomPenalty room={room} />
        </div>
      </>}
    </div>
  )
}

import { useState, useEffect } from 'react'
import QuestPage from './QuestPage'
import AchievementPage from './AchievementPage'
import {
  claimReward,
  getClaimedRewards,
  getMyUser,
  getQuestEventConsecutiveDays,
  getQuestEventDayCountThisWeek,
  getQuestEventTotal,
  getQuestEventTotalThisWeek,
  loadQuestEvents,
} from './api'
import './questTheme.css'

// 퀘스트 게시판 + 업적/성장 화면의 상태·로직 묶음.
// (기존 로컬 App.jsx에서 phone 프레임 래퍼만 제거하고 그대로 옮김.
//  프레임은 상위 App.jsx의 .phone-frame이 제공한다.)

const initialQuests = [
  // Main
  { id: 'q1', type: 'main', title: '데이터베이스 개념 복습', duration: '40분', rewardExp: 150, rewardAcorns: 80, progress: 60, status: 'active', requiredLevel: 1 },
  { id: 'q2', type: 'main', title: '알고리즘 문제 3개 풀기', duration: '20분', rewardExp: 80, rewardAcorns: 40, progress: 0, status: 'idle', requiredLevel: 1 },
  { id: 'q3', type: 'main', title: '정규화 연습하기', duration: '30분', rewardExp: 120, rewardAcorns: 60, progress: 0, status: 'idle', requiredLevel: 15 },
  // Sub
  { id: 'q4', type: 'sub', title: '자격증 시험 신청 서류 준비', duration: '10분', rewardExp: 50, rewardAcorns: 20, progress: 0, status: 'idle', requiredLevel: 1 },
  { id: 'q5', type: 'sub', title: '네트워크 TCP/IP 복습', duration: '50분', rewardExp: 200, rewardAcorns: 100, progress: 0, status: 'idle', requiredLevel: 12 },
  // Bonus
  { id: 'q6', type: 'bonus', title: '하루 1시간 공부 달성', duration: '60분', rewardExp: 300, rewardAcorns: 150, progress: 0, status: 'idle', requiredLevel: 5 }
]

const initialAchievements = [
  { id: 'a1', title: '7일 연속 학습', description: '7일 연속으로 학습하기', current: 7, target: 7, claimed: true, rewardAcorns: 50, rarity: 'gold' },
  { id: 'a2', title: '첫 퀘스트 완료', description: '퀘스트 1회 완료하기', current: 0, target: 1, claimed: false, rewardAcorns: 50, rarity: 'gold' },
  { id: 'a3', title: '30일 연속 학습', description: '30일 연속으로 학습하기', current: 23, target: 30, claimed: false, rewardAcorns: 100, rarity: 'silver' },
  { id: 'a4', title: '첫 자격증 목표 설정', description: '자격증 목표를 설정하기', current: 1, target: 1, claimed: true, rewardAcorns: 50, rarity: 'silver' },
  { id: 'a5', title: '첫 AI 퀴즈 만점', description: 'AI 퀴즈에서 만점 받기', current: 0, target: 1, claimed: false, rewardAcorns: 150, rarity: 'bronze' }
]


const DAILY_QUESTS = [
  ['daily-timer', '오늘의 플랜 타이머 완료하기', '목표 시간', 40, 10],
  ['daily-quiz', '오늘 AI 퀴즈 1회 완료하기', '1회', 30, 10],
  ['daily-review', '오늘 오답노트 5개 숙지하기', '5개', 50, 20],
  ['daily-focus', '오늘 집중 학습 이어가기', '20분 연속', 30, 10],
]
const WEEKLY_QUESTS = [
  ['weekly-plan', '이번 주 일별 플랜 5회 완료하기', '5회', 150, 60],
  ['weekly-study', '이번 주 5일 학습하기', '5일', 130, 50],
  ['weekly-quiz', 'AI 퀴즈 5회 완료하기', '5회', 120, 40],
  ['weekly-review', '이번 주 오답노트 20개 숙지하기', '20개', 170, 70],
]
const BONUS_QUESTS = [
  ['bonus-marathon', '집중력 마라톤', '하루 누적 120분', 300, 200],
  ['bonus-weekly-plan', '주간 완주자', '이번 주 일별 플랜 7회', 500, 300],
  ['bonus-quiz-streak', '퀴즈 만점 도전', '5문제 연속 정답', 200, 150],
  ['bonus-attendance', '꾸준한 출석', '7일 연속 학습 기록', 400, 250],
  ['bonus-steady-study', '밤샘 대신 꾸준히', '3일 연속 하루 40분', 300, 200],
]

function pickThree(items, seed, type) {
  const start = seed % items.length
  return [0, 1, 2].map((offset) => {
    const [id, title, duration, rewardExp, rewardAcorns] = items[(start + offset) % items.length]
    return { id, type, title, duration, rewardExp, rewardAcorns, progress: 0, status: 'idle', requiredLevel: 1 }
  })
}

function pickTwo(items, seed, type) {
  const start = seed % items.length
  return [0, 1].map((offset) => {
    const [id, title, duration, rewardExp, rewardAcorns] = items[(start + offset) % items.length]
    return { id, type, title, duration, rewardExp, rewardAcorns, progress: 0, status: 'idle', requiredLevel: 1 }
  })
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getWeekKey(date = new Date()) {
  const monday = new Date(date)
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return getDateKey(monday)
}

function getQuestSchedule() {
  return { day: getDateKey(), week: getWeekKey() }
}

function hasValidQuestComposition(quests) {
  if (!Array.isArray(quests)) return false
  const dailyIds = new Set(DAILY_QUESTS.map(([id]) => id))
  const weeklyIds = new Set(WEEKLY_QUESTS.map(([id]) => id))
  const bonusIds = new Set(BONUS_QUESTS.map(([id]) => id))

  return quests.length === 8
    && quests.filter((quest) => quest.type === 'main').length === 3
    && quests.filter((quest) => quest.type === 'sub').length === 3
    && quests.filter((quest) => quest.type === 'bonus').length === 2
    && quests.every((quest) => (
      (dailyIds.has(quest.id) && quest.type === 'main')
      || (weeklyIds.has(quest.id) && quest.type === 'sub')
      || (bonusIds.has(quest.id) && quest.type === 'bonus')
    ))
}

function getGeneratedQuests() {
  const today = new Date()
  const daySeed = Number(`${today.getFullYear()}${today.getMonth() + 1}${today.getDate()}`)
  const weekSeed = Math.floor((today - new Date(today.getFullYear(), 0, 1)) / 604800000)
  return [
    ...pickThree(DAILY_QUESTS, daySeed, 'main'),
    ...pickThree(WEEKLY_QUESTS, weekSeed, 'sub'),
    ...pickTwo(BONUS_QUESTS, weekSeed, 'bonus'),
  ]
}

function ForestGame({ onNavigate, initialSub }) {
  const [level, setLevel] = useState(() => {
    const saved = localStorage.getItem('forestudy_level_v4')
    return saved ? parseInt(saved) : 12
  })
  const [exp, setExp] = useState(() => {
    const saved = localStorage.getItem('forestudy_exp_v4')
    return saved ? parseInt(saved) : 1240
  })
  const [acorns, setAcorns] = useState(() => {
    const saved = localStorage.getItem('forestudy_acorns_v4')
    return saved ? parseInt(saved) : 2450
  })
  const [quests, setQuests] = useState(() => {
    const saved = localStorage.getItem('forestudy_quests_v9')
    const savedSchedule = localStorage.getItem('forestudy_quest_schedule_v9')
    const schedule = getQuestSchedule()
    const generated = getGeneratedQuests()
    try {
      const parsedQuests = saved ? JSON.parse(saved) : null
      if (
        savedSchedule
        && JSON.stringify(JSON.parse(savedSchedule)) === JSON.stringify(schedule)
        && hasValidQuestComposition(parsedQuests)
      ) {
        return parsedQuests
      }
    } catch {
      // 손상된 이전 저장값은 이번 주/오늘 퀘스트로 안전하게 다시 생성한다.
    }
    return generated.length ? generated : initialQuests
  })
  const [achievements, setAchievements] = useState(() => {
    const saved = localStorage.getItem('forestudy_achievements_v4')
    return saved ? JSON.parse(saved) : initialAchievements
  })

  useEffect(() => {
    const syncAccountProgress = () => {
      getMyUser()
        .then((user) => {
          if (typeof user?.level === 'number') setLevel(user.level)
          if (typeof user?.current_xp === 'number') setExp(user.current_xp)
          if (typeof user?.dotori === 'number') setAcorns(user.dotori)
        })
        .catch(() => {})
    }
    syncAccountProgress()
    window.addEventListener('forestudy:user-updated', syncAccountProgress)
    return () => window.removeEventListener('forestudy:user-updated', syncAccountProgress)
  }, [])

  useEffect(() => {
    const syncQuestProgress = () => {
      const targets = {
        'daily-timer': [getQuestEventTotal('daily-timer'), 1],
        'daily-quiz': [getQuestEventTotal('daily-quiz'), 1],
        'daily-review': [getQuestEventTotal('daily-review'), 5],
        'daily-focus': [getQuestEventTotal('daily-focus'), 1],
        'weekly-plan': [getQuestEventTotalThisWeek('weekly-plan'), 5],
        'weekly-study': [getQuestEventDayCountThisWeek('bonus-study-minutes'), 5],
        'weekly-quiz': [getQuestEventTotalThisWeek('weekly-quiz'), 5],
        'weekly-review': [getQuestEventTotalThisWeek('weekly-review'), 20],
        'bonus-marathon': [getQuestEventTotal('bonus-study-minutes'), 120],
        'bonus-weekly-plan': [getQuestEventTotalThisWeek('weekly-plan'), 7],
        'bonus-quiz-streak': [getQuestEventTotalThisWeek('bonus-quiz-streak'), 1],
        'bonus-attendance': [getQuestEventConsecutiveDays('bonus-study-minutes', 1, 7), 7],
        'bonus-steady-study': [getQuestEventConsecutiveDays('bonus-study-minutes', 40, 3), 3],
      }
      setQuests((current) => current.map((quest) => {
        const [count, target] = targets[quest.id] || [0, 1]
        const progress = Math.min(100, Math.round(count / target * 100))
        return { ...quest, progress, status: progress >= 100 ? 'completed' : 'active' }
      }))
    }
    syncQuestProgress()
    window.addEventListener('forestudy:quest-events', syncQuestProgress)
    return () => window.removeEventListener('forestudy:quest-events', syncQuestProgress)
  }, [])

  // 로그인 계정 기준 이벤트 로그를 백엔드에서 불러온다 — 로드가 끝나면 위 syncQuestProgress가
  // 'forestudy:quest-events' 이벤트를 받아 진행률을 다시 계산한다.
  useEffect(() => {
    loadQuestEvents()
  }, [])

  // 이미 보상을 받은 퀘스트/업적은 다른 기기에서도 다시 받을 수 없어야 한다 — 계정 기준으로
  // 확인해 로컬 상태(quests/achievements)의 claimed 플래그를 백엔드 진실과 맞춘다.
  useEffect(() => {
    getClaimedRewards([getDateKey(), getWeekKey(), 'lifetime']).then((claimedIds) => {
      if (!claimedIds.length) return
      const claimedSet = new Set(claimedIds)
      setQuests((current) => current.map((quest) => (
        claimedSet.has(quest.id) ? { ...quest, claimed: true } : quest
      )))
      setAchievements((current) => current.map((ach) => (
        claimedSet.has(ach.id) ? { ...ach, claimed: true } : ach
      )))
    }).catch(() => {})
  }, [])

  // 'quests' | 'achievements' — 게시판 내부 화면 전환
  const [sub, setSub] = useState(initialSub === 'achievements' ? 'achievements' : 'quests')

  // Persist state in localStorage
  useEffect(() => {
    localStorage.setItem('forestudy_level_v4', level)
    localStorage.setItem('forestudy_exp_v4', exp)
    localStorage.setItem('forestudy_acorns_v4', acorns)
    localStorage.setItem('forestudy_quests_v9', JSON.stringify(quests))
    localStorage.setItem('forestudy_quest_schedule_v9', JSON.stringify(getQuestSchedule()))
    localStorage.setItem('forestudy_achievements_v4', JSON.stringify(achievements))
  }, [level, exp, acorns, quests, achievements])

  // 'quests'/'achievements'는 내부 전환, 그 외 키('library' 등)는 상위 앱으로 나감
  const handleNavigate = (screen) => {
    if (screen === 'quests' || screen === 'achievements') {
      setSub(screen)
    } else {
      onNavigate(screen)
    }
  }

  const handleRemoveQuest = (id) => {
    setQuests(prev => prev.filter(q => q.id !== id))
  }

  const handleClaimQuest = async (id) => {
    const quest = quests.find((item) => item.id === id)
    if (!quest || quest.claimed) return
    // 일별 퀘스트는 오늘 날짜, 주간/보너스 퀘스트는 이번 주 시작일을 기준으로 중복 수령을 막는다.
    const periodKey = quest.type === 'main' ? getDateKey() : getWeekKey()
    try {
      const user = await claimReward(quest.id, periodKey, quest.rewardExp, quest.rewardAcorns)
      setLevel(user.level)
      setExp(user.current_xp)
      setAcorns(user.dotori)
      setQuests((current) => current.map((item) => item.id === id ? { ...item, claimed: true } : item))
    } catch (error) {
      window.alert(error.message)
    }
  }

  const handleClaimReward = async (id) => {
    const ach = achievements.find(a => a.id === id)
    if (!ach || ach.claimed) return
    try {
      // 업적은 하루/주 단위로 반복되지 않으므로 고정 period_key로 평생 한 번만 받을 수 있다.
      const user = await claimReward(ach.id, 'lifetime', 0, ach.rewardAcorns)
      setAcorns(user.dotori)
      setAchievements(prev => prev.map(a =>
        a.id === id ? { ...a, claimed: true } : a
      ))
    } catch (error) {
      window.alert(error.message)
    }
  }

  if (sub === 'achievements') {
    return (
      <AchievementPage
        achievements={achievements}
        level={level}
        acorns={acorns}
        onClaimReward={handleClaimReward}
        onNavigate={handleNavigate}
      />
    )
  }

  return (
    <QuestPage
      quests={quests}
      level={level}
      acorns={acorns}
      onRemoveQuest={handleRemoveQuest}
      onClaimQuest={handleClaimQuest}
      onNavigate={handleNavigate}
    />
  )
}

export default ForestGame

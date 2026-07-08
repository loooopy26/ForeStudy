import { useState, useEffect } from 'react'
import QuestPage from './pages/QuestPage'
import AchievementPage from './pages/AchievementPage'
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
    const saved = localStorage.getItem('forestudy_quests_v4')
    return saved ? JSON.parse(saved) : initialQuests
  })
  const [achievements, setAchievements] = useState(() => {
    const saved = localStorage.getItem('forestudy_achievements_v4')
    return saved ? JSON.parse(saved) : initialAchievements
  })

  // 'quests' | 'achievements' — 게시판 내부 화면 전환
  const [sub, setSub] = useState(initialSub === 'achievements' ? 'achievements' : 'quests')

  // Persist state in localStorage
  useEffect(() => {
    localStorage.setItem('forestudy_level_v4', level)
    localStorage.setItem('forestudy_exp_v4', exp)
    localStorage.setItem('forestudy_acorns_v4', acorns)
    localStorage.setItem('forestudy_quests_v4', JSON.stringify(quests))
    localStorage.setItem('forestudy_achievements_v4', JSON.stringify(achievements))
  }, [level, exp, acorns, quests, achievements])

  // Background Timer Simulation to auto-fill the active quest
  useEffect(() => {
    const hasActiveQuest = quests.some(q => q.status === 'active')
    if (!hasActiveQuest) return

    const interval = setInterval(() => {
      setQuests(prevQuests => {
        const activeIdx = prevQuests.findIndex(q => q.status === 'active')
        if (activeIdx === -1) return prevQuests

        const quest = prevQuests[activeIdx]
        const nextProgress = Math.min(100, quest.progress + 10)
        const updatedQuests = [...prevQuests]

        if (nextProgress >= 100) {
          updatedQuests[activeIdx] = { ...quest, progress: 100, status: 'completed' }

          setLevel(prevLvl => {
            const nextLvlExp = prevLvl * 500 + 500
            let newExp = exp + quest.rewardExp
            let newLvl = prevLvl
            let currentLimit = nextLvlExp

            while (newExp >= currentLimit) {
              newExp -= currentLimit
              newLvl += 1
              currentLimit = newLvl * 500 + 500
            }
            setExp(newExp)
            return newLvl
          })

          setAcorns(prev => prev + quest.rewardAcorns)

          setAchievements(prevAch => prevAch.map(ach => {
            if (ach.id === 'a2' && ach.current < ach.target) {
              return { ...ach, current: 1, claimed: false }
            }
            if (ach.id === 'a3' && ach.current < ach.target) {
              return { ...ach, current: Math.min(ach.target, ach.current + 1) }
            }
            return ach
          }))
        } else {
          updatedQuests[activeIdx] = { ...quest, progress: nextProgress }
        }

        return updatedQuests
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [quests, exp, level])

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

  const handleClaimReward = (id) => {
    const ach = achievements.find(a => a.id === id)
    if (!ach || ach.claimed) return
    setAcorns(prev => prev + ach.rewardAcorns)
    setAchievements(prev => prev.map(a =>
      a.id === id ? { ...a, claimed: true } : a
    ))
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
      onNavigate={handleNavigate}
    />
  )
}

export default ForestGame

import { useState } from 'react';
import { AcornIcon } from './icons';
import './AchievementPage.css';
import badgeBird1 from './assets/badge-bird-1.png';
import badgeBird2 from './assets/badge-bird-2.png';
import badgeBird3 from './assets/badge-bird-3.png';
import badgeBird4 from './assets/badge-bird-4.png';
import badgeBird5 from './assets/badge-bird-5.png';
import badgeBird6 from './assets/badge-bird-6.png';

const BADGE_BIRDS = [badgeBird1, badgeBird2, badgeBird3, badgeBird4, badgeBird5, badgeBird6];

export default function AchievementPage({
  achievements,
  level,
  acorns,
  onClaimReward,
  onNavigate
}) {
  // 업적별 배지 캐릭터를 6종 새 중에서 무작위로 뽑아 고정한다.
  // 보상을 받아도(=achievements 갱신) 다시 섞이지 않도록 마운트 시 한 번만 계산한다.
  const [badgeByAchievementId] = useState(() => {
    const map = {};
    achievements.forEach((ach) => {
      map[ach.id] = BADGE_BIRDS[Math.floor(Math.random() * BADGE_BIRDS.length)];
    });
    return map;
  });

  return (
    <div className="achievement-page">
      {/* Header */}
      <div className="achievement-header">
        <button className="header-icon-btn" onClick={() => onNavigate('quests')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8272" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"></path>
          </svg>
        </button>
        <span className="header-title">업적</span>
        
        {/* Top Header HUD */}
        <div className="header-hud">
          <span className="hud-lvl">Lv.{level}</span>
          <div className="hud-acorn">
            <AcornIcon size={14} />
            <span>{acorns.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Achievement List */}
      <div className="achievement-list">
        {achievements.filter((ach) => !(ach.current >= ach.target && ach.claimed)).map((ach) => {
          const isComplete = ach.current >= ach.target;
          const progressPercent = Math.min(100, (ach.current / ach.target) * 100);
          const badgeImg = badgeByAchievementId[ach.id];

          return (
            <div className="achievement-card" key={ach.id}>
              {/* Left Badge Icon */}
              <div className="badge-icon-container">
                <img src={badgeImg} style={{width: 50, height: 50, objectFit: 'contain'}} alt="Badge" />
              </div>

              {/* Right Content Area containing 3 stacked rows */}
              <div className="achievement-content-col">
                {/* Row 1: Title (left) & Counter (right) */}
                <div className="ach-row ach-top-row">
                  <span className="achievement-title">{ach.title}</span>
                  <span className="achievement-counter">{ach.current} / {ach.target}</span>
                </div>

                {/* Row 2: Description */}
                <div className="ach-row ach-middle-row">
                  <span className="achievement-desc">{ach.description}</span>
                </div>

                {/* Row 3: Yellow Progress Bar (left) & Reward / Action / Status (right) */}
                <div className="ach-row ach-bottom-row">
                  <div className="ach-progress-container">
                    <div 
                      className="ach-progress-fill" 
                      style={{ 
                        width: `${progressPercent}%`,
                        backgroundColor: isComplete ? '#f0c04a' : '#e59866'
                      }} 
                    />
                  </div>

                  <div className="achievement-status-icon-container">
                    {isComplete ? (
                      ach.claimed ? (
                        <span className="achievement-status-text done">완료</span>
                      ) : (
                        <button className="claim-btn animate-bounce-mini" onClick={() => onClaimReward(ach.id)}>
                          받기
                        </button>
                      )
                    ) : (
                      <div className="diamond-reward">
                        <AcornIcon size={18} />
                        <span className="diamond-val">{ach.rewardAcorns}</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

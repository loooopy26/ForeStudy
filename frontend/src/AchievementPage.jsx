import { AcornIcon } from './icons';
import './AchievementPage.css';

export default function AchievementPage({
  achievements,
  level,
  acorns,
  onClaimReward,
  onNavigate
}) {
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
        {achievements.map((ach) => {
          const isComplete = ach.current >= ach.target;
          const progressPercent = Math.min(100, (ach.current / ach.target) * 100);

          // Get image badges dynamically matching the original designs
          let badgeImg;
          if (ach.rarity === 'gold') {
            badgeImg = '/assets/dc668548-0e0f-4407-beeb-d5dd32159d6f.png';
          } else if (ach.rarity === 'silver') {
            if (ach.id === 'a4') {
              badgeImg = '/assets/2054e68c-f22a-47cb-b33c-e3c0698055c5.png';
            } else {
              badgeImg = '/assets/c4039063-4f17-4fd8-a3c1-b94dc67a4d80.png';
            }
          } else {
            badgeImg = '/assets/c4039063-4f17-4fd8-a3c1-b94dc67a4d80.png';
          }

          return (
            <div className="achievement-card" key={ach.id}>
              {/* Left Badge Icon */}
              <div className="badge-icon-container">
                <img src={badgeImg} style={{width: 60, height: 60, objectFit: 'contain'}} alt="Badge" />
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

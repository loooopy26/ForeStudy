import { useState } from 'react';
import './QuestPage.css';

export default function QuestPage({
  quests,
  level,
  acorns,
  onRemoveQuest,
  onNavigate
}) {
  const [activeTab, setActiveTab] = useState('main'); // 'main' | 'sub' | 'bonus'

  const filteredQuests = quests.filter(q => q.type === activeTab);

  return (
    <div className="quest-page">
      {/* Header */}
      <div className="quest-header">
        <button className="header-icon-btn" onClick={() => onNavigate('library')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8a8272" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"></path>
          </svg>
        </button>
        <span className="header-title">퀘스트 게시판</span>
        
        {/* Top Header HUD replacing the old grid button */}
        <div className="header-hud">
          <span className="hud-lvl">Lv.{level}</span>
          <div className="hud-acorn">
            <img src="/assets/49a4f4c0-9e41-4b7a-8208-231dedd5cc8a.png" style={{width: 14, height: 14}} alt="Acorn" />
            <span>{acorns.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="quest-tabs">
        <span 
          className={`tab-item ${activeTab === 'main' ? 'active' : ''}`}
          onClick={() => setActiveTab('main')}
        >
          메인
        </span>
        <span 
          className={`tab-item ${activeTab === 'sub' ? 'active' : ''}`}
          onClick={() => setActiveTab('sub')}
        >
          서브
        </span>
        <span 
          className={`tab-item ${activeTab === 'bonus' ? 'active' : ''}`}
          onClick={() => setActiveTab('bonus')}
        >
          보너스
        </span>
        <span className="tab-item" onClick={() => onNavigate('achievements')}>
          업적
        </span>
      </div>

      {/* Quest Cards Container */}
      <div className="quest-list">
        {filteredQuests.map((q) => {
          const isLocked = level < q.requiredLevel;

          if (isLocked) {
            return (
                  <div className="quest-card locked" key={q.id}>
                    <button className="quest-delete-btn" onClick={() => onRemoveQuest(q.id)}>×</button>
                <div className="quest-card-content">
                  {/* Original Lock Icon */}
                  <div className="quest-icon-container">
                    <img src="/assets/5888ea68-17f9-4380-b951-113d83508301.png" style={{width: 42, height: 42, objectFit: 'contain', filter: 'grayscale(0.4)'}} alt="Lock" />
                  </div>
                  
                  <div className="quest-details">
                    <div className="quest-title-row">
                      <span className="quest-title locked-text">{q.title}</span>
                    </div>
                    <div className="quest-time">⏱ {q.duration}</div>
                  </div>
                </div>
                
                <div className="lock-badge-container">
                  <span className="lock-badge">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: 4, marginBottom: -1}}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Lv.{q.requiredLevel} 잠금 해제
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div className="quest-card" key={q.id}>
              {q.status !== 'active' && q.status !== 'completed' && (
                <button className="quest-delete-btn" onClick={() => onRemoveQuest(q.id)}>×</button>
              )}
              
              <div className="quest-card-content">
                {/* Original Chest Icon */}
                <div className="quest-icon-container">
                  <img src="/assets/be53a89e-21d1-4e35-8584-c3a25ab59141.png" style={{width: 46, height: 46, objectFit: 'contain'}} alt="Chest" />
                </div>
                
                <div className="quest-details">
                  <div className="quest-title-row">
                    <span className="quest-title">{q.title}</span>
                    {q.status === 'active' && <span className="status-badge running">진행 중</span>}
                    {q.status === 'completed' && <span className="status-badge done-badge">완료됨</span>}
                  </div>
                  <div className="quest-time">⏱ {q.duration}</div>
                </div>
              </div>
              
              <div className="quest-rewards">
                <span className="exp-lbl">EXP {q.rewardExp}</span>
                <span className="acorn-lbl">
                  <img src="/assets/49a4f4c0-9e41-4b7a-8208-231dedd5cc8a.png" style={{width: 15, height: 15, objectFit: 'contain', marginRight: 4}} alt="Acorn" />
                  도토리 {q.rewardAcorns}
                </span>
              </div>

              {/* Progress Bar (Always visible for unlocked quests) */}
              <div className="quest-progress-section">
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${q.progress}%` }} />
                </div>
                <span className="progress-value">{q.progress} %</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

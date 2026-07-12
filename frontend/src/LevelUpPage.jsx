// 레벨 업 축하 화면: 레벨이 오를 때(예: Lv.11 → Lv.12) 보여주는 페이지.
// 박스(카드) 없이, 요소들이 아래에서 위로 하나씩 천천히 떠오르며 등장한다.
//
// 사용자 지정 타임라인:
//   1) "축하해요! 레벨 업!" 문구 등장
//   2) +2초 뒤 고양이 등장 → 잠깐 가만히 있다가 → 손 흔드는 모션을 계속(무한) 반복
//   3) 그 다음(고양이가 흔들기 시작한 직후) XP 게이지 + 레벨 업(Lv.11→Lv.12) 모션
//   4) 그 모션이 끝나고 +1.5초 뒤 보상(도토리) 등장
//   5) +3초 뒤 계속하기 버튼 등장
// XP 게이지가 채워지는 시간은 획득 경험치량에 따라 유동적으로 조절된다.
import { getItem, useGoods } from './goods'
import CharacterAvatar from './CharacterAvatar'
import { CoinIcon } from './GoodsArt'
import './LevelUp.css'

function StarIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#f0c04a" stroke="#d9a832" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5 14.9 8.6 21.5 9.5 16.7 14.1 17.9 20.7 12 17.5 6.1 20.7 7.3 14.1 2.5 9.5 9.1 8.6 Z" />
    </svg>
  )
}

// 기본값은 현재 홈 화면의 정보를 그대로 반영한다(Lv.12 / 성실한 학습자 / XP 1,240 / 2,000).
// gained = 이번에 획득한 경험치(게이지 모션 길이 산정용). 실제 연동 시 payload로 넘기면 된다.
const DEFAULTS = { from: 11, to: 12, xpCurrent: 1240, xpMax: 2000, gained: 1240, reward: 50, title: '성실한 학습자' }

// 고양이 등장~인사 시작까지의 고정 비트(초). CAT_RISE_DUR은 .levelup-item의 rise
// 애니메이션 길이(LevelUp.css)와 동일해야 "다 떠오른 뒤" 타이밍이 맞는다.
const HEAD_DELAY = 0
const CAT_DELAY = 1.2 // "1.2초 뒤에 고양이가" 등장
const CAT_RISE_DUR = 0.85
const STILL_HOLD = 0.35 // 등장 후 "가만히 있다가"
const WAVE_START = CAT_DELAY + CAT_RISE_DUR + STILL_HOLD // 이후로는 계속 손을 흔든다(무한 반복)
const TITLE_DELAY = CAT_DELAY + 0.2

function LevelUpPage({ onNavigate, levelUp = DEFAULTS }) {
  const { equipped } = useGoods()
  const { from, to, xpCurrent, xpMax, gained, reward, title } = { ...DEFAULTS, ...levelUp }

  const xpPercent = Math.min(100, Math.round((xpCurrent / xpMax) * 100))
  // 획득 경험치가 많을수록 게이지가 더 길게(천천히) 채워진다.
  const ratio = Math.min(1, Math.max(0, gained / xpMax))
  const durNum = 1.15 + ratio * 3.0 // 1.15s ~ 4.15s
  const xpDuration = durNum.toFixed(2)

  // "그 다음에" — 고양이가 흔들기 시작한 직후 XP 게이지 + 레벨업 모션이 이어진다.
  const xpDelayNum = WAVE_START + 0.25
  const xpDelay = xpDelayNum.toFixed(2)

  // 게이지 애니메이션은 2단계: (A) 0→100%로 가득 참 → (B) 0으로 리셋 후 현재 진행도까지.
  // RESET_FRAC = A단계가 끝나고 리셋되는 지점(@keyframes와 동일해야 함).
  const RESET_FRAC = 0.44
  const resetMoment = xpDelayNum + RESET_FRAC * durNum // 게이지가 리셋되는 = 레벨이 바뀌는 바로 그 순간
  const gaugeEnd = xpDelayNum + durNum // B단계까지 모두 끝나는 시점(=XP·레벨업 모션 종료)

  // 레벨 칩은 게이지가 차오르는 동안 Lv.11로 떠 있다가, 리셋 순간 같은 자리에서 Lv.12로 "뿅".
  const oldDelay = xpDelayNum - 0.15 // 게이지가 차기 시작할 때 Lv.11 등장
  const newDelay = resetMoment // 리셋되는 순간 Lv.12
  const oldDur = (newDelay - oldDelay + 0.28).toFixed(2) // 등장~유지~(리셋 때)사라짐

  // "1.0초 뒤에 보상" → "1.2초 후에 계속하기 버튼"
  const rewardsDelay = (gaugeEnd + 1.0).toFixed(2)
  const actionsDelay = (gaugeEnd + 1.0 + 1.2).toFixed(2)

  const delayed = (sec) => ({ animationDelay: `${sec}s` })

  return (
    <div className="levelup-page">
      {/* 팔랑팔랑 떨어지는 축하 조각들 */}
      <div className="levelup-confetti" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`confetti-piece piece-${i % 5}`} style={{ '--i': i }} />
        ))}
      </div>

      <div className="levelup-content">
        <div className="levelup-item levelup-head" style={delayed(HEAD_DELAY)}>
          <p className="levelup-kicker">축하해요!</p>
          <h1 className="levelup-heading">
            <StarIcon size={20} />
            <span>레벨 업!</span>
            <StarIcon size={20} />
          </h1>
        </div>

        <div
          className="levelup-item levelup-stage"
          style={{ animationDelay: `${CAT_DELAY}s`, '--wave-start': `${WAVE_START.toFixed(2)}s` }}
        >
          <CharacterAvatar equipped={equipped} getItem={getItem} className="levelup-avatar" />
          <div className="levelup-stage-shadow" aria-hidden="true" />
        </div>

        <p className="levelup-item levelup-title" style={delayed(TITLE_DELAY.toFixed(2))}>{title}</p>

        {/* XP 게이지 — Lv.11 진행도(0→100%)로 가득 찼다가, 리셋 순간(레벨 업) 뒤 현재 진행도까지 다시 채워진다 */}
        <div className="levelup-item levelup-xp" style={delayed(xpDelay)}>
          <div className="levelup-xp-row">
            <span className="levelup-xp-label">XP</span>
            {/* 숫자도 리셋 순간에 맞춰 2,000/2,000 → 1,240/2,000 으로 바뀐다 */}
            <span className="levelup-xp-amount">
              <span className="xp-amt xp-amt-old" style={{ '--swap-at': `${newDelay.toFixed(2)}s` }}>
                {xpMax.toLocaleString()} / {xpMax.toLocaleString()}
              </span>
              <span className="xp-amt xp-amt-new" style={{ '--swap-at': `${newDelay.toFixed(2)}s` }}>
                {xpCurrent.toLocaleString()} / {xpMax.toLocaleString()}
              </span>
            </span>
          </div>
          <div className="progress-track levelup-progress">
            <div
              className="progress-fill levelup-progress-fill"
              style={{
                '--xp-target': `${xpPercent}%`,
                '--xp-duration': `${xpDuration}s`,
                '--xp-delay': `${xpDelay}s`,
              }}
            />
          </div>
        </div>

        {/* 레벨 표시 — 게이지가 다 찬 뒤, 같은 자리에서 Lv.11 → Lv.12 로 "뿅" 하고 바뀐다 */}
        <div className="levelup-levels">
          <span
            className="levelup-chip old"
            style={{ '--old-delay': `${oldDelay.toFixed(2)}s`, '--old-dur': `${oldDur}s` }}
          >
            Lv.{from}
          </span>
          <span className="levelup-chip new" style={{ '--rise-delay': `${newDelay.toFixed(2)}s` }}>
            <StarIcon size={14} />
            Lv.{to}
          </span>
        </div>

        <div className="levelup-item levelup-rewards" style={delayed(rewardsDelay)}>
          <div className="levelup-reward">
            <CoinIcon size={20} />
            <span>도토리 +{reward.toLocaleString()}</span>
          </div>
        </div>

        <div className="levelup-item levelup-actions" style={delayed(actionsDelay)}>
          <button type="button" className="levelup-continue" onClick={() => onNavigate('profile')}>
            계속하기
          </button>
        </div>
      </div>
    </div>
  )
}

export default LevelUpPage

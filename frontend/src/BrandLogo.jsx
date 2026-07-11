// 공식 로고 심볼(원 + 잎)과 워드마크. 디자인 핸드오프(Forestudy Logo Guide) 기준.
// 심볼 SVG는 viewBox 0 0 100 100, 원(링)은 currentColor, 잎은 별도 accent 색.
export function LogoMark({ size = 20, ringColor = 'currentColor', leafColor = '#7FB79A' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <circle cx="45" cy="60" r="30" fill="none" stroke={ringColor} strokeWidth="14" />
      <path d="M60 33 C64 15 82 8 96 10 C94 28 80 38 60 37 Z" fill={leafColor} />
    </svg>
  )
}

// reversed: 어두운 배경 위에 쓰는 버전(밝은 잉크 + 연한 잎)
export function BrandWordmark({ size = 30, reversed = false, className = '' }) {
  const ink = reversed ? '#F0EEE6' : '#26302A'
  const ring = reversed ? '#8FC3A6' : '#2F6B4F'
  const leaf = reversed ? '#5E9E7C' : '#7FB79A'
  return (
    <span
      className={`brand-wordmark${className ? ` ${className}` : ''}`}
      aria-label="forestudy"
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        fontFamily: "'Quicksand', sans-serif",
        fontWeight: 600,
        fontSize: size,
        letterSpacing: '-0.01em',
        color: ink,
        lineHeight: 1,
      }}
    >
      f
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '0.68em',
          height: '1em',
          margin: '0 0.01em',
          transform: 'translateY(0.08em)',
        }}
      >
        <LogoMark size="100%" ringColor={ring} leafColor={leaf} />
      </span>
      restudy
    </span>
  )
}

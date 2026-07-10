const TMAP_APP_KEY = import.meta.env.VITE_TMAP_APP_KEY
const POLL_INTERVAL_MS = 100
const POLL_TIMEOUT_MS = 10000

let loadPromise = null

function isReady() {
  return typeof window.Tmapv2?.LatLng === 'function' && typeof window.Tmapv2?.Map === 'function'
}

// TMap JS SDK 진입 스크립트(index.html의 jsv2?appKey=...)는 완전한 SDK가 아니라, 자기 내부에서
// document.write()로 진짜 SDK 파일(tmapjs2.min.js)을 추가로 불러오는 부트스트랩 로더다.
// document.write는 문서 파싱 중에만 정상 동작하므로 그 <script>는 index.html에 정적으로 박아둬야
// 하고(동적 주입하면 무시돼 Tmapv2가 빈 껍데기로 남는다), 이 로더는 그 SDK가 실제로 완전히
// 채워질 때까지(Tmapv2.LatLng이 함수가 될 때까지) 폴링만 한다.
export function loadTmapSdk() {
  if (isReady()) return Promise.resolve(window.Tmapv2)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (!TMAP_APP_KEY) {
      reject(new Error('TMap 앱키가 설정되지 않았습니다 (VITE_TMAP_APP_KEY, index.html 확인).'))
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (isReady()) {
        clearInterval(timer)
        resolve(window.Tmapv2)
        return
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer)
        reject(new Error('TMap SDK 로드에 실패했습니다 (시간 초과). index.html의 스크립트 태그를 확인해 주세요.'))
      }
    }, POLL_INTERVAL_MS)
  })

  return loadPromise
}

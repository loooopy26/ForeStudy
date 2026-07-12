import { useCallback, useState } from 'react'
import Profile from './Profile'
import Village from './Village'
import AddCert from './AddCert'
import CertUpload from './CertUpload'
import PlacementIntro from './PlacementIntro'
import PlacementTest from './PlacementTest'
import LearningPlanView from './LearningPlanView'
import Library from './Library'
import Quiz from './Quiz'
import Review from './Review'
import Summary from './Summary'
import Chat from './Chat'
import ForestGame from './ForestGame'
import ShopPage from './ShopPage'
import RoomPage from './RoomPage'
import CharacterPage from './CharacterPage'
import LevelUpPage from './LevelUpPage'
import StudyMap from './StudyMap'
import StudyPlaces from './StudyPlaces'
import ExamAssistant from './ExamAssistant'
import Auth from './Auth'
import { getCurrentCertificates, getCurrentUser, getMaterialId, setMaterialId as persistMaterialId } from './api'
import './theme.css'
import './Shell.css'
import './App.css'

const SCREENS = {
  profile: Profile,
  village: Village,
  addcert: AddCert,
  certUpload: CertUpload,
  placementIntro: PlacementIntro,
  placementTest: PlacementTest,
  learningPlan: LearningPlanView,
  library: Library,
  quiz: Quiz,
  review: Review,
  summary: Summary,
  chat: Chat,
  forest: ForestGame,
  shop: ShopPage,
  room: RoomPage,
  character: CharacterPage,
  levelup: LevelUpPage,
  studymap: StudyMap,
  studyplaces: StudyPlaces,
  examassistant: ExamAssistant,
  auth: Auth,
}

// 실제 화면 키(SCREENS) 외에 URL로 바로 들어갈 수 있는 별칭들.
// quest/achievement는 둘 다 forest 화면으로 들어가되 내부 서브탭만 다르게 연다.
const PATH_ALIASES = {
  quest: { page: 'forest', sub: 'quests' },
  quests: { page: 'forest', sub: 'quests' },
  achievement: { page: 'forest', sub: 'achievements' },
  achievements: { page: 'forest', sub: 'achievements' },
  login: { page: 'auth', sub: 'login' },
  signup: { page: 'auth', sub: 'signup' },
}

function resolveRouteFromPath() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '')
  const landingPage = getCurrentUser() ? 'profile' : 'auth'
  if (!path) return { page: landingPage, sub: undefined }
  if (path in SCREENS) return { page: path, sub: undefined }
  const lowerPath = path.toLowerCase()
  if (lowerPath in PATH_ALIASES) return PATH_ALIASES[lowerPath]
  return { page: landingPage, sub: undefined }
}

// materialId에 해당하는 자격증을 찾아 selectedCert 초기값으로 쓴다 — 없으면 첫 번째 자격증.
function getInitialCertificate() {
  const certificates = getCurrentCertificates()
  return certificates.find((certificate) => certificate.materialId === getMaterialId()) || certificates[0] || null
}

function App() {
  const [route, setRoute] = useState(resolveRouteFromPath)
  const [materialId, setMaterialId] = useState(() => getInitialCertificate()?.materialId || getMaterialId() || null)
  const [selectedCert, setSelectedCert] = useState(() => getInitialCertificate()?.title || '')
  const [placementQuiz, setPlacementQuiz] = useState(null)
  const [planData, setPlanData] = useState(null)
  // 자격증 2개 이상 등록 시 도서관 타이머가 서로 섞이지 않도록 자격증별로 따로 기억한다.
  const [libraryTimers, setLibraryTimers] = useState({})
  const Screen = SCREENS[route.page] || Profile
  const timerKey = selectedCert || '__default__'

  const navigate = (page, payload) => {
    if (payload?.cert) setSelectedCert(payload.cert)
    if (payload?.materialId) selectMaterial(payload.materialId)
    if (payload?.placementQuiz) setPlacementQuiz(payload.placementQuiz)
    if (payload?.planData) setPlanData(payload.planData)
    setRoute({ page, sub: payload?.sub })
    window.history.pushState({}, '', page === 'auth' ? '/' : `/${page}`)
  }

  const selectMaterial = (id) => {
    persistMaterialId(id)
    setMaterialId(id)
  }

  const selectCertificate = (certificate) => {
    if (!certificate) return
    setSelectedCert(certificate.title)
    selectMaterial(certificate.materialId)
  }

  const updateLibraryTimer = useCallback((timerState) => {
    setLibraryTimers((timers) => ({ ...timers, [timerKey]: timerState }))
  }, [timerKey])

  return (
    <div className="app-shell">
      <div className="phone-frame">
        <Screen
          key={route.page === 'library' ? `library-${timerKey}` : route.page}
          onNavigate={navigate}
          materialId={materialId}
          onSelectMaterial={selectMaterial}
          onSelectCertificate={selectCertificate}
          initialSub={route.sub}
          certName={selectedCert}
          placementQuiz={placementQuiz}
          planData={planData}
          timerState={libraryTimers[timerKey] || null}
          onTimerStateChange={updateLibraryTimer}
        />
      </div>
    </div>
  )
}

export default App

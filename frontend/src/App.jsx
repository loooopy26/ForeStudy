import { useState } from 'react'
import Profile from './Profile'
import Village from './Village'
import AddCert from './AddCert'
import Library from './Library'
import Quiz from './Quiz'
import Review from './Review'
import Summary from './Summary'
import Chat from './Chat'
import ForestGame from './ForestGame'
import { getMaterialId, setMaterialId as persistMaterialId } from './api'
import './theme.css'
import './Shell.css'
import './App.css'

const SCREENS = {
  profile: Profile,
  village: Village,
  addcert: AddCert,
  library: Library,
  quiz: Quiz,
  review: Review,
  summary: Summary,
  chat: Chat,
  forest: ForestGame,
}

function App() {
  const [page, setPage] = useState('profile')
  const [materialId, setMaterialId] = useState(() => getMaterialId() || null)
  const Screen = SCREENS[page]

  const selectMaterial = (id) => {
    persistMaterialId(id)
    setMaterialId(id)
  }

  return (
    <div className="app-shell">
      <div className="phone-frame">
        <Screen onNavigate={setPage} materialId={materialId} onSelectMaterial={selectMaterial} />
      </div>
    </div>
  )
}

export default App

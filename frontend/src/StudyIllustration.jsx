import libraryBackground from './assets/library-background.png'

function StudyIllustration() {
  return (
    <div className="study-illustration" aria-hidden="true">
      <img className="study-illustration-image" src={libraryBackground} alt="" />
      <div className="study-illustration-glow" />
    </div>
  )
}

export default StudyIllustration

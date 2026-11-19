import { useEffect, useRef } from 'react'

export default function useStudyAlert() {
  const audio = useRef(null)

  useEffect(() => () => {
    audio.current?.close().catch(() => {})
    audio.current = null
  }, [])

  function enable() {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return
    try {
      audio.current ??= new Audio()
      void audio.current.resume().catch(() => {})
    } catch { /* The visual alert is still available. */ }
  }

  function play(resuming) {
    const context = audio.current
    if (context?.state !== 'running') return
    const notes = resuming ? [660, 880] : [550, 415]
    notes.forEach((frequency, i) => {
      const time = context.currentTime + i * 0.14
      const tone = context.createOscillator()
      const volume = context.createGain()
      tone.frequency.value = frequency
      volume.gain.setValueAtTime(0, time)
      volume.gain.linearRampToValueAtTime(0.2, time + 0.02)
      volume.gain.linearRampToValueAtTime(0, time + 0.13)
      tone.connect(volume).connect(context.destination)
      tone.start(time)
      tone.stop(time + 0.14)
    })
  }

  return { enable, play }
}

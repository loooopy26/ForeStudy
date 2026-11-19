import { useEffect, useState } from 'react'

const faceSize = 128
const directionThreshold = 0.24
const rotationThreshold = 35 // degrees per second
const accelerationThreshold = 2 // m/s², excluding gravity

function magnitude(x, y, z) {
  const axes = [x, y, z].filter(Number.isFinite)
  return axes.length ? Math.hypot(...axes) : null
}

export default function useStudyFocus(videoRef, cameraActive, facing, running) {
  const [faceEnabled, setFaceEnabled] = useState(false)
  const [faceStatus, setFaceStatus] = useState('loading')
  const [calibration, setCalibration] = useState(0)
  const [motionPermission, setMotionPermission] = useState('off')
  const [motionStatus, setMotionStatus] = useState('waiting')
  const resetMotion = () => setMotionStatus('waiting')

  function resetFace() {
    setFaceStatus('loading')
    setCalibration(value => value + 1)
  }

  function toggleFace() {
    resetFace()
    setFaceEnabled(enabled => !enabled)
  }

  async function toggleMotion() {
    if (motionPermission === 'granted') {
      setMotionPermission('off')
      return
    }
    const api = window.DeviceMotionEvent
    if (!api || !window.isSecureContext) {
      setMotionPermission('unavailable')
      return
    }
    setMotionPermission('asking')
    try {
      // Safari checks for a tap at the point where permission is requested.
      const result = api.requestPermission ? await api.requestPermission() : 'granted'
      resetMotion()
      setMotionPermission(result === 'granted' ? 'granted' : 'denied')
    } catch {
      setMotionPermission('denied')
    }
  }

  useEffect(() => {
    if (!cameraActive || !faceEnabled) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = faceSize
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let worker
    let busy = false
    let requestTime = 0
    let interval
    let timeout
    let baseline
    let samples = []
    let suspectSince = 0
    let lastResult = 0

    function fail() {
      clearInterval(interval)
      clearTimeout(timeout)
      worker?.terminate()
      setFaceStatus('error')
    }

    function update(direction, now) {
      if (now - lastResult > 1600) {
        suspectSince = 0
        samples = []
      }
      lastResult = now
      if (baseline == null) {
        if (direction == null) {
          samples = []
          setFaceStatus('calibrate')
          return
        }
        if (samples.length && Math.abs(samples[0] - direction) > 0.10) samples = []
        samples.push(direction)
        if (samples.length < 4) return
        baseline = samples.reduce((sum, value) => sum + value, 0) / samples.length
        setFaceStatus('focused')
        return
      }
      const steady = direction != null && Math.abs(direction - baseline) < directionThreshold
      if (steady) {
        suspectSince = 0
        setFaceStatus('focused')
        return
      }
      suspectSince ||= now
      setFaceStatus(now - suspectSince < 3000 ? 'checking' : direction == null ? 'missing' : 'away')
    }

    function capture() {
      if (document.hidden) return
      if (busy) {
        if (performance.now() - requestTime > 5000) fail()
        return
      }
      const side = Math.min(video.videoWidth, video.videoHeight)
      if (video.readyState < 2 || !side) return
      try {
        ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2,
          side, side, 0, 0, faceSize, faceSize)
        const pixels = ctx.getImageData(0, 0, faceSize, faceSize).data.buffer
        busy = true
        requestTime = performance.now()
        worker.postMessage({ type: 'frame', pixels }, [pixels])
      } catch {
        fail()
      }
    }

    try {
      worker = new Worker(import.meta.env.BASE_URL + 'study-runtime/focus-worker.js')
      worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          clearTimeout(timeout)
          setFaceStatus('calibrate')
          interval = setInterval(capture, 500)
        } else if (data.type === 'result') {
          busy = false
          update(data.direction, performance.now())
        } else fail()
      }
      worker.onerror = fail
      worker.postMessage({ type: 'init' })
      timeout = setTimeout(fail, 60000)
    } catch {
      queueMicrotask(fail)
    }
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
      worker?.terminate()
    }
  }, [cameraActive, videoRef, faceEnabled, facing, calibration])

  useEffect(() => {
    if (!running || motionPermission !== 'granted') return
    let lastSample = -Infinity
    let lastMovement = -Infinity
    let gravity
    let alertUntil = 0
    let started = performance.now()

    function observe(event) {
      if (document.hidden) return
      const { alpha, beta, gamma } = event.rotationRate || {}
      const { x, y, z } = event.acceleration || {}
      const rotation = magnitude(alpha, beta, gamma)
      const now = performance.now()
      const { x: gx, y: gy, z: gz } = event.accelerationIncludingGravity || {}
      let acceleration = magnitude(x, y, z)
      if ([gx, gy, gz].every(Number.isFinite)) {
        const measured = [gx, gy, gz]
        if (!gravity || now - lastSample > 500) gravity = measured
        const delta = measured.map((value, axis) => value - gravity[axis])
        acceleration ??= Math.hypot(...delta)
        const blend = Math.min(0.2, (now - lastSample) / 550)
        gravity = gravity.map((value, axis) => value + delta[axis] * blend)
      }
      if (rotation == null && acceleration == null) return
      lastSample = now
      if (rotation >= rotationThreshold || acceleration >= accelerationThreshold) {
        if (now - lastMovement <= 220 || rotation >= 85 || acceleration >= 4.5) {
          alertUntil = now + 2500
        }
        lastMovement = now
      }
    }

    function reset() {
      lastSample = -Infinity
      lastMovement = -Infinity
      gravity = undefined
      alertUntil = 0
      started = performance.now()
    }
    window.addEventListener('devicemotion', observe)
    document.addEventListener('visibilitychange', reset)
    const update = setInterval(() => {
      if (document.hidden) return
      const now = performance.now()
      if (now < alertUntil) setMotionStatus('moving')
      else if (now - lastSample < 2500) setMotionStatus('steady')
      else setMotionStatus(now - started < 2500 ? 'waiting' : 'unavailable')
    }, 200)
    return () => {
      clearInterval(update)
      window.removeEventListener('devicemotion', observe)
      document.removeEventListener('visibilitychange', reset)
    }
  }, [running, motionPermission])

  return { faceEnabled, faceStatus, toggleFace, resetFace, motionPermission, motionStatus, toggleMotion, resetMotion }
}

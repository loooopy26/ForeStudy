import { useCallback, useEffect, useRef, useState } from 'react'

const messages = {
  idle: '얼굴이 보이도록 휴대폰을 거치해 주세요.',
  permission: '카메라 권한을 확인하고 있어요.',
  interrupted: '카메라가 중단됐어요. 다시 켤 수 있어요.',
  denied: '카메라 사용이 차단됐어요. 사이트 권한을 확인해 주세요.',
  insecure: '카메라를 사용하려면 HTTPS 주소로 접속해 주세요.',
  unavailable: '사용 가능한 카메라를 찾을 수 없어요.',
  facingUnavailable: '선택한 카메라를 사용할 수 없어요. 다른 카메라나 자동을 선택해 주세요.',
  error: '카메라를 시작하지 못했어요. 다시 시도해 주세요.',
}

export default function useStudyCamera(videoRef) {
  const active = useRef(null)
  const [status, setStatus] = useState('idle')
  const [mirror, setMirror] = useState(false)
  const release = useCallback(() => {
    const session = active.current
    active.current = null
    if (!session) return
    session.stream?.getTracks().forEach(track => {
      track.onended = null
      track.stop()
    })
    session.video.pause()
    session.video.srcObject = null
  }, [])

  const stop = useCallback((reason = 'idle') => {
    release()
    setStatus(reason)
  }, [release])

  useEffect(() => {
    const interrupt = () => { if (active.current) stop('interrupted') }
    const visibility = () => { if (document.hidden) interrupt() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', interrupt)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', interrupt)
      release()
    }
  }, [release, stop])

  const start = async (facing) => {
    if (!videoRef.current || active.current?.facing === facing) return
    // Release the old track before Safari is asked to open the other camera.
    release()
    if (!window.isSecureContext) return setStatus('insecure')
    if (!navigator.mediaDevices?.getUserMedia) return setStatus('unavailable')
    if (facing !== 'auto' && !navigator.mediaDevices.getSupportedConstraints?.().facingMode) {
      return setStatus('facingUnavailable')
    }
    const video = videoRef.current
    const session = { video, facing }
    active.current = session
    const current = () => active.current === session
    const fail = reason => { if (current()) stop(reason) }
    setStatus('permission')
    try {
      // Call directly inside the start/retry gesture, before any timer API awaits.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: facing === 'auto' ? { ideal: 'environment' } : { exact: facing },
          width: { ideal: 640 }, height: { ideal: 480 },
        },
      })
      if (!current()) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      session.stream = stream
      const [track] = stream.getVideoTracks()
      setMirror((track.getSettings?.().facingMode || facing) === 'user')
      track.onended = () => fail('interrupted')
      video.srcObject = stream
      setStatus('live')
      await video.play()
    } catch (error) {
      fail(error.name === 'NotAllowedError' ? 'denied'
        : facing !== 'auto' && ['OverconstrainedError', 'NotFoundError'].includes(error.name) ? 'facingUnavailable'
        : error.name === 'NotFoundError' ? 'unavailable' : 'error')
    }
  }
  return { start, stop, status, message: messages[status], mirror }
}

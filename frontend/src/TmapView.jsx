import { useEffect, useRef, useState } from 'react'
import { loadTmapSdk } from './tmapLoader'
import './TmapView.css'

// 마커를 색상 + 라벨(숫자/글자)이 있는 원형 핀 SVG로 그려서 data URI로 반환.
// 별도 이미지 에셋 없이 장소 종류(현재위치/시험장/추천장소 순위)를 구분하기 위함.
function markerIcon(color, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 25 17 25s17-12.3 17-25C34 7.6 26.4 0 17 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="17" cy="17" r="10" fill="#fff"/>
      <text x="17" y="21.5" font-size="12" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="${color}">${label}</text>
    </svg>`
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * TMap JS SDK 지도 표시 컴포넌트.
 * markers: [{ id, latitude, longitude, label, title, subtitle, color }]
 * onMapClick: (latitude, longitude) => void — 있으면 지도 클릭 지점 좌표를 넘겨준다 (출발지 선택 등).
 */
function TmapView({ center, markers = [], height = 220, zoom = 16, onMapClick }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerObjsRef = useRef([])
  const infoWindowRef = useRef(null)
  // 클릭 리스너는 지도 생성 시 한 번만 등록하고, 핸들러는 ref로 항상 최신 것을 부른다.
  const onMapClickRef = useRef(onMapClick)
  useEffect(() => {
    onMapClickRef.current = onMapClick
  }, [onMapClick])
  // 마커 전체가 보이도록 지도 범위를 맞추는 건 최초 로드 때 한 번만 하고, 이후 마커가
  // 갱신돼도(재검색 등) 사용자가 움직여둔 지도 상태를 건드리지 않는다.
  const didFitRef = useRef(false)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [errorMessage, setErrorMessage] = useState('')

  // 지도 인스턴스는 최초 1회만 생성.
  useEffect(() => {
    let alive = true
    loadTmapSdk()
      .then((Tmapv2) => {
        if (!alive || !containerRef.current) return
        mapRef.current = new Tmapv2.Map(containerRef.current, {
          center: new Tmapv2.LatLng(center.latitude, center.longitude),
          width: '100%',
          height: '100%',
          zoom,
          zoomControl: false,
        })
        // 지도 클릭으로 좌표를 고르는 화면(출발지 선택)용. SDK 버전에 따라 latLng이
        // 메서드(lat())일 수도, 내부 필드(_lat)일 수도 있어 둘 다 대응한다.
        mapRef.current.addListener('click', (event) => {
          const handler = onMapClickRef.current
          const latLng = event?.latLng
          if (!handler || !latLng) return
          const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng._lat
          const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng._lng
          if (typeof lat === 'number' && typeof lng === 'number') handler(lat, lng)
        })
        setStatus('ready')
      })
      .catch((err) => {
        if (!alive) return
        setErrorMessage(err.message || 'TMap 지도를 불러오지 못했습니다.')
        setStatus('error')
      })
    return () => {
      alive = false
      markerObjsRef.current.forEach((m) => m.setMap(null))
      markerObjsRef.current = []
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 중심 좌표 변경 시 지도만 이동.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.Tmapv2) return
    mapRef.current.setCenter(new window.Tmapv2.LatLng(center.latitude, center.longitude))
  }, [status, center.latitude, center.longitude])

  // 마커 목록 변경 시 기존 마커를 지우고 다시 그림.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.Tmapv2) return
    const Tmapv2 = window.Tmapv2

    markerObjsRef.current.forEach((m) => m.setMap(null))
    markerObjsRef.current = []
    if (infoWindowRef.current) {
      infoWindowRef.current.setMap(null)
      infoWindowRef.current = null
    }

    markers.forEach((marker) => {
      const position = new Tmapv2.LatLng(marker.latitude, marker.longitude)
      const markerObj = new Tmapv2.Marker({
        position,
        icon: markerIcon(marker.color || '#E0574B', marker.label ?? ''),
        iconSize: new Tmapv2.Size(28, 34),
        map: mapRef.current,
      })
      if (marker.title) {
        markerObj.addListener('click', () => {
          if (infoWindowRef.current) infoWindowRef.current.setMap(null)
          infoWindowRef.current = new Tmapv2.InfoWindow({
            position,
            content: `<div style="padding:6px 10px;font-size:12px;white-space:nowrap;">
              <b>${marker.title}</b>${marker.subtitle ? `<br/>${marker.subtitle}` : ''}
            </div>`,
            type: 2,
            map: mapRef.current,
          })
        })
      }
      markerObjsRef.current.push(markerObj)
    })

    // 마커가 2개 이상 모였을 때(= 현재위치 하나뿐인 로딩 초기 상태가 아니라 실제 검색/계산
    // 결과가 도착한 시점)를 "최초 로드"로 보고 그때 딱 한 번만 전체가 보이게 맞춘다. 마커가
    // 1개뿐인 동안은 아직 데이터가 덜 온 것일 수 있으니 완료 처리하지 않고 다음 갱신을 기다린다.
    if (!didFitRef.current && markers.length > 1) {
      didFitRef.current = true
      const bounds = new Tmapv2.LatLngBounds()
      markers.forEach((marker) => bounds.extend(new Tmapv2.LatLng(marker.latitude, marker.longitude)))
      mapRef.current.fitBounds(bounds)
    }
  }, [status, markers])

  return (
    <div className="tmap-view" style={{ height }}>
      <div ref={containerRef} className="tmap-view-canvas" />
      {status === 'loading' && <div className="tmap-view-overlay">지도를 불러오는 중...</div>}
      {status === 'error' && <div className="tmap-view-overlay tmap-view-overlay-error">{errorMessage}</div>}
    </div>
  )
}

export default TmapView

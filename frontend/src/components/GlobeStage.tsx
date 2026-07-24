import type { StormSummary } from '../types/contracts'
import { useAppDispatch, useAppState } from '../state/AppState'
import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'

interface Props {
  storms: StormSummary[]
  windMode?: boolean
}

const basinAnchor: Record<string, [number, number]> = {
  WP: [135, 22],
  NA: [-62, 25],
  EP: [-112, 17],
  NI: [75, 15],
  SI: [75, -17],
  AU: [135, -18],
  SP: [-145, -20],
  SA: [-25, -20],
}

function project(lon: number, lat: number, centerLon: number, centerLat: number, width: number, height: number, zoom: number) {
  const radius = Math.min(width, height) * 0.39 * zoom
  const toRad = Math.PI / 180
  const lambda = (lon - centerLon) * toRad
  const phi = lat * toRad
  const phi0 = centerLat * toRad
  const visible = Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda) + Math.sin(phi0) * Math.sin(phi)
  if (visible < 0) return null
  return [
    width / 2 + radius * Math.cos(phi) * Math.sin(lambda),
    height / 2 - radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda)),
  ]
}

export default function GlobeStage({ storms, windMode = false }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const selectedId = state.selectedStormId
  const [view, setView] = useState({ lon: 0, lat: 15, zoom: 1 })
  const drag = useRef<{ x: number; y: number; lon: number; lat: number } | null>(null)
  const width = 900
  const height = 600
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.39

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, lon: view.lon, lat: view.lat }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const nextLon = drag.current.lon - (event.clientX - drag.current.x) * 0.35 / view.zoom
    const nextLat = Math.max(-80, Math.min(80, drag.current.lat + (event.clientY - drag.current.y) * 0.25 / view.zoom))
    setView((current) => ({ ...current, lon: nextLon, lat: nextLat }))
  }

  function onPointerUp() {
    drag.current = null
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    setView((current) => ({ ...current, zoom: Math.max(0.72, Math.min(1.55, current.zoom * (event.deltaY < 0 ? 1.08 : 0.93))) }))
  }

  return (
    <div className="globe-stage" data-layer-mode={windMode ? 'wind' : 'overview'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="CycloneScope 地球分析图层">
        <defs>
          <radialGradient id="globe-fill" cx="42%" cy="36%">
            <stop offset="0" stopColor="#174955" />
            <stop offset="0.72" stopColor="#0b2934" />
            <stop offset="1" stopColor="#06151d" />
          </radialGradient>
          <filter id="globe-glow"><feGaussianBlur stdDeviation="9" /></filter>
        </defs>
        <circle cx={cx} cy={cy} r={radius + 14} fill="#2ab8c4" opacity="0.08" filter="url(#globe-glow)" />
        <circle cx={cx} cy={cy} r={radius} fill="url(#globe-fill)" stroke="#4b9ca7" strokeOpacity="0.6" />
        <g className="globe-grid" aria-hidden="true">
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = cy - (lat / 90) * radius
            const rx = radius * Math.cos((lat * Math.PI) / 180)
            return <ellipse key={`lat-${lat}`} cx={cx} cy={y} rx={Math.max(10, rx)} ry={Math.max(3, radius * 0.08)} />
          })}
          {[-120, -60, 0, 60, 120].map((lon) => (
            <ellipse key={`lon-${lon}`} cx={cx} cy={cy} rx={Math.abs(radius * Math.cos((lon * Math.PI) / 180))} ry={radius} transform={`rotate(${lon} ${cx} ${cy})`} />
          ))}
        </g>
        {windMode && (
          <g className="wind-field" aria-label="风场粒子预览">
            {Array.from({ length: 28 }, (_, index) => {
              const angle = (index * 137.5 * Math.PI) / 180
              const distance = radius * (0.2 + (index % 7) / 10)
              const x = cx + Math.cos(angle) * distance
              const y = cy + Math.sin(angle) * distance * 0.72
              return <path key={index} d={`M ${x} ${y} l 18 -5`} />
            })}
          </g>
        )}
        <g className="storm-markers">
          {storms.map((storm, index) => {
            const [anchorLon, anchorLat] = basinAnchor[storm.basin] ?? [0, 0]
            const lon = anchorLon + ((storm.season + index * 11) % 18) - 9
            const lat = anchorLat + ((storm.season + index * 7) % 10) - 5
            const projected = project(lon, lat, view.lon, view.lat, width, height, view.zoom)
            if (!projected) return null
            const [x, y] = projected
            const selected = storm.id === selectedId
            return (
              <g key={storm.id} className={`storm-marker ${selected ? 'selected' : ''}`} onClick={() => dispatch({ type: 'select-storm', stormId: storm.id })} role="button" tabIndex={0}>
                <circle cx={x} cy={y} r={selected ? 8 : 5} />
                <circle cx={x} cy={y} r={selected ? 15 : 10} className="storm-pulse" />
                <text x={x + 11} y={y - 8}>{storm.name}</text>
              </g>
            )
          })}
        </g>
      </svg>
      <div className="globe-overlay">
        <span className="eyebrow">{windMode ? 'ERA5 WIND FIELD / PREVIEW' : 'GLOBAL CYCLONE ATLAS'}</span>
        <strong>{windMode ? '真实风场粒子插槽' : '全球历史气旋'}</strong>
        <small>{storms.length} 个事件 · 点击标记查看详情</small>
      </div>
    </div>
  )
}

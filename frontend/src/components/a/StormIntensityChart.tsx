/**
 * Component owner: A
 * Shared-time wind and pressure small multiples for the selected storm.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { dataApi } from '../../api'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { StormTrackResponse, TrackPoint } from '../../types/contracts'

type TimedPoint = TrackPoint & { time: string }

const WIDTH = 300
const HEIGHT = 236
const LEFT = 38
const RIGHT = 10
const TOP = 24
const PANEL_HEIGHT = 70
const PANEL_GAP = 42
const PLOT_WIDTH = WIDTH - LEFT - RIGHT

function distanceToTaiwan(point: TimedPoint) {
  const lonScale = Math.cos(23.7 * Math.PI / 180)
  return Math.hypot((point.lon - 121) * lonScale, point.lat - 23.7)
}

function extent(values: Array<number | null>) {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (!present.length) return [0, 1] as const
  const minimum = Math.min(...present)
  const maximum = Math.max(...present)
  const padding = Math.max(1, (maximum - minimum) * 0.12)
  return [minimum - padding, maximum + padding] as const
}

function pathFor(
  points: TimedPoint[],
  field: 'wind_ms' | 'pressure_hpa',
  x: (time: string) => number,
  y: (value: number) => number,
) {
  let drawing = false
  return points.map((point) => {
    const value = point[field]
    if (value == null) {
      drawing = false
      return ''
    }
    const command = drawing ? 'L' : 'M'
    drawing = true
    return command + x(point.time).toFixed(1) + ' ' + y(value).toFixed(1)
  }).filter(Boolean).join(' ')
}

function formatUtc(value: string) {
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export default function StormIntensityChart() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const svgRef = useRef<SVGSVGElement>(null)
  const [track, setTrack] = useState<StormTrackResponse | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  useEffect(() => {
    setTrack(null)
    setHoverIndex(null)
    setError('')
    if (!state.selectedStormId) {
      setStatus('idle')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    dataApi.track(state.selectedStormId, {}, controller.signal)
      .then((response) => {
        setTrack(response)
        setStatus('ready')
        const points = response.points as TimedPoint[]
        if (!points.length) return
        const requested = state.currentTime ? Date.parse(state.currentTime) : Number.NaN
        const nearest = Number.isFinite(requested)
          ? points.reduce((best, point) =>
              Math.abs(Date.parse(point.time) - requested) < Math.abs(Date.parse(best.time) - requested)
                ? point
                : best)
          : points[0]
        dispatch({ type: 'set-time', value: nearest.time })
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : String(cause))
        setStatus('error')
      })
    return () => controller.abort()
  }, [dispatch, state.selectedStormId])

  const model = useMemo(() => {
    const points = (track?.points ?? []) as TimedPoint[]
    if (!points.length) return null
    const start = Date.parse(points[0].time)
    const end = Date.parse(points.at(-1)!.time)
    const x = (time: string) => LEFT + (Date.parse(time) - start) / Math.max(1, end - start) * PLOT_WIDTH
    const windExtent = extent(points.map((point) => point.wind_ms))
    const pressureExtent = extent(points.map((point) => point.pressure_hpa))
    const windY = (value: number) =>
      TOP + PANEL_HEIGHT - (value - windExtent[0]) / Math.max(1, windExtent[1] - windExtent[0]) * PANEL_HEIGHT
    const pressureTop = TOP + PANEL_HEIGHT + PANEL_GAP
    const pressureY = (value: number) =>
      pressureTop + PANEL_HEIGHT
      - (value - pressureExtent[0]) / Math.max(1, pressureExtent[1] - pressureExtent[0]) * PANEL_HEIGHT
    const validWind = points.filter((point) => point.wind_ms != null)
    const validPressure = points.filter((point) => point.pressure_hpa != null)
    const maxWind = [...validWind].sort((left, right) => (right.wind_ms ?? 0) - (left.wind_ms ?? 0))[0]
    const minPressure = [...validPressure].sort((left, right) => (left.pressure_hpa ?? Infinity) - (right.pressure_hpa ?? Infinity))[0]
    const closest = [...points].sort((left, right) => distanceToTaiwan(left) - distanceToTaiwan(right))[0]
    const current = state.currentTime
      ? points.reduce((best, point) =>
          Math.abs(Date.parse(point.time) - Date.parse(state.currentTime!))
          < Math.abs(Date.parse(best.time) - Date.parse(state.currentTime!)) ? point : best)
      : points[0]
    return {
      points, start, end, x, windY, pressureY, pressureTop, windExtent, pressureExtent,
      windPath: pathFor(points, 'wind_ms', x, windY),
      pressurePath: pathFor(points, 'pressure_hpa', x, pressureY),
      maxWind, minPressure, closest, current,
    }
  }, [track, state.currentTime])

  function selectAt(clientX: number, hoverOnly = false) {
    if (!model || !svgRef.current) return
    const bounds = svgRef.current.getBoundingClientRect()
    const local = (clientX - bounds.left) / Math.max(1, bounds.width) * WIDTH
    const ratio = Math.max(0, Math.min(1, (local - LEFT) / PLOT_WIDTH))
    const target = model.start + (model.end - model.start) * ratio
    const index = model.points.reduce((best, point, pointIndex) =>
      Math.abs(Date.parse(point.time) - target) < Math.abs(Date.parse(model.points[best].time) - target)
        ? pointIndex
        : best, 0)
    setHoverIndex(index)
    if (!hoverOnly) dispatch({ type: 'set-time', value: model.points[index].time })
  }

  if (status === 'idle') return <div className="a-empty">请先选择一场气旋以查看强度过程。</div>
  if (status === 'loading') return <div className="a-skeleton intensity-skeleton" aria-label="正在加载强度过程" />
  if (status === 'error') return <div className="a-error">强度数据加载失败：{error}</div>
  if (!model) return <div className="a-empty">该气旋没有可用的轨迹观测点。</div>

  const tooltipPoint = hoverIndex == null ? null : model.points[hoverIndex]
  const currentX = model.x(model.current.time)
  const missingWind = model.points.filter((point) => point.wind_ms == null).length
  const missingPressure = model.points.filter((point) => point.pressure_hpa == null).length

  return (
    <div className="intensity-chart">
      <div className="a-chart-legend" aria-label="图例">
        <span><i className="legend-wind-line" />风速 m/s</span>
        <span><i className="legend-pressure-line" />气压 hPa</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={'0 0 ' + WIDTH + ' ' + HEIGHT}
        role="img"
        aria-label="气旋风速与中心气压时间序列"
        onPointerMove={(event) => selectAt(event.clientX, event.buttons !== 1)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          selectAt(event.clientX)
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <rect x={LEFT} y={TOP} width={PLOT_WIDTH} height={PANEL_HEIGHT} className="chart-panel-bg" />
        <rect x={LEFT} y={model.pressureTop} width={PLOT_WIDTH} height={PANEL_HEIGHT} className="chart-panel-bg" />
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={TOP + PANEL_HEIGHT * tick} y2={TOP + PANEL_HEIGHT * tick} className="chart-grid" />
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={model.pressureTop + PANEL_HEIGHT * tick} y2={model.pressureTop + PANEL_HEIGHT * tick} className="chart-grid" />
          </g>
        ))}
        <text x={2} y={TOP + 8} className="chart-axis-title">m/s</text>
        <text x={2} y={model.pressureTop + 8} className="chart-axis-title">hPa</text>
        <text x={LEFT - 4} y={TOP + 5} textAnchor="end" className="chart-tick">{Math.round(model.windExtent[1])}</text>
        <text x={LEFT - 4} y={TOP + PANEL_HEIGHT} textAnchor="end" className="chart-tick">{Math.round(model.windExtent[0])}</text>
        <text x={LEFT - 4} y={model.pressureTop + 5} textAnchor="end" className="chart-tick">{Math.round(model.pressureExtent[1])}</text>
        <text x={LEFT - 4} y={model.pressureTop + PANEL_HEIGHT} textAnchor="end" className="chart-tick">{Math.round(model.pressureExtent[0])}</text>
        <path d={model.windPath} className="intensity-wind-path" />
        <path d={model.pressurePath} className="intensity-pressure-path" />
        <line x1={model.x(model.closest.time)} x2={model.x(model.closest.time)} y1={TOP - 8} y2={model.pressureTop + PANEL_HEIGHT} className="taiwan-reference" />
        <text x={model.x(model.closest.time) + 3} y={TOP - 10} className="chart-annotation">距台湾最近</text>
        {model.maxWind?.wind_ms != null && (
          <circle cx={model.x(model.maxWind.time)} cy={model.windY(model.maxWind.wind_ms)} r={4} className="max-wind-point"><title>最大风速 {model.maxWind.wind_ms} m/s</title></circle>
        )}
        {model.minPressure?.pressure_hpa != null && (
          <circle cx={model.x(model.minPressure.time)} cy={model.pressureY(model.minPressure.pressure_hpa)} r={4} className="min-pressure-point"><title>最低气压 {model.minPressure.pressure_hpa} hPa</title></circle>
        )}
        <line x1={currentX} x2={currentX} y1={TOP} y2={model.pressureTop + PANEL_HEIGHT} className="current-time-line" />
        <text x={LEFT} y={HEIGHT - 4} className="chart-tick">{new Date(model.start).toISOString().slice(0, 10)}</text>
        <text x={WIDTH - RIGHT} y={HEIGHT - 4} textAnchor="end" className="chart-tick">{new Date(model.end).toISOString().slice(0, 10)}</text>
      </svg>
      {tooltipPoint && (
        <div className="a-chart-tooltip" role="status">
          <strong>{formatUtc(tooltipPoint.time)}</strong>
          <span>风速：{tooltipPoint.wind_ms == null ? '缺测' : tooltipPoint.wind_ms + ' m/s'}</span>
          <span>气压：{tooltipPoint.pressure_hpa == null ? '缺测' : tooltipPoint.pressure_hpa + ' hPa'}</span>
          <span>位置：{tooltipPoint.lon.toFixed(2)}°, {tooltipPoint.lat.toFixed(2)}°</span>
          <span>来源：{tooltipPoint.source_agency ?? '未知'}</span>
        </div>
      )}
      <p className="a-method-note">
        折线不会跨越缺测值；拖动图表可同步全局时间。风速缺测 {missingWind} 点，气压缺测 {missingPressure} 点。
      </p>
    </div>
  )
}

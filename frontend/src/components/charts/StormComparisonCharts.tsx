// Owner: B — complete linked multi-storm comparison component.
import { useEffect, useMemo, useState } from 'react'
import { dataApi } from '../../api'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { StormDetail, StormSummary } from '../../types/contracts'
import { ChartHeader, ComponentState, EVENT_COLORS, formatCompact, formatNumber, scaleLinear } from './chartUtils'

interface Props { storms: StormSummary[] }
type ImpactKey = 'estimated_exposed_population' | 'reported_deaths' | 'reported_affected_population' | 'reported_damage_usd_2024'
const IMPACT_LABELS: Record<ImpactKey, string> = {
  estimated_exposed_population: '模型暴露人口',
  reported_deaths: '报告死亡',
  reported_affected_population: '报告受灾人口',
  reported_damage_usd_2024: '报告经济损失（2024 USD）',
}

function trackProjection(detail: StormDetail, lonDomain: [number, number], latDomain: [number, number], width = 150, height = 95) {
  return detail.track.map((point) => ({
    ...point,
    x: scaleLinear(point.lon, lonDomain, [10, width - 10]),
    y: scaleLinear(point.lat, latDomain, [height - 10, 10]),
  }))
}

export default function StormComparisonCharts({ storms }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const ids = useMemo(() => [...new Set([state.selectedStormId, ...state.comparisonStormIds].filter((value): value is string => Boolean(value)))].slice(0, 3), [state.comparisonStormIds, state.selectedStormId])
  const [details, setDetails] = useState<Record<string, StormDetail>>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [error, setError] = useState('')
  const [hovered, setHovered] = useState<string | null>(null)
  const [viewportMode, setViewportMode] = useState<'independent' | 'shared'>('independent')
  const [timeMode, setTimeMode] = useState<'lifecycle' | 'utc'>('lifecycle')
  const [impactKey, setImpactKey] = useState<ImpactKey>('estimated_exposed_population')

  useEffect(() => {
    const controller = new AbortController()
    if (!ids.length) {
      setDetails({})
      setStatus('empty')
      return () => controller.abort()
    }
    setStatus('loading')
    Promise.all(ids.map((id) => dataApi.storm(id, controller.signal)))
      .then((items) => {
        setDetails(Object.fromEntries(items.map((item) => [item.id, item])))
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setStatus('error')
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => controller.abort()
  }, [ids.join('|')])

  const compared = ids.map((id) => details[id]).filter((item): item is StormDetail => Boolean(item))
  const metrics = [
    { label: '最大风速', unit: 'm/s', value: (item: StormDetail) => item.max_wind_ms },
    { label: '最低气压', unit: 'hPa', value: (item: StormDetail) => item.min_pressure_hpa },
    { label: 'ACE', unit: '指数', value: (item: StormDetail) => item.ace },
    { label: '持续时间', unit: '小时', value: (item: StormDetail) => item.duration_hours },
    { label: '移动速度', unit: 'km/h', value: (item: StormDetail) => {
      const values = item.track.map((point) => point.moving_speed_kmh).filter((value): value is number => value != null)
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    } },
    { label: '路径长度', unit: '点', value: (item: StormDetail) => item.track.length },
  ]
  const impactValues = compared.map((item) => item.impact[impactKey])
  const maxImpact = Math.max(1, ...impactValues.filter((value): value is number => value != null))
  const sharedLonDomain: [number, number] = compared.length
    ? [Math.min(...compared.flatMap((item) => item.track.map((point) => point.lon))), Math.max(...compared.flatMap((item) => item.track.map((point) => point.lon)))]
    : [0, 1]
  const sharedLatDomain: [number, number] = compared.length
    ? [Math.min(...compared.flatMap((item) => item.track.map((point) => point.lat))), Math.max(...compared.flatMap((item) => item.track.map((point) => point.lat)))]
    : [0, 1]

  return (
    <section className="b-component storm-comparison" data-owner="B">
      <ChartHeader eyebrow="MULTI-STORM · B" title="多台风综合对比" meta={<span>{ids.length}/3 场</span>} />
      <div className="comparison-chips">
        {ids.map((id, index) => {
          const storm = storms.find((item) => item.id === id)
          return <button
            key={id}
            type="button"
            style={{ borderColor: EVENT_COLORS[index] }}
            onClick={() => dispatch(id === state.selectedStormId
              ? { type: 'select-storm', stormId: null }
              : { type: 'toggle-comparison', stormId: id })}
          >
            <i style={{ background: EVENT_COLORS[index] }} />{storm?.name ?? id}<small>{storm?.season} · {storm?.basin}</small><b aria-label="移除">×</b>
          </button>
        })}
      </div>
      <ComponentState status={status} error={error} empty="从地图或案例库选择两至三场台风进行对比">
        <div className="comparison-view-toggle" aria-label="轨迹视口">
          <button type="button" aria-pressed={viewportMode === 'independent'} onClick={() => setViewportMode('independent')}>独立视口</button>
          <button type="button" aria-pressed={viewportMode === 'shared'} onClick={() => setViewportMode('shared')}>统一视口</button>
        </div>
        <div className="track-small-multiples">
          {compared.map((detail, index) => {
            const lons = detail.track.map((point) => point.lon)
            const lats = detail.track.map((point) => point.lat)
            const lonDomain: [number, number] = viewportMode === 'shared' ? sharedLonDomain : [Math.min(...lons), Math.max(...lons)]
            const latDomain: [number, number] = viewportMode === 'shared' ? sharedLatDomain : [Math.min(...lats), Math.max(...lats)]
            const projected = trackProjection(detail, lonDomain, latDomain)
            const span = Math.max(lonDomain[1] - lonDomain[0], latDomain[1] - latDomain[0])
            return (
            <button key={detail.id} type="button" className={hovered && hovered !== detail.id ? 'dimmed' : ''}
              onMouseEnter={() => setHovered(detail.id)} onMouseLeave={() => setHovered(null)}
              onClick={() => dispatch({ type: 'select-storm', stormId: detail.id })}>
              <span>{detail.name}<small>{viewportMode === 'shared' ? '统一视口' : '独立视口'} · 跨度约 {formatNumber(span, 1)}°</small></span>
              <svg viewBox="0 0 150 95" role="img" aria-label={`${detail.name}轨迹小倍图`}>
                {projected.slice(1).map((point, pointIndex) => {
                  const previous = projected[pointIndex]
                  const wind = point.wind_ms ?? previous.wind_ms
                  return <line
                    key={`${detail.id}-${pointIndex}`}
                    x1={previous.x}
                    y1={previous.y}
                    x2={point.x}
                    y2={point.y}
                    stroke={EVENT_COLORS[index]}
                    strokeWidth={wind == null ? 1.5 : scaleLinear(wind, [0, 100], [1.2, 4])}
                    opacity={wind == null ? 0.55 : 0.9}
                  />
                })}
                {projected[0] && <circle cx={projected[0].x} cy={projected[0].y} r="3" fill="none" stroke={EVENT_COLORS[index]} />}
                {projected.at(-1) && <circle cx={projected.at(-1)!.x} cy={projected.at(-1)!.y} r="3" fill={EVENT_COLORS[index]} />}
              </svg>
            </button>
          )})}
        </div>

        <figure className="b-figure lifecycle-chart">
          <figcaption><strong>生命周期强度</strong><button type="button" onClick={() => setTimeMode((current) => current === 'lifecycle' ? 'utc' : 'lifecycle')}>{timeMode === 'lifecycle' ? '0–100% 生命周期' : '真实 UTC'}</button></figcaption>
          <svg viewBox="0 0 330 180" role="img" aria-label="台风生命周期风速和气压曲线">
            <line x1="36" x2="320" y1="78" y2="78" className="axis-line" />
            <line x1="36" x2="320" y1="166" y2="166" className="axis-line" />
            {compared.map((detail, index) => {
              const times = detail.track.map((point) => Date.parse(point.time))
              const timeDomain: [number, number] = timeMode === 'utc'
                ? [Math.min(...compared.flatMap((item) => item.track.map((point) => Date.parse(point.time)))), Math.max(...compared.flatMap((item) => item.track.map((point) => Date.parse(point.time))))]
                : [times[0], times.at(-1) ?? times[0] + 1]
              const wind = detail.track.filter((point) => point.wind_ms != null).map((point) =>
                `${scaleLinear(Date.parse(point.time), timeDomain, [38, 318])},${scaleLinear(point.wind_ms as number, [0, 100], [74, 10])}`).join(' ')
              const pressure = detail.track.filter((point) => point.pressure_hpa != null).map((point) =>
                `${scaleLinear(Date.parse(point.time), timeDomain, [38, 318])},${scaleLinear(point.pressure_hpa as number, [850, 1050], [96, 162])}`).join(' ')
              return <g key={detail.id} className={hovered && hovered !== detail.id ? 'dimmed' : ''}>
                {wind && <polyline points={wind} stroke={EVENT_COLORS[index]} />}
                {pressure && <polyline points={pressure} stroke={EVENT_COLORS[index]} strokeDasharray="3 3" />}
              </g>
            })}
            <text x="3" y="44" className="axis-label">风速 m/s</text>
            <text x="3" y="132" className="axis-label">气压 hPa</text>
          </svg>
        </figure>

        <figure className="b-figure aligned-dotplot">
          <figcaption><strong>核心指标</strong><span>每行独立原始尺度</span></figcaption>
          {metrics.map((metric) => {
            const values = compared.map(metric.value)
            const maximum = Math.max(1, ...values.filter((value): value is number => value != null))
            return <div className="metric-row" key={metric.label}>
              <span>{metric.label}<small>{metric.unit}</small></span>
              <div>{compared.map((detail, index) => {
                const value = metric.value(detail)
                return value == null ? null : <i key={detail.id} className={hovered && hovered !== detail.id ? 'dimmed' : ''}
                  style={{ left: `${scaleLinear(value, [0, maximum], [2, 92])}%`, background: EVENT_COLORS[index] }}
                  title={`${detail.name}：${formatNumber(value, 1)} ${metric.unit}`}><b>{formatNumber(value, 1)}</b></i>
              })}</div>
            </div>
          })}
        </figure>

        <figure className="b-figure impact-bars">
          <figcaption><strong>灾害影响</strong><select value={impactKey} onChange={(event) => setImpactKey(event.target.value as ImpactKey)}>
            {Object.entries(IMPACT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></figcaption>
          {compared.map((detail, index) => {
            const value = detail.impact[impactKey]
            return <div key={detail.id} className={hovered && hovered !== detail.id ? 'dimmed' : ''}>
              <span>{detail.name}</span>
              <i style={{ width: value == null ? 0 : `${value / maxImpact * 100}%`, background: EVENT_COLORS[index] }} />
              <strong>{value == null ? '缺失' : formatCompact(value)}</strong>
            </div>
          })}
        </figure>
      </ComponentState>
      <p className="method-note">轨迹、气象指标、模型暴露与报告灾损分别比较，不生成综合排名；缺失字段保留空位。</p>
    </section>
  )
}

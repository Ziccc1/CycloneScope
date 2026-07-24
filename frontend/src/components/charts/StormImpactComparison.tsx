// Owner: B — complete hazard-to-impact comparison component.
import { useEffect, useMemo, useState } from 'react'
import { dataApi } from '../../api'
import { useAppDispatch } from '../../state/AppState'
import type { StormDetail, StormSummary } from '../../types/contracts'
import { BASIN_COLORS, ChartHeader, ComponentState, formatCompact, formatNumber, scaleLinear } from './chartUtils'

interface Props { storms: StormSummary[] }
type XMetric = 'max_wind_ms' | 'ace' | 'duration_hours'
type YMetric = 'estimated_exposed_population' | 'reported_deaths' | 'reported_affected_population' | 'reported_damage_usd_2024'

const X_OPTIONS: Record<XMetric, { label: string; unit: string }> = {
  max_wind_ms: { label: '最大风速', unit: 'm/s' },
  ace: { label: 'ACE', unit: '指数' },
  duration_hours: { label: '持续时间', unit: '小时' },
}
const Y_OPTIONS: Record<YMetric, { label: string; unit: string }> = {
  estimated_exposed_population: { label: '模型暴露人口', unit: '人' },
  reported_deaths: { label: '报告死亡', unit: '人' },
  reported_affected_population: { label: '报告受灾人口', unit: '人' },
  reported_damage_usd_2024: { label: '报告经济损失（2024 USD）', unit: '美元' },
}

export default function StormImpactComparison({ storms }: Props) {
  const dispatch = useAppDispatch()
  const [xMetric, setXMetric] = useState<XMetric>('max_wind_ms')
  const [yMetric, setYMetric] = useState<YMetric>('estimated_exposed_population')
  const [details, setDetails] = useState<Record<string, StormDetail>>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const candidates = storms.filter((storm) => storm.classic).slice(0, 20)
    if (!candidates.length) {
      setStatus('empty')
      setDetails({})
      return () => controller.abort()
    }
    setStatus('loading')
    Promise.allSettled(candidates.map((storm) => dataApi.storm(storm.id, controller.signal)))
      .then((results) => {
        if (controller.signal.aborted) return
        const next: Record<string, StormDetail> = {}
        results.forEach((result) => {
          if (result.status === 'fulfilled') next[result.value.id] = result.value
        })
        setDetails(next)
        setStatus(Object.keys(next).length ? 'ready' : 'error')
        if (!Object.keys(next).length) setError('经典事件详情均不可用')
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setStatus('error')
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => controller.abort()
  }, [storms])

  const points = useMemo(() => storms.filter((storm) => details[storm.id]).map((storm) => {
    const impact = details[storm.id].impact
    const x = storm[xMetric]
    const y = impact[yMetric]
    return { storm, x: typeof x === 'number' ? x : null, y: typeof y === 'number' ? y : null }
  }), [details, storms, xMetric, yMetric])
  const positioned = points.filter((item): item is typeof item & { x: number; y: number } => item.x != null && item.y != null && item.y > 0)
  const xValues = positioned.map((item) => item.x)
  const yValues = positioned.map((item) => Math.log10(item.y))
  const xDomain: [number, number] = [Math.min(0, ...xValues), Math.max(1, ...xValues)]
  const yDomain: [number, number] = yValues.length ? [Math.min(...yValues), Math.max(...yValues) || 1] : [0, 1]
  const ranked = [...points].filter((item) => item.y != null).sort((left, right) => (right.y ?? 0) - (left.y ?? 0))
  const maxRank = Math.max(1, ...ranked.map((item) => item.y ?? 0))

  return (
    <section className="b-component impact-comparison" data-owner="B">
      <ChartHeader eyebrow="HAZARD → IMPACT · B" title="全球事件影响比较" meta={<span>{positioned.length}/{points.length} 场可绘制</span>} />
      <div className="metric-switches">
        <label>横轴<select value={xMetric} onChange={(event) => setXMetric(event.target.value as XMetric)}>
          {Object.entries(X_OPTIONS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
        </select></label>
        <label>纵轴<select value={yMetric} onChange={(event) => setYMetric(event.target.value as YMetric)}>
          {Object.entries(Y_OPTIONS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
        </select></label>
      </div>
      <ComponentState status={status} error={error} empty="当前没有经典事件影响数据">
        <figure className="b-figure impact-scatter">
          <figcaption><strong>{X_OPTIONS[xMetric].label} × {Y_OPTIONS[yMetric].label}</strong><span>纵轴为对数尺度；未知值不进入坐标</span></figcaption>
          <svg viewBox="0 0 330 220" role="img" aria-label="气旋强度与灾害影响散点图">
            <line x1="42" x2="318" y1="188" y2="188" className="axis-line" />
            <line x1="42" x2="42" y1="14" y2="188" className="axis-line" />
            {positioned.map(({ storm, x, y }) => {
              const cx = scaleLinear(x, xDomain, [48, 310])
              const cy = scaleLinear(Math.log10(y), yDomain, [182, 20])
              return (
                <g key={storm.id} className="scatter-point" role="button" tabIndex={0}
                  onClick={() => dispatch({ type: 'select-storm', stormId: storm.id })}>
                  <circle cx={cx} cy={cy} r="6" fill={BASIN_COLORS[storm.basin] ?? '#62c3c9'}>
                    <title>{storm.name}（{storm.season}，{storm.basin}）&#10;{X_OPTIONS[xMetric].label}：{formatNumber(x, 1)} {X_OPTIONS[xMetric].unit}&#10;{Y_OPTIONS[yMetric].label}：{formatNumber(y)} {Y_OPTIONS[yMetric].unit}&#10;状态：{storm.data_status}&#10;来源：{storm.source_ids?.join('、') || '夹具'}</title>
                  </circle>
                  <text x={cx + 8} y={cy - 7}>{storm.name}</text>
                </g>
              )
            })}
            <text x="180" y="213" className="axis-label">{X_OPTIONS[xMetric].label}（{X_OPTIONS[xMetric].unit}）</text>
            <text x="10" y="108" className="axis-label" transform="rotate(-90 10 108)">log₁₀ {Y_OPTIONS[yMetric].label}</text>
          </svg>
          {!positioned.length && <div className="plot-empty">当前指标组合没有可比较的非零值</div>}
        </figure>
        <div className="impact-ranking" aria-label={`${Y_OPTIONS[yMetric].label}排序`}>
          {ranked.map(({ storm, y }) => (
            <button key={storm.id} type="button" onClick={() => dispatch({ type: 'select-storm', stormId: storm.id })}>
              <span>{storm.name}<small>{storm.season} · {storm.basin}</small></span>
              <i style={{ width: `${(y ?? 0) / maxRank * 100}%`, background: BASIN_COLORS[storm.basin] }} />
              <strong>{formatCompact(y)}</strong>
            </button>
          ))}
        </div>
      </ComponentState>
      <p className="method-note">模型暴露、报告死亡、受灾人口与经济损失分别展示，不合成总分；经济损失按接口注明的 2024 USD 口径显示，图中不添加未经统计检验的回归线。</p>
    </section>
  )
}

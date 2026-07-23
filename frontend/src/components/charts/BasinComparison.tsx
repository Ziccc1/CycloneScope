// Owner: B — complete multi-basin comparison component.
import { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { StormSummary } from '../../types/contracts'
import { BASIN_COLORS, ChartHeader, formatNumber, median, scaleLinear } from './chartUtils'

interface Props { storms: StormSummary[] }

export default function BasinComparison({ storms }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const available = useMemo<string[]>(() => [...new Set<string>(storms.map((storm) => storm.basin))].sort(), [storms])
  const [selected, setSelected] = useState<string[]>(() => {
    const initial = state.selectedBasin ? [state.selectedBasin] : []
    return [...new Set([...initial, ...available.slice(0, 3)])].slice(0, 3)
  })
  useEffect(() => {
    setSelected((current) => {
      const valid = current.filter((basin) => available.includes(basin))
      if (valid.length >= 2 || available.length < 2) return valid
      const preferred = state.selectedBasin ? [state.selectedBasin] : []
      return [...new Set([...preferred, ...valid, ...available])].slice(0, Math.min(3, available.length))
    })
  }, [available, state.selectedBasin])
  const scoped = useMemo(() => storms.filter((storm) =>
    storm.season >= state.selectedYearRange[0]
    && storm.season <= state.selectedYearRange[1]
    && (storm.max_wind_ms == null || storm.max_wind_ms >= state.minWindMs)), [storms, state.minWindMs, state.selectedYearRange])
  const rows = selected.map((basin) => {
    const items = scoped.filter((storm) => storm.basin === basin)
    const years = new Set(items.map((storm) => storm.season))
    const monthly = Array.from({ length: 12 }, (_, month) => items.filter((storm) => new Date(storm.start_time).getUTCMonth() === month).length)
    return {
      basin,
      count: items.length,
      monthly,
      annual: years.size ? items.length / years.size : null,
      wind: median(items.map((storm) => storm.max_wind_ms)),
      ace: median(items.map((storm) => storm.ace)),
      duration: median(items.map((storm) => storm.duration_hours)),
    }
  })
  const metrics = [
    { key: 'annual' as const, label: '年均事件', unit: '场/年' },
    { key: 'wind' as const, label: '最大风速中位数', unit: 'm/s' },
    { key: 'ace' as const, label: 'ACE 中位数', unit: '指数' },
    { key: 'duration' as const, label: '持续时间中位数', unit: '小时' },
  ]

  function toggleBasin(basin: string) {
    setSelected((current) => current.includes(basin)
      ? (current.length > 2 ? current.filter((item) => item !== basin) : current)
      : [...current, basin].slice(-4))
  }

  return (
    <section className="b-component basin-comparison" data-owner="B">
      <ChartHeader eyebrow="BASIN COMPARISON · B" title="全球海盆对比" meta={<span>{state.selectedYearRange.join('–')}</span>} />
      <div className="basin-picker" aria-label="选择二至四个海盆">
        {available.map((basin) => <button key={basin} type="button" aria-pressed={selected.includes(basin)} onClick={() => toggleBasin(basin)}>{basin}</button>)}
      </div>
      {!rows.length ? <div className="b-state empty-state">当前范围没有可比较海盆</div> : (
        <>
          <figure className="b-figure basin-heatmap">
            <figcaption><strong>季节结构</strong><span>各月占本海盆全年事件比例</span></figcaption>
            <div className="heatmap-grid">
              <span />
              {Array.from({ length: 12 }, (_, index) => <small key={index}>{index + 1}</small>)}
              {rows.flatMap((row) => {
                const maximum = Math.max(1, ...row.monthly)
                return [
                  <button key={`${row.basin}-label`} type="button" style={{ color: BASIN_COLORS[row.basin] }}
                    onClick={() => dispatch({ type: 'set-basin', basin: row.basin })}>{row.basin}</button>,
                  ...row.monthly.map((count, month) => (
                    <i key={`${row.basin}-${month}`} style={{ opacity: 0.12 + count / maximum * 0.88, background: BASIN_COLORS[row.basin] }}
                      title={`${row.basin} ${month + 1}月：${count} 场，占 ${row.count ? (count / row.count * 100).toFixed(1) : 0}%`} />
                  )),
                ]
              })}
            </div>
          </figure>
          <figure className="b-figure metric-dotplot">
            <figcaption><strong>海盆指标</strong><span>各指标保留原始单位，不计算总排名</span></figcaption>
            {metrics.map((metric) => {
              const values = rows.map((row) => row[metric.key])
              const valid = values.filter((value): value is number => value != null)
              const domain: [number, number] = [0, Math.max(1, ...valid)]
              return (
                <div className="metric-row" key={metric.key}>
                  <span>{metric.label}<small>{metric.unit}</small></span>
                  <div>
                    {rows.map((row) => row[metric.key] == null ? null : (
                      <i key={row.basin} style={{ left: `${scaleLinear(row[metric.key] as number, domain, [2, 94])}%`, background: BASIN_COLORS[row.basin] }}
                        title={`${row.basin}：${formatNumber(row[metric.key], 1)} ${metric.unit}`}><b>{row.basin}</b></i>
                    ))}
                  </div>
                </div>
              )
            })}
          </figure>
          <p className="method-note">热力图使用海盆内部比例；样本数：{rows.map((row) => `${row.basin} ${row.count}`).join(' · ')}。样本量差异不等同于发生概率差异。</p>
        </>
      )}
    </section>
  )
}

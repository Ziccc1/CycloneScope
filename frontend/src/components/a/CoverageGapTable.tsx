/**
 * Component owner: A
 * Administrative-zone gap table that keeps the selected scenario view explicit.
 */
import { useMemo, useState } from 'react'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { RegionalRiskAnalysis, RiskZoneMetric } from './riskAnalysis'

interface Props { analysis: RegionalRiskAnalysis | null }
type SortKey = 'uncovered' | 'coverage' | 'hazard' | 'exposed'

function valueFor(zone: RiskZoneMetric, view: 'baseline' | 'current', key: SortKey) {
  const covered = view === 'baseline' ? zone.baselineCovered : zone.currentCovered
  const uncovered = view === 'baseline' ? zone.baselineUncovered : zone.currentUncovered
  if (key === 'hazard') return zone.hazard
  if (key === 'exposed') return zone.exposed
  if (key === 'coverage') return zone.exposed && covered != null ? covered / zone.exposed : null
  return uncovered
}
function number(value: number | null) { return value == null ? '—' : Math.round(value).toLocaleString('zh-CN') }

export default function CoverageGapTable({ analysis }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [sort, setSort] = useState<SortKey>('uncovered')
  const view = state.scenarioView
  const rows = useMemo(() => {
    if (!analysis) return []
    return [...analysis.zones]
      .filter((zone) => zone.hazard != null && zone.exposed != null)
      .sort((left, right) => (valueFor(right, view, sort) ?? -Infinity) - (valueFor(left, view, sort) ?? -Infinity))
  }, [analysis, sort, view])
  if (!analysis) return <div className="a-empty">暂无行政区缺口数据</div>
  return (
    <div className="coverage-gap-table">
      <div className="gap-table-context">
        <span>{view === 'baseline' ? '历史基线' : '当前方案'}</span>
        <span>人口参考年：{analysis.populationYear ?? '未知'}</span>
        <span>方法：约 2.5 km 需求格点 + 距离衰减</span>
      </div>
      <div className="gap-table-sort" role="group" aria-label="缺口表排序">
        <span>排序：</span>
        {([
          ['uncovered', '未覆盖人口'], ['coverage', '覆盖率'], ['hazard', '危险度'], ['exposed', '暴露人口'],
        ] as Array<[SortKey, string]>).map(([key, label]) => (
          <button type="button" className={sort === key ? 'active' : ''} key={key} onClick={() => setSort(key)}>{label}</button>
        ))}
      </div>
      <div className="gap-table-scroll">
        <table>
          <thead><tr><th>行政区</th><th>高风险人口</th><th>已覆盖</th><th>未覆盖</th><th>覆盖率</th><th>危险度</th></tr></thead>
          <tbody>
            {rows.map((zone) => {
              const covered = view === 'baseline' ? zone.baselineCovered : zone.currentCovered
              const uncovered = view === 'baseline' ? zone.baselineUncovered : zone.currentUncovered
              const coverage = valueFor(zone, view, 'coverage')
              return (
                <tr key={zone.zoneId} className={state.selectedZoneId === zone.zoneId ? 'selected' : ''} onClick={() => dispatch({ type: 'set-zone', zoneId: zone.zoneId })}>
                  <th>{zone.name}</th><td>{number(zone.exposed)} 人</td><td>{number(covered)} 人</td><td className="gap-value">{number(uncovered)} 人</td>
                  <td>{coverage == null ? '—' : (coverage * 100).toFixed(1) + '%'}</td><td>{zone.hazard == null ? '—' : zone.hazard.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="a-method-note">行政区值由内部需求格点汇总；影响网格缺少人口时，按行政区总人口均匀分配，具体限制见“数据可信度”。</p>
    </div>
  )
}

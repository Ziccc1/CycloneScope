/**
 * Component owner: A
 * Sortable administrative-zone risk ranking with shared zone selection.
 */
import { useMemo, useState } from 'react'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { RegionalRiskAnalysis, RiskZoneMetric } from './riskAnalysis'

type RankingMode = 'hazard' | 'exposed' | 'uncovered' | 'coverage'

interface Props {
  analysis: RegionalRiskAnalysis | null
  status: 'loading' | 'ready' | 'empty' | 'error'
  error: string
}

const modes: Array<{ value: RankingMode; label: string }> = [
  { value: 'hazard', label: '危险度' },
  { value: 'exposed', label: '暴露人口' },
  { value: 'uncovered', label: '未覆盖' },
  { value: 'coverage', label: '覆盖率' },
]

function rawValue(zone: RiskZoneMetric, mode: RankingMode, view: 'baseline' | 'current') {
  if (mode === 'hazard') return zone.hazard
  if (mode === 'exposed') return zone.exposed
  const covered = view === 'baseline' ? zone.baselineCovered : zone.currentCovered
  const uncovered = view === 'baseline' ? zone.baselineUncovered : zone.currentUncovered
  if (mode === 'uncovered') return uncovered
  if (zone.exposed == null || covered == null || zone.exposed === 0) return null
  return covered / zone.exposed
}

function formatValue(value: number, mode: RankingMode) {
  if (mode === 'hazard') return value.toFixed(2)
  if (mode === 'coverage') return (value * 100).toFixed(1) + '%'
  return Math.round(value).toLocaleString('zh-CN') + ' 人'
}

export default function ZoneRiskRanking({ analysis, status, error }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [mode, setMode] = useState<RankingMode>('hazard')
  const [expanded, setExpanded] = useState(false)

  const ranking = useMemo(() => {
    if (!analysis) return { items: [] as RiskZoneMetric[], excluded: 0, maximum: 1 }
    const valid = analysis.zones
      .filter((zone) => rawValue(zone, mode, state.scenarioView) != null)
      .sort((left, right) =>
        (rawValue(right, mode, state.scenarioView) ?? -Infinity)
        - (rawValue(left, mode, state.scenarioView) ?? -Infinity))
    return {
      items: expanded ? valid : valid.slice(0, 10),
      excluded: analysis.zones.length - valid.length,
      maximum: Math.max(1, ...valid.map((zone) => rawValue(zone, mode, state.scenarioView) ?? 0)),
    }
  }, [analysis, expanded, mode, state.scenarioView])

  if (status === 'loading') return <div className="a-skeleton ranking-skeleton" aria-label="正在加载行政区排名" />
  if (status === 'error') return <div className="a-error">排名加载失败：{error}</div>
  if (!analysis || status === 'empty') return <div className="a-empty">缺少行政区或影响网格，暂时无法生成排名。</div>

  const selectedOutside = analysis.zones.find((zone) =>
    zone.zoneId === state.selectedZoneId && !ranking.items.some((item) => item.zoneId === zone.zoneId))

  return (
    <div className="zone-ranking">
      <div className="a-segmented" role="group" aria-label="排名指标">
        {modes.map((item) => (
          <button
            type="button"
            key={item.value}
            aria-pressed={mode === item.value}
            onClick={() => setMode(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="ranking-context">
        <span>{state.scenarioView === 'baseline' ? '历史基线' : '当前方案'}</span>
        <span>高风险阈值 ≥ {state.hazardThreshold.toFixed(2)}</span>
      </div>
      <ol className="ranking-list">
        {ranking.items.map((zone, index) => {
          const value = rawValue(zone, mode, state.scenarioView)!
          return (
            <li key={zone.zoneId}>
              <button
                type="button"
                className={state.selectedZoneId === zone.zoneId ? 'selected' : ''}
                onClick={() => dispatch({
                  type: 'set-zone',
                  zoneId: state.selectedZoneId === zone.zoneId ? null : zone.zoneId,
                })}
              >
                <span className="rank-number">{index + 1}</span>
                <span className="rank-name">{zone.name}</span>
                <span className="rank-bar"><i style={{ width: (value / ranking.maximum * 100) + '%' }} /></span>
                <strong>{formatValue(value, mode)}</strong>
              </button>
            </li>
          )
        })}
      </ol>
      {selectedOutside && (
        <button
          type="button"
          className="ranking-pinned"
          onClick={() => dispatch({ type: 'set-zone', zoneId: selectedOutside.zoneId })}
        >
          <span>已选区域</span>
          <strong>{selectedOutside.name}</strong>
          <small>
            {rawValue(selectedOutside, mode, state.scenarioView) == null
              ? '该指标缺测'
              : formatValue(rawValue(selectedOutside, mode, state.scenarioView)!, mode)}
          </small>
        </button>
      )}
      <div className="ranking-footer">
        <span>
          {ranking.excluded
            ? '已排除缺测行政区 ' + ranking.excluded + ' 个'
            : '所有行政区均有可比数据'}
        </span>
        {analysis.zones.length > 10 && (
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? '收起' : '查看全部'}
          </button>
        )}
      </div>
      <details className="a-definition">
        <summary>口径与缺测处理</summary>
        <p>危险度和暴露人口来自行政区质心所在影响网格；覆盖指标随基线/当前方案切换。缺测值不参与排序，也不会被当作零值。</p>
        <p>{analysis.method}</p>
      </details>
    </div>
  )
}

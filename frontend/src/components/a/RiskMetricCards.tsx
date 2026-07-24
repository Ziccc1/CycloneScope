/**
 * Component owner: A
 * Traceable risk summary cards for the active event, threshold and facility type.
 */
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { RegionalRiskAnalysis, RiskZoneMetric } from './riskAnalysis'

interface Props {
  analysis: RegionalRiskAnalysis | null
  status: 'loading' | 'ready' | 'empty' | 'error'
  error: string
}

function compact(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

export default function RiskMetricCards({ analysis, status, error }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()

  if (status === 'loading') {
    return <div className="risk-card-grid">{Array.from({ length: 8 }, (_, index) => <i className="a-skeleton risk-card-skeleton" key={index} />)}</div>
  }
  if (status === 'error') return <div className="a-error">风险指标加载失败：{error}</div>
  if (!analysis || status === 'empty') return <div className="a-empty">请选择具有影响网格的气旋以生成风险指标。</div>

  const summary = state.scenarioView === 'baseline' ? analysis.baseline : analysis.current
  const gapZone = analysis.zones.reduce<RiskZoneMetric | null>((best, zone) => {
    const value = state.scenarioView === 'baseline' ? zone.baselineUncovered : zone.currentUncovered
    if (value == null) return best
    const bestValue = best == null ? null : (state.scenarioView === 'baseline' ? best.baselineUncovered : best.currentUncovered)
    return best == null || bestValue == null || value > bestValue ? zone : best
  }, null)
  const cards: Array<{
    label: string
    value: string
    detail: string
    tone: string
    zone?: RiskZoneMetric | null
    progress?: number
  }> = [
    {
      label: '高风险人口',
      value: compact(summary.highRiskPopulation),
      detail: summary.highRiskPopulation.toLocaleString('zh-CN') + ' 人',
      tone: 'hazard',
    },
    {
      label: '设施覆盖人口',
      value: compact(summary.covered),
      detail: summary.covered.toLocaleString('zh-CN') + ' 人',
      tone: 'covered',
    },
    {
      label: '未覆盖风险人口',
      value: compact(summary.uncovered),
      detail: summary.uncovered.toLocaleString('zh-CN') + ' 人',
      tone: 'gap',
    },
    {
      label: '风险覆盖率',
      value: (summary.coverageRatio * 100).toFixed(1) + '%',
      detail: state.selectedFacilityType + ' · ' + (state.scenarioView === 'baseline' ? '历史基线' : '当前方案'),
      tone: 'covered',
      progress: summary.coverageRatio,
    },
    {
      label: '危险度最高行政区',
      value: analysis.highestHazardZone?.name ?? '暂无',
      detail: analysis.highestHazardZone?.hazard == null ? '危险度缺测' : '危险度 ' + analysis.highestHazardZone.hazard.toFixed(2),
      tone: 'hazard',
      zone: analysis.highestHazardZone,
    },
    {
      label: '暴露人口最多行政区',
      value: analysis.highestExposureZone?.name ?? '暂无',
      detail: analysis.highestExposureZone?.exposed == null ? '暴露人口缺测' : analysis.highestExposureZone.exposed.toLocaleString('zh-CN') + ' 人',
      tone: 'exposure',
      zone: analysis.highestExposureZone,
    },
    {
      label: '覆盖缺口最大行政区',
      value: analysis.largestGapZone?.name ?? '暂无',
      detail: gapZone == null ? '未覆盖人口缺测' : ((state.scenarioView === 'baseline' ? gapZone.baselineUncovered : gapZone.currentUncovered) ?? 0).toLocaleString('zh-CN') + ' 人未覆盖',
      tone: 'gap',
      zone: gapZone,
    },
    {
      label: '高风险判定阈值',
      value: '≥ ' + state.hazardThreshold.toFixed(2),
      detail: summary.highRiskZoneCount + ' 个行政区达到阈值',
      tone: 'threshold',
    },
  ]

  return (
    <div className="risk-metric-cards">
      <div className="risk-card-grid">
        {cards.map((card) => {
          const selectable = Boolean(card.zone)
          const selected = card.zone?.zoneId === state.selectedZoneId
          const content = (
            <>
              <span>{card.label}</span>
              <strong title={card.detail}>{card.value}</strong>
              <small>{card.detail}</small>
              {card.progress != null && <i className="risk-card-progress"><b style={{ width: (card.progress * 100) + '%' }} /></i>}
            </>
          )
          return selectable ? (
            <button
              type="button"
              key={card.label}
              className={'risk-card ' + card.tone + (selected ? ' selected' : '')}
              onClick={() => dispatch({
                type: 'set-zone',
                zoneId: selected ? null : card.zone!.zoneId,
              })}
            >
              {content}
            </button>
          ) : (
            <article key={card.label} className={'risk-card ' + card.tone}>{content}</article>
          )
        })}
      </div>
      <label className="threshold-control">
        <span>危险度阈值</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.hazardThreshold}
          onChange={(event) => dispatch({ type: 'set-hazard-threshold', value: Number(event.target.value) })}
        />
        <output>{state.hazardThreshold.toFixed(2)}</output>
      </label>
      <p className="a-method-note">
        气旋：{state.selectedStormId ?? '未选择'} · 指标：{state.impactMetric} · 设施：{state.selectedFacilityType} · {analysis.method}
      </p>
    </div>
  )
}

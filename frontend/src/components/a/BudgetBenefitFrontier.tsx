import { useAppDispatch } from '../../state/AppState'
import type { ScenarioDetail } from '../../types/contracts'
import type { RegionalRiskAnalysis } from './riskAnalysis'

const facilityNames: Record<string, string> = {
  shelter: '避难所',
  medical: '医疗',
  rescue: '救援',
  warehouse: '物资',
}

function formatDeltaPoints(value: number) {
  const digits = value !== 0 && Math.abs(value) < 0.001
    ? 5
    : value !== 0 && Math.abs(value) < 0.01 ? 3 : 2
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)} 个百分点`
}
export default function BudgetBenefitFrontier({
  analysis,
  scenario,
}: {
  analysis: RegionalRiskAnalysis | null
  scenario: ScenarioDetail | null
}) {
  const dispatch = useAppDispatch()

  if (!analysis) {
    return <div className="a-empty">选择情景并添加模拟设施后查看方案收益。</div>
  }

  const baselineGap = analysis.baseline.uncovered
  const currentGap = analysis.current.uncovered
  const reduced = Math.max(0, baselineGap - currentGap)
  const coverageDeltaPoints = (analysis.current.coverageRatio - analysis.baseline.coverageRatio) * 100
  const budget = analysis.current.budgetPoints
  const marginal = budget > 0 ? reduced / budget : 0
  const improvedZones = analysis.zones
    .filter((zone) => (
      zone.baselineUncovered != null
      && zone.currentUncovered != null
      && zone.currentUncovered < zone.baselineUncovered
    ))
    .sort((left, right) => (
      (right.baselineUncovered! - right.currentUncovered!)
      - (left.baselineUncovered! - left.currentUncovered!)
    ))
  const topZone = improvedZones[0]
  const facilities = scenario?.facilities ?? []
  const plans = analysis.budgetPlans

  return (
    <div className="budget-frontier">
      <div className="budget-cards">
        <div><span>预算消耗</span><strong>{budget} 点</strong></div>
        <div><span>未覆盖人口减少</span><strong>{reduced.toLocaleString('zh-CN')} 人</strong></div>
        <div><span>覆盖率变化</span><strong>{formatDeltaPoints(coverageDeltaPoints)}</strong></div>
        <div><span>每预算点收益</span><strong>{marginal.toFixed(1)} 人/点</strong></div>
      </div>

      <div className="frontier-plans">
        <div className="frontier-plans-heading"><strong>候选方案收益比较</strong><span>同一预算：3 点 · 模拟容量：500 人 · 服务半径：5 km</span></div>
        {plans.map((plan) => {
          const gain = Math.max(0, analysis.baseline.uncovered - plan.summary.uncovered)
          const delta = (plan.summary.coverageRatio - analysis.baseline.coverageRatio) * 100
          return <button type="button" key={plan.id} onClick={() => {
            const zone = analysis.zones.find((item) => item.name === plan.targetZone)
            if (zone) dispatch({ type: 'set-zone', zoneId: zone.zoneId })
          }}>
            <span>{plan.label}</span><strong>{gain.toLocaleString('zh-CN')} 人</strong><small>覆盖率 {formatDeltaPoints(delta)} · 目标：{plan.targetZone ?? '—'}</small>
          </button>
        })}
      </div>

      {facilities.length === 0 ? (
        <p className="a-empty compact">当前情景没有模拟设施，尚未产生方案收益。</p>
      ) : (
        <>
          <div className="budget-impact-summary">
            <div><span>局部改善行政区</span><strong>{improvedZones.length} 个</strong></div>
            <div><span>受益最大区域</span><strong>{topZone?.name ?? '暂无'}</strong></div>
            <div><span>该区域缺口减少</span><strong>{topZone ? (topZone.baselineUncovered! - topZone.currentUncovered!).toLocaleString('zh-CN') + ' 人' : '0 人'}</strong></div>
            {topZone && <button type="button" className="budget-focus-button" onClick={() => dispatch({ type: 'set-zone', zoneId: topZone.zoneId })}>定位受益区域</button>}
          </div>
          <div className="budget-facilities">
            {facilities.map((facility) => (
              <div key={facility.id}>
                <span>{facilityNames[facility.type] ?? facility.type}</span>
                <strong>{facility.budget_points ?? 0} 点</strong>
                <small>{facility.capacity_value ?? '—'} {facility.capacity_unit ?? ''} · 半径 {facility.service_radius_km ?? 0} km</small>
              </div>
            ))}
          </div>
          {reduced === 0 && (
            <p className="a-empty compact">设施已添加，但服务圈内没有达到阈值的高风险需求格点。可移动设施位置、调整半径，或检查当前危险度阈值。</p>
          )}
        </>
      )}
      <p className="a-method-note">收益是当前方案相对真实设施基线的差值；结果由约 2.5 km 需求格点汇总到行政区，不代表道路条件下的全局最优选址。</p>
    </div>
  )
}
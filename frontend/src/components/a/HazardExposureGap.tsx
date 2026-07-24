import type { RegionalRiskAnalysis } from './riskAnalysis'

export default function HazardExposureGap({ analysis }: { analysis: RegionalRiskAnalysis | null }) {
  if (!analysis) return <div className="a-empty">等待危险与暴露数据。</div>
  const hazard = analysis.highestHazardZone?.hazard
  const exposure = analysis.current.highRiskPopulation
  const gap = analysis.current.uncovered
  const blind = analysis.current.blindSpotCount
  const stages = [
    { label: '自然危险', value: hazard == null ? '缺测' : hazard.toFixed(2), note: analysis.highestHazardZone?.name ?? '无高风险区' },
    { label: '人口暴露', value: exposure.toLocaleString('zh-CN') + ' 人', note: `人口年份 ${analysis.populationYear ?? '未知'}` },
    { label: '设施覆盖', value: analysis.current.covered.toLocaleString('zh-CN') + ' 人', note: `覆盖率 ${(analysis.current.coverageRatio * 100).toFixed(1)}%` },
    { label: '服务缺口', value: gap.toLocaleString('zh-CN') + ' 人', note: `盲区 ${blind} 个` },
  ]
  return <div className="hazard-exposure-gap">
    <p className="a-method-note">从模型危险度到人口暴露，再到设施覆盖缺口；这是分析链路，不等同于历史灾损复原。</p>
    <div className="narrative-chain" aria-label="危险暴露缺口分析链">
      {stages.map((stage, index) => <div className="narrative-chain-stage" key={stage.label}>
        <span>{stage.label}</span><strong>{stage.value}</strong><small>{stage.note}</small>
        {index < stages.length - 1 && <i aria-hidden="true">→</i>}
      </div>)}
    </div>
  </div>
}

import type { StormSummary } from '../../types/contracts'
import type { RegionalRiskAnalysis } from './riskAnalysis'

export default function NarrativeEvidenceCard({ analysis, storm }: { analysis: RegionalRiskAnalysis | null; storm: StormSummary | null }) {
  const zone = analysis?.highestHazardZone
  const gap = analysis?.largestGapZone
  return <div className="evidence-card">
    <div><span>当前问题</span><strong>{zone ? `哪个区域最需要优先关注？` : '需要先选择有影响网格的气旋。'}</strong></div>
    <div><span>证据</span><p>{zone ? `${zone.name} 危险度 ${(zone.hazard ?? 0).toFixed(2)}；当前高风险人口 ${(analysis?.current.highRiskPopulation ?? 0).toLocaleString('zh-CN')} 人；最大缺口区域 ${gap?.name ?? '未识别'}。` : '暂无可引用指标。'}</p></div>
    <div><span>限制</span><p>{storm ? `历史事件 ${storm.season} 与当前人口/设施层不是同一时间截面；缺失字段和人口代理值必须保留。` : '暂无事件上下文。'}</p></div>
    <div><span>下一步</span><strong>进入设施情景，比较同预算下的覆盖变化。</strong></div>
  </div>
}

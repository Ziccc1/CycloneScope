import type { DataSourceListResponse, HealthResponse, StormSummary } from '../../types/contracts'
import type { RegionalRiskAnalysis } from './riskAnalysis'

function statusLabel(value: string | undefined) {
  return ({ observed: '观测', reanalysis: '再分析', modeled: '模型结果', mixed: '混合来源', reported: '灾情报告' } as Record<string, string>)[value ?? ''] ?? value ?? '未知'
}

export default function DataConfidenceLayer({ storm, sources, health, analysis }: { storm: StormSummary | null; sources: DataSourceListResponse | null; health: HealthResponse | null; analysis: RegionalRiskAnalysis | null }) {
  const rows = [
    { label: '气旋轨迹', source: sources?.items.find((item) => item.id === 'ibtracs')?.name ?? 'IBTrACS', year: storm?.season ?? '未知', status: statusLabel(storm?.data_status), missing: '—' },
    { label: '风场/危险度', source: sources?.items.find((item) => item.id === 'era5')?.name ?? 'ERA5', year: storm?.season ?? '未知', status: '再分析', missing: analysis ? `${analysis.missingHazardCount} 个行政区` : '未知' },
    { label: '人口暴露', source: '台湾人口处理层', year: analysis?.populationYear ?? '未知', status: analysis ? (analysis.exposureProxyCount > 0 ? '人口代理' : analysis.missingExposureCount > 0 ? '缺失' : '模型结果') : '未知', missing: analysis ? `${analysis.exposureProxyCount} 个行政区使用人口代理；${analysis.missingExposureCount} 个行政区缺测` : '未知' },
    { label: '设施基线', source: '台湾设施开放数据', year: '当前层', status: '混合来源', missing: analysis ? `${analysis.baseline.facilityCount} 个设施` : '未知' },
  ]
  return <div className="confidence-layer">
    <div className="confidence-summary"><span>运行模式：{health?.data_mode === 'processed' ? '处理数据' : '演示数据'}</span><span>来源登记：{sources?.count ?? 0} 个</span></div>
    <div className="confidence-table" role="table" aria-label="数据可信度与来源">
      {rows.map((row) => <div className="confidence-row" role="row" key={row.label}><strong>{row.label}</strong><span>{row.source}</span><span>{row.year}</span><em className={'confidence-' + row.status}>{row.status}</em><small>缺失/备注：{row.missing}</small></div>)}
    </div>
    <p className="a-method-note">“人口代理”表示影响网格缺少暴露人口时使用行政区人口估计，不能解释为真实受灾人口。</p>
  </div>
}

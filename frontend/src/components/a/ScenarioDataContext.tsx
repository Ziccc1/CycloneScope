/**
 * Component owner: A
 * Makes the historical-hazard/current-exposure time mismatch explicit.
 */
import { useState } from 'react'
import type {
  DataSourceListResponse,
  HealthResponse,
  StormSummary,
} from '../../types/contracts'
import type { RegionalRiskAnalysis } from './riskAnalysis'

interface Props {
  storm: StormSummary | null
  sources: DataSourceListResponse | null
  health: HealthResponse | null
  analysis: RegionalRiskAnalysis | null
}

const statusLabels: Record<string, string> = {
  observed: '观测',
  reanalysis: '再分析',
  reported: '灾情报告',
  modeled: '模型结果',
  mixed: '混合来源',
  synthetic_fixture: '演示夹具',
  synthetic_demo: '演示数据',
}

export default function ScenarioDataContext({ storm, sources, health, analysis }: Props) {
  const [expanded, setExpanded] = useState(false)
  const trackSource = sources?.items.find((item) => item.id === 'ibtracs')
  const windSource = sources?.items.find((item) => item.id === 'era5')
  const populationSource = sources?.items.find((item) =>
    item.id === 'taiwan-population' || item.id === 'worldpop')
  const facilitySources = sources?.items.filter((item) =>
    item.id.startsWith('taiwan-') && ['taiwan-shelters', 'taiwan-medical', 'taiwan-rescue'].includes(item.id))

  if (!storm) {
    return <div className="a-empty">请先选择一场具有台湾影响网格的气旋。</div>
  }

  return (
    <div className="scenario-context">
      <div className="context-timeline" aria-label="数据时间背景">
        <div>
          <span>历史气旋</span>
          <strong>{storm.season}</strong>
          <small>{statusLabels[storm.data_status] ?? storm.data_status}</small>
        </div>
        <i>→</i>
        <div>
          <span>人口口径</span>
          <strong>{analysis?.populationYear ?? '年份未知'}</strong>
          <small>当前暴露层</small>
        </div>
        <i>→</i>
        <div>
          <span>设施方案</span>
          <strong>当前状态</strong>
          <small>真实 + 模拟</small>
        </div>
      </div>
      <div className="context-summary">
        <span>事件窗口：{storm.start_time.slice(0, 10)}—{storm.end_time.slice(0, 10)}</span>
        <span>数据模式：{health?.data_mode === 'processed' ? '离线处理数据' : '演示夹具'}</span>
      </div>
      <div className="context-warning">
        历史气旋危险度、当前人口暴露和当前设施并非同一时间截面。本页用于方案探索，不应把组合结果解释为真实历史灾情复原。
      </div>
      <button
        type="button"
        className="context-expand"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? '收起来源说明' : '展开来源说明'}
      </button>
      {expanded && (
        <div className="context-details">
          <article>
            <span className="context-kind">历史层 · 轨迹/风场</span>
            <strong>{trackSource?.name ?? '轨迹来源未登记'}</strong>
            <p>{trackSource?.purpose ?? '提供气旋轨迹、强度与时间序列。'}</p>
            <small>风场：{windSource?.name ?? 'ERA5 或离线风场'}；以来源元数据为准。</small>
          </article>
          <article>
            <span className="context-kind">暴露层 · 人口数据</span>
            <strong>{populationSource?.name ?? '人口来源未登记'}</strong>
            <p>{populationSource?.purpose ?? '为行政区提供人口与暴露估算。'}</p>
            <small>人口年份可能晚于气旋发生年份，卡片会显示实际年份。</small>
          </article>
          <article>
            <span className="context-kind">方案层 · 设施数据</span>
            <strong>{facilitySources?.map((source) => source.name).join('、') || '设施来源未登记'}</strong>
            <p>真实设施构成基线，当前情景中的模拟设施叠加为方案。</p>
            <small>可达性由细网格、球面距离、距离衰减与容量口径推导；缺少道路封闭数据，不等同于真实疏散路径。</small>
          </article>
        </div>
      )}
    </div>
  )
}

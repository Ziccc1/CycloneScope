/**
 * Component owner: A
 * Mutually exclusive covered/out-of-range/capacity-shortfall composition.
 */
import { useAppDispatch, useAppState, type FacilityAnalysisType } from '../../state/AppState'
import type { CoverageSummary, RegionalRiskAnalysis } from './riskAnalysis'

interface Props {
  analysis: RegionalRiskAnalysis | null
  status: 'loading' | 'ready' | 'empty' | 'error'
  error: string
}

const facilityLabels: Record<FacilityAnalysisType, string> = {
  shelter: '避难所',
  medical: '医疗',
  rescue: '救援',
}

function percent(value: number, total: number) {
  return total ? value / total * 100 : 0
}

function BreakdownBar({ label, summary, capacityComparable }: {
  label: string
  summary: CoverageSummary
  capacityComparable: boolean
}) {
  const segments = [
    { key: 'covered', label: '已覆盖', value: summary.covered },
    { key: 'outside', label: '服务范围外', value: summary.outsideRange },
    ...(capacityComparable
      ? [{ key: 'capacity', label: '容量不足', value: summary.capacityShortfall ?? 0 }]
      : []),
  ]
  return (
    <div className="coverage-row">
      <div className="coverage-row-heading">
        <strong>{label}</strong>
        <span>总暴露 {summary.highRiskPopulation.toLocaleString('zh-CN')} 人</span>
      </div>
      <div className="coverage-stack" aria-label={label + '覆盖构成'}>
        {segments.map((segment) => (
          <i
            key={segment.key}
            className={'coverage-' + segment.key}
            style={{ width: percent(segment.value, summary.highRiskPopulation) + '%' }}
            title={segment.label + '：' + segment.value.toLocaleString('zh-CN') + ' 人'}
          />
        ))}
      </div>
      <div className="coverage-labels">
        {segments.map((segment) => (
          <span key={segment.key}>
            <i className={'coverage-' + segment.key} />
            {segment.label}
            <strong>{segment.value.toLocaleString('zh-CN')}</strong>
            <small>{percent(segment.value, summary.highRiskPopulation).toFixed(1)}%</small>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function CoverageBreakdown({ analysis, status, error }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()

  if (status === 'loading') return <div className="a-skeleton coverage-skeleton" aria-label="正在计算设施覆盖" />
  if (status === 'error') return <div className="a-error">覆盖分析失败：{error}</div>
  if (!analysis || status === 'empty') return <div className="a-empty">请选择具有影响网格的气旋以分析设施覆盖。</div>

  return (
    <div className="coverage-breakdown">
      <div className="a-segmented facility-switch" role="group" aria-label="设施类型">
        {(Object.keys(facilityLabels) as FacilityAnalysisType[]).map((type) => (
          <button
            type="button"
            key={type}
            aria-pressed={state.selectedFacilityType === type}
            onClick={() => dispatch({ type: 'set-facility-type', value: type })}
          >
            {facilityLabels[type]}
          </button>
        ))}
      </div>
      <div className="coverage-method">
        <span>{analysis.capacityComparable ? '避难容量按 people 计' : '仅计算服务范围'}</span>
        <small>{analysis.capacityComparable ? '容量不足单独列出' : '医疗与救援容量不跨单位换算'}</small>
      </div>
      <BreakdownBar label="基线 · 真实设施" summary={analysis.baseline} capacityComparable={analysis.capacityComparable} />
      <BreakdownBar label="当前 · 含模拟设施" summary={analysis.current} capacityComparable={analysis.capacityComparable} />
      <div className="coverage-delta" aria-label="覆盖变化">
        <strong>方案相对基线的变化</strong>
        <span>已覆盖 <b className="better">+{(analysis.current.covered - analysis.baseline.covered).toLocaleString('zh-CN')} 人</b></span>
        <span>容量不足 <b className="better">{((analysis.current.capacityShortfall ?? 0) - (analysis.baseline.capacityShortfall ?? 0)).toLocaleString('zh-CN')} 人</b></span>
        <span>服务范围外 <b>{(analysis.current.outsideRange - analysis.baseline.outsideRange).toLocaleString('zh-CN')} 人</b></span>
      </div>
    </div>
  )
}

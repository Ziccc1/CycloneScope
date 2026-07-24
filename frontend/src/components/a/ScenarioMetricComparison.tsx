/**
 * Component owner: A
 * Baseline/current scenario metrics with view switching and recoverable reset.
 */
import { useState } from 'react'
import { scenarioApi } from '../../api'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { ScenarioDetail } from '../../types/contracts'
import type { RegionalRiskAnalysis } from './riskAnalysis'

interface Props {
  analysis: RegionalRiskAnalysis | null
  scenario: ScenarioDetail | null
  status: 'loading' | 'ready' | 'empty' | 'error'
  error: string
  onRefresh: () => void
}

interface MetricRow {
  label: string
  baseline: number | null
  current: number | null
  format: (value: number | null) => string
  lowerIsBetter?: boolean
  neutral?: boolean
}

function changeTone(row: MetricRow) {
  if (row.baseline == null || row.current == null || row.current === row.baseline || row.neutral) return 'neutral'
  const improved = row.lowerIsBetter
    ? row.current < row.baseline
    : row.current > row.baseline
  return improved ? 'better' : 'worse'
}

function formatPercent(value: number | null) {
  if (value == null) return '—'
  const percentage = value * 100
  const digits = percentage !== 0 && Math.abs(percentage) < 0.001
    ? 5
    : percentage !== 0 && Math.abs(percentage) < 0.01 ? 3 : 2
  return percentage.toFixed(digits) + '%'
}
const facilityTypeLabels = { shelter: '避难所', medical: '医疗', rescue: '救援' } as const
const capacityMetricLabels = { shelter: '容量利用率', medical: '医疗床位数', rescue: '救援队伍数' } as const
const capacityUnitLabels: Record<string, string> = { people: '人', beds: '张', teams: '支', people_day: '人·日' }
export default function ScenarioMetricComparison({
  analysis,
  scenario,
  status,
  error,
  onRefresh,
}: Props) {
  const dispatch = useAppDispatch()
  const state = useAppState()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (status === 'loading') return <div className="a-skeleton scenario-comparison-skeleton" aria-label="正在计算方案对比" />
  if (status === 'error') return <div className="a-error">方案对比失败：{error}</div>
  if (!analysis || status === 'empty') return <div className="a-empty">缺少影响网格，暂时无法比较方案。</div>
  if (!scenario) return <div className="a-empty">请先在上方选择或创建一个情景，再比较基线与方案。</div>

  const facilityTypeLabel = facilityTypeLabels[state.selectedFacilityType]
  const capacityUnit = capacityUnitLabels[analysis.current.capacityUnit ?? analysis.baseline.capacityUnit ?? ''] ?? ''
  const capacityRow: MetricRow = analysis.capacityComparable
    ? {
        label: capacityMetricLabels[state.selectedFacilityType],
        baseline: analysis.baseline.capacityUtilization,
        current: analysis.current.capacityUtilization,
        format: (value) => value == null ? '不适用' : (value * 100).toFixed(2) + '%',
      }
    : {
        label: capacityMetricLabels[state.selectedFacilityType],
        baseline: analysis.baseline.capacityValue,
        current: analysis.current.capacityValue,
        format: (value) => value == null ? '—' : Math.round(value).toLocaleString('zh-CN') + ' ' + capacityUnit,
      }
  const rows: MetricRow[] = [
    {
      label: state.selectedFacilityType === 'shelter' ? '风险加权保障率' : '风险加权可达率',
      baseline: analysis.baseline.riskWeightedCoverageRatio,
      current: analysis.current.riskWeightedCoverageRatio,
      format: formatPercent,
    },
    {
      label: state.selectedFacilityType === 'shelter' ? '容量保障率' : '距离衰减可达率',
      baseline: analysis.baseline.coverageRatio,
      current: analysis.current.coverageRatio,
      format: formatPercent,
    },
    {
      label: state.selectedFacilityType === 'shelter' ? '容量未保障人口' : '未有效纳入服务人口',
      baseline: analysis.baseline.uncovered,
      current: analysis.current.uncovered,
      format: (value) => value == null ? '—' : Math.round(value).toLocaleString('zh-CN') + ' 人',
      lowerIsBetter: true,
    },

    {
      label: '方案设施圈内高风险人口',
      baseline: 0,
      current: analysis.current.scenarioReachablePopulation,
      format: (value) => value == null ? '—' : Math.round(value).toLocaleString('zh-CN') + ' 人',
      neutral: true,
    },
    {
      label: '高风险盲区格点',
      baseline: analysis.baseline.blindSpotCount,
      current: analysis.current.blindSpotCount,
      format: (value) => value == null ? '—' : Math.round(value) + ' 个',
      lowerIsBetter: true,
    },
    capacityRow,
    {
      label: '预算点',
      baseline: 0,
      current: analysis.current.budgetPoints,
      format: (value) => value == null ? '—' : Math.round(value) + ' 点',
      neutral: true,
    },
  ]
  async function resetBaseline() {
    if (!scenario || !(scenario.facilities?.length ?? 0)) {
      setMessage('当前情景没有模拟设施，无需恢复。')
      setConfirming(false)
      return
    }
    setBusy(true)
    setMessage('')
    const deleted: NonNullable<typeof scenario.facilities> = []
    try {
      for (const facility of scenario.facilities ?? []) {
        await scenarioApi.deleteFacility(scenario.id, facility.id)
        deleted.push(facility)
      }
      dispatch({ type: 'set-scenario-view', value: 'baseline' })
      setMessage('已移除模拟设施并恢复历史设施基线。')
      setConfirming(false)
      onRefresh()
    } catch (cause) {
      const rollbackErrors: string[] = []
      for (const facility of deleted) {
        try {
          await scenarioApi.addFacility(scenario.id, {
            type: facility.type,
            lon: facility.lon,
            lat: facility.lat,
            capacity_value: facility.capacity_value,
            capacity_unit: facility.capacity_unit,
            service_radius_km: facility.service_radius_km,
            budget_points: facility.budget_points,
          })
        } catch (rollbackCause) {
          rollbackErrors.push(rollbackCause instanceof Error ? rollbackCause.message : String(rollbackCause))
        }
      }
      setMessage(
        '恢复基线未完全成功。'
        + (rollbackErrors.length ? ' · ' + rollbackErrors.length + ' 个设施回滚失败' : ' · 已回滚已删除设施')
        + ' · 原因：' + (cause instanceof Error ? cause.message : String(cause)),
      )
      onRefresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scenario-metric-comparison">
      <p className="scenario-comparison-context">当前比较口径：{facilityTypeLabel}。位置和半径影响“圈内高风险人口”与距离衰减；避难所容量严格守恒，医疗床位和救援队伍不跨单位换算成人口。</p>
      <div className="scenario-comparison-table" role="table" aria-label="基线与方案对比">
        <div className="scenario-table-head" role="row">
          <span>指标</span><span>基线</span><span>当前方案</span><span>变化</span>
        </div>
        
        {rows.map((row) => {
          const values = [row.baseline, row.current].filter((value): value is number => value != null)
          const maximum = Math.max(1, ...values)
          const baselinePosition = row.baseline == null ? null : row.baseline / maximum * 100
          const currentPosition = row.current == null ? null : row.current / maximum * 100
          const change = row.baseline == null || row.current == null ? null : row.current - row.baseline
          return (
            <div className="scenario-table-row" role="row" key={row.label}>
              <strong>{row.label}</strong>
              <span>{row.format(row.baseline)}</span>
              <span>{row.format(row.current)}</span>
              <span className={changeTone(row)}>
                {change == null ? (row.baseline == null && row.current == null ? '不适用' : '不可比较') : change === 0 ? '无变化' : (change > 0 ? '↑' : '↓') + row.format(Math.abs(change))}
              </span>
            </div>
          )
        })}
      </div>
      <div className="scenario-view-switch" role="group" aria-label="地图设施图层与覆盖排名">
        <span>地图设施图层：</span>
        <button type="button" className={state.scenarioView === 'baseline' ? 'active' : ''} onClick={() => dispatch({ type: 'set-scenario-view', value: 'baseline' })}>隐藏方案设施</button>
        <button type="button" className={state.scenarioView === 'current' ? 'active' : ''} onClick={() => dispatch({ type: 'set-scenario-view', value: 'current' })}>显示方案设施</button>
        <small>危险度底图保持不变；切换只影响模拟设施、服务圈和覆盖排名。</small>
      </div>
      <p className="scenario-location-note">人口已细分到约 0.025°（约 2.5 km）需求格点。风险加权率、方案设施圈内人口和格点盲区会随选址与半径变化；若新增容量落在已充分保障区，容量保障人口仍可能不增加。</p>
      {!(scenario?.facilities?.length ?? 0) && <p className="a-empty compact">当前情景没有模拟设施，方案与基线相同。</p>}
      {(scenario?.facilities?.length ?? 0) > 0 && analysis.current.scenarioReachablePopulation === 0 && <p className="a-empty compact">方案设施已保存，但服务圈内没有达到当前阈值的需求格点；请移动位置、调整半径或检查危险度阈值。</p>}
      <div className="reset-baseline">
        {!confirming ? (
          <button type="button" disabled={busy || !(scenario?.facilities?.length ?? 0)} onClick={() => setConfirming(true)}>
            恢复基线
          </button>
        ) : (
          <>
            <span>这会删除当前情景中的全部模拟设施，是否继续？</span>
            <button className="danger" type="button" disabled={busy} onClick={() => void resetBaseline()}>
              {busy ? '处理中' : '确认恢复'}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消</button>
          </>
        )}
      </div>
      {message && <p className="form-message" role="status">{message}</p>}
    </div>
  )
}


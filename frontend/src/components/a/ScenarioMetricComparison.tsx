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

  const rows: MetricRow[] = [
    {
      label: '覆盖率',
      baseline: analysis.baseline.coverageRatio,
      current: analysis.current.coverageRatio,
      format: (value) => value == null ? '—' : (value * 100).toFixed(2) + '%',
    },
    {
      label: '未覆盖人口',
      baseline: analysis.baseline.uncovered,
      current: analysis.current.uncovered,
      format: (value) => value == null ? '—' : Math.round(value).toLocaleString('zh-CN') + ' 人',
      lowerIsBetter: true,
    },
    {
      label: '服务盲区数',
      baseline: analysis.baseline.blindSpotCount,
      current: analysis.current.blindSpotCount,
      format: (value) => value == null ? '—' : Math.round(value) + ' 个',
      lowerIsBetter: true,
    },
    {
      label: '容量利用率',
      baseline: analysis.baseline.capacityUtilization,
      current: analysis.current.capacityUtilization,
      format: (value) => value == null ? '口径不适用' : (value * 100).toFixed(2) + '%',
    },
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
                {change == null ? '不可比较' : change === 0 ? '无变化' : (change > 0 ? '↑' : '↓') + row.format(Math.abs(change))}
              </span>
            </div>
          )
        })}
      </div>
      <div className="scenario-view-switch" role="group" aria-label="地图与排名视图">
        <span>同步查看：</span>
        <button type="button" className={state.scenarioView === 'baseline' ? 'active' : ''} onClick={() => dispatch({ type: 'set-scenario-view', value: 'baseline' })}>建设前基线</button>
        <button type="button" className={state.scenarioView === 'current' ? 'active' : ''} onClick={() => dispatch({ type: 'set-scenario-view', value: 'current' })}>当前方案</button>
      </div>
      {!(scenario?.facilities?.length ?? 0) && <p className="a-empty compact">当前情景没有模拟设施，方案与基线相同。</p>}
      {(scenario?.facilities?.length ?? 0) > 0 && analysis.current.uncovered === analysis.baseline.uncovered && <p className="a-empty compact">方案设施已保存，但服务半径尚未覆盖高风险行政区质心，因此当前指标与基线相同。</p>}
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


/**
 * Component owner: A
 * Compares route-match candidates beyond the path-similarity score.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { dataApi } from '../../api'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type {
  StormSummary,
  TrackPoint,
  TrajectoryMatchResponse,
} from '../../types/contracts'

interface Props {
  storms: StormSummary[]
}

interface Candidate {
  summary: StormSummary
  match: TrajectoryMatchResponse['items'][number]
  averageSpeed: number | null
}

const metricRows: Array<{
  key: 'max_wind_ms' | 'min_pressure_hpa' | 'ace' | 'duration_hours' | 'averageSpeed'
  label: string
  unit: string
}> = [
  { key: 'max_wind_ms', label: '最大风速', unit: 'm/s' },
  { key: 'min_pressure_hpa', label: '最低气压', unit: 'hPa' },
  { key: 'ace', label: 'ACE', unit: '' },
  { key: 'duration_hours', label: '持续时间', unit: 'h' },
  { key: 'averageSpeed', label: '平均移动速度', unit: 'km/h' },
]

function averageSpeed(points: TrackPoint[]) {
  const values = points
    .map((point) => point.moving_speed_kmh)
    .filter((value): value is number => value != null && Number.isFinite(value))
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function candidateValue(candidate: Candidate, key: typeof metricRows[number]['key']) {
  return key === 'averageSpeed' ? candidate.averageSpeed : candidate.summary[key]
}

function rawLabel(value: number | null | undefined, unit: string) {
  if (value == null) return '—'
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + (unit ? ' ' + unit : '')
}

const colors = ['#71ded2', '#f6c85f', '#ed7446', '#aa7df5', '#58a6ff']

export default function MatchedStormComparison({ storms }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [result, setResult] = useState<TrajectoryMatchResponse | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [error, setError] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!state.selectedStormId) {
      setResult(null)
      setCandidates([])
      setStatus('idle')
      return
    }
    setStatus('loading')
    setError('')
    setResult(null)
    setCandidates([])
    try {
      const selectedTrack = await dataApi.track(state.selectedStormId, {}, signal)
      const response = await dataApi.trajectory({
        mode: 'geographic',
        points: selectedTrack.points.map((point) => ({ lon: point.lon, lat: point.lat })),
        filters: {
          basins: [],
          season_from: state.filters.seasonRange[0],
          season_to: state.filters.seasonRange[1],
        },
        top_k: 5,
      }, signal)
      const matches = response.items.filter((item) => item.storm_id !== state.selectedStormId)
      const linked = await Promise.all(matches.map(async (match) => {
        const summary = storms.find((storm) => storm.id === match.storm_id)
        if (!summary) return null
        try {
          const track = await dataApi.track(summary.id, {}, signal)
          return { summary, match, averageSpeed: averageSpeed(track.points) }
        } catch {
          return { summary, match, averageSpeed: null }
        }
      }))
      const valid = linked.filter((candidate): candidate is Candidate => candidate != null)
      setResult({ ...response, items: matches })
      setCandidates(valid)
      setStatus(valid.length ? 'ready' : 'empty')
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }, [state.filters.seasonRange, state.selectedStormId, storms])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const normalized = useMemo(() => {
    const values = new Map<string, Map<string, number | null>>()
    for (const row of metricRows) {
      const present = candidates
        .map((candidate) => candidateValue(candidate, row.key))
        .filter((value): value is number => value != null && Number.isFinite(value))
      const minimum = present.length ? Math.min(...present) : 0
      const maximum = present.length ? Math.max(...present) : 1
      const rowValues = new Map<string, number | null>()
      for (const candidate of candidates) {
        const value = candidateValue(candidate, row.key)
        rowValues.set(
          candidate.summary.id,
          value == null ? null : maximum === minimum ? 0.5 : (value - minimum) / (maximum - minimum),
        )
      }
      values.set(row.key, rowValues)
    }
    return values
  }, [candidates])

  if (status === 'idle') return <div className="a-empty">选择一场气旋后，系统会检索轨迹相似事件。</div>
  if (status === 'loading') return <div className="a-skeleton match-skeleton" aria-label="正在检索相似气旋" />
  if (status === 'error') {
    return (
      <div className="a-error">
        相似事件加载失败：{error}
        <button type="button" onClick={() => void load()}>重试</button>
      </div>
    )
  }
  if (status === 'empty' || !candidates.length) {
    return <div className="a-empty">当前筛选范围内没有可比较的相似气旋。</div>
  }

  return (
    <div className="matched-comparison">
      <div className="match-warning">
        <strong>轨迹相似不等于影响相似</strong>
        <span>{result?.mode === 'shape' ? '形状匹配' : '地理匹配'} · 返回 {candidates.length} 场</span>
      </div>
      <div className="candidate-legend" aria-label="候选事件">
        {candidates.map((candidate, index) => (
          <button
            type="button"
            key={candidate.summary.id}
            aria-pressed={state.selectedMatchId === candidate.summary.id}
            onClick={() => dispatch({
              type: 'set-match',
              stormId: state.selectedMatchId === candidate.summary.id ? null : candidate.summary.id,
            })}
          >
            <i style={{ background: colors[index] }} />
            {candidate.summary.name}
            <small>{Math.round(candidate.match.similarity * 100)}%</small>
          </button>
        ))}
      </div>
      <div className="normalized-dotplot" role="img" aria-label="相似气旋标准化指标点图">
        <div className="dotplot-scale"><span>指标低值</span><span>指标高值</span></div>
        {metricRows.map((row) => (
          <div className="dotplot-row" key={row.key}>
            <span>{row.label}</span>
            <div className="dotplot-track">
              {candidates.map((candidate, index) => {
                const value = normalized.get(row.key)?.get(candidate.summary.id)
                if (value == null) return null
                return (
                  <i
                    key={candidate.summary.id}
                    title={candidate.summary.name + '：' + rawLabel(candidateValue(candidate, row.key), row.unit)}
                    style={{
                      left: (value * 100) + '%',
                      background: colors[index],
                      opacity: state.selectedMatchId && state.selectedMatchId !== candidate.summary.id ? 0.35 : 1,
                    }}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="match-table-scroll">
        <table className="match-raw-table">
          <thead>
            <tr>
              <th>指标</th>
              {candidates.map((candidate) => <th key={candidate.summary.id}>{candidate.summary.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((row) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                {candidates.map((candidate) => (
                  <td key={candidate.summary.id}>{rawLabel(candidateValue(candidate, row.key), row.unit)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th>月份</th>
              {candidates.map((candidate) => (
                <td key={candidate.summary.id}>{new Date(candidate.summary.start_time).getUTCMonth() + 1} 月</td>
              ))}
            </tr>
            <tr>
              <th>海盆 / 影响数据</th>
              {candidates.map((candidate) => (
                <td key={candidate.summary.id}>
                  {candidate.summary.basin} · {candidate.summary.impact_available ? '有影响网格' : '无影响网格'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="a-method-note">每一行仅在当前候选集内做 0—1 标准化；原始值保留在表格中。相似分数只衡量轨迹，不代表强度、人口暴露或灾情相似。</p>
    </div>
  )
}

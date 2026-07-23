// Owner: B — complete global cyclone overview component.
import { useMemo } from 'react'
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { StormSummary } from '../../types/contracts'
import { BASIN_COLORS, ChartHeader, ComponentState, formatNumber, scaleLinear } from './chartUtils'

interface Props {
  storms: StormSummary[]
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'stale'
  error?: string
}

const WIND_BINS = [0, 17, 33, 43, 50, 58, 70, 90, 120]

export default function GlobalCycloneOverview({ storms, status, error = '' }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const filtered = useMemo(
    () => storms.filter((storm) =>
      storm.season >= state.selectedYearRange[0]
      && storm.season <= state.selectedYearRange[1]
      && (!state.selectedBasin || storm.basin === state.selectedBasin)
      && (storm.max_wind_ms == null || storm.max_wind_ms >= state.minWindMs)),
    [storms, state.minWindMs, state.selectedBasin, state.selectedYearRange],
  )
  const years = useMemo(() => {
    const counts = new Map<number, number>()
    filtered.forEach((storm) => counts.set(storm.season, (counts.get(storm.season) ?? 0) + 1))
    return [...counts].sort(([left], [right]) => left - right)
  }, [filtered])
  const months = useMemo(() => Array.from({ length: 12 }, (_, month) =>
    filtered.filter((storm) => new Date(storm.start_time).getUTCMonth() === month).length), [filtered])
  const basins = useMemo(() => {
    const counts = new Map<string, number>()
    storms.filter((storm) =>
      storm.season >= state.selectedYearRange[0]
      && storm.season <= state.selectedYearRange[1]
      && (storm.max_wind_ms == null || storm.max_wind_ms >= state.minWindMs))
      .forEach((storm) => counts.set(storm.basin, (counts.get(storm.basin) ?? 0) + 1))
    return [...counts].sort((left, right) => right[1] - left[1])
  }, [storms, state.minWindMs, state.selectedYearRange])
  const histogram = useMemo(() => WIND_BINS.slice(0, -1).map((start, index) => ({
    start,
    end: WIND_BINS[index + 1],
    count: filtered.filter((storm) =>
      storm.max_wind_ms != null && storm.max_wind_ms >= start && storm.max_wind_ms < WIND_BINS[index + 1]).length,
  })), [filtered])
  const maxYearCount = Math.max(1, ...years.map(([, count]) => count))
  const maxMonth = Math.max(1, ...months)
  const maxBasin = Math.max(1, ...basins.map(([, count]) => count))
  const maxBin = Math.max(1, ...histogram.map((item) => item.count))
  const yearDomain: [number, number] = years.length
    ? [years[0][0], years.at(-1)?.[0] ?? years[0][0] + 1]
    : state.selectedYearRange
  const linePoints = years.map(([year, count]) =>
    `${scaleLinear(year, yearDomain, [12, 288])},${scaleLinear(count, [0, maxYearCount], [92, 12])}`).join(' ')
  const minimumSeason = storms.length ? Math.min(...storms.map((storm) => storm.season)) : 1840
  const maximumSeason = storms.length ? Math.max(...storms.map((storm) => storm.season)) : 2200

  return (
    <section className="b-component global-overview" data-owner="B">
      <ChartHeader
        eyebrow="GLOBAL OVERVIEW · B"
        title="全球气旋统计概览"
        meta={<><strong>{formatNumber(filtered.length)}</strong><span>{state.selectedYearRange.join('–')} · {state.selectedBasin ?? '全部海盆'}</span></>}
      />
      <ComponentState
        status={status === 'loading' || status === 'idle' || status === 'error' ? status : filtered.length ? status : 'empty'}
        error={error}
        empty="当前筛选无事件"
      >
        <div className="overview-grid">
          <figure className="b-figure">
            <figcaption><strong>年度事件数量</strong><span>拖动下方范围筛选</span></figcaption>
            <svg viewBox="0 0 300 108" role="img" aria-label="年度气旋数量折线图">
              <line x1="12" x2="288" y1="92" y2="92" className="axis-line" />
              {linePoints && <polygon points={`12,92 ${linePoints} 288,92`} className="area-fill" />}
              {linePoints && <polyline points={linePoints} className="line-series" />}
              {years.map(([year, count]) => (
                <circle key={year} cx={scaleLinear(year, yearDomain, [12, 288])} cy={scaleLinear(count, [0, maxYearCount], [92, 12])} r="2.5">
                  <title>{year}：{count} 场</title>
                </circle>
              ))}
            </svg>
            <div className="year-brush" aria-label="年份范围刷选">
              <label>起始<input type="range" min={minimumSeason} max={maximumSeason} value={Math.max(minimumSeason, state.selectedYearRange[0])}
                onChange={(event) => dispatch({ type: 'set-year-range', range: [Math.min(Number(event.target.value), state.selectedYearRange[1]), state.selectedYearRange[1]] })} /></label>
              <label>结束<input type="range" min={minimumSeason} max={maximumSeason} value={Math.min(maximumSeason, state.selectedYearRange[1])}
                onChange={(event) => dispatch({ type: 'set-year-range', range: [state.selectedYearRange[0], Math.max(Number(event.target.value), state.selectedYearRange[0])] })} /></label>
            </div>
          </figure>

          <figure className="b-figure">
            <figcaption><strong>月份分布</strong><span>数量 / 当前海盆</span></figcaption>
            <div className="month-bars" role="img" aria-label="一月至十二月气旋数量柱状图">
              {months.map((count, index) => (
                <div key={index} title={`${index + 1} 月：${count} 场，占 ${filtered.length ? ((count / filtered.length) * 100).toFixed(1) : 0}%`}>
                  <i style={{ height: `${Math.max(count ? 5 : 0, count / maxMonth * 100)}%` }} />
                  <span>{index + 1}</span>
                </div>
              ))}
            </div>
          </figure>

          <figure className="b-figure">
            <figcaption><strong>海盆构成</strong><span>点击筛选，再次点击取消</span></figcaption>
            <div className="basin-bars">
              {basins.map(([basin, count]) => (
                <button key={basin} type="button" aria-pressed={state.selectedBasin === basin}
                  onClick={() => dispatch({ type: 'set-basin', basin: state.selectedBasin === basin ? null : basin })}>
                  <span>{basin}</span>
                  <i style={{ width: `${count / maxBasin * 100}%`, background: BASIN_COLORS[basin] }} />
                  <strong>{count}</strong>
                </button>
              ))}
            </div>
          </figure>

          <figure className="b-figure">
            <figcaption><strong>最大风速分布</strong><span>m/s · 固定分箱</span></figcaption>
            <div className="histogram-bars" role="img" aria-label="最大风速分布直方图">
              {histogram.map((bin) => (
                <div key={bin.start} title={`${bin.start}–${bin.end} m/s：${bin.count} 场`}>
                  <i style={{ height: `${Math.max(bin.count ? 5 : 0, bin.count / maxBin * 100)}%` }} />
                  <span>{bin.start}</span>
                </div>
              ))}
            </div>
          </figure>
        </div>
      </ComponentState>
      <p className="method-note">仅描述当前数据范围内的分布，不进行长期趋势或气候归因。早期观测完整性与机构差异需结合数据来源解释。</p>
    </section>
  )
}

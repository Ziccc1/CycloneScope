import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useAppDispatch, useAppState, type AnalysisMode } from '../state/AppState'
import type {
  DataSourceListResponse,
  HealthResponse,
  ScenarioRead,
  StormSummary,
} from '../types/contracts'
import ScenarioPanel from './ScenarioPanel'
import MatchedStormComparison from './a/MatchedStormComparison'
import NarrativeAnalysisPanel from './a/NarrativeAnalysisPanel'
import StormIntensityChart from './a/StormIntensityChart'

export interface FeatureSlots {
  map?: ReactNode
  wind?: ReactNode
  trajectory?: ReactNode
  scenario?: ReactNode
}

interface Props {
  health: HealthResponse | null
  storms: StormSummary[]
  sources: DataSourceListResponse | null
  scenarios: ScenarioRead[]
  loading: boolean
  error: string
  slots?: FeatureSlots
  onRefreshScenarios: () => void
  scenarioVersion: number
  onDemoPreset: () => void
}

const modes: { value: AnalysisMode; label: string }[] = [
  { value: 'overview', label: '全球概览' },
  { value: 'storm', label: '单场分析' },
  { value: 'draw-match', label: '手绘匹配' },
  { value: 'taiwan-scenario', label: '台湾情景' },
]

const layerLabels = {
  tracks: '历史轨迹',
  wind: '风场粒子',
  impact: '区域影响',
  facilities: '防灾设施',
}

function valueOrDash(value: number | null | undefined, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`
}

export default function AppShell({
  health,
  storms,
  sources,
  scenarios,
  loading,
  error,
  slots = {},
  onRefreshScenarios,
  scenarioVersion,
  onDemoPreset,
}: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const selected = storms.find((storm) => storm.id === state.selectedStormId) ?? null
  const compared = [
    selected,
    ...state.comparisonStormIds
      .map((id) => storms.find((storm) => storm.id === id) ?? null)
      .filter((storm): storm is StormSummary => Boolean(storm)),
  ].filter((storm): storm is StormSummary => Boolean(storm))
  const activeStart = state.timeWindow?.start ?? selected?.start_time ?? null
  const activeEnd = state.timeWindow?.end ?? selected?.end_time ?? null
  const activeTime = state.currentTime ?? activeStart
  const timelineProgress = activeStart && activeEnd && activeTime
    ? Math.max(0, Math.min(100, ((Date.parse(activeTime) - Date.parse(activeStart)) / Math.max(1, Date.parse(activeEnd) - Date.parse(activeStart))) * 100))
    : 0

  useEffect(() => {
    if (!state.isPlaying || !activeStart || !activeEnd) return
    const start = Date.parse(activeStart)
    const end = Date.parse(activeEnd)
    const initial = Date.parse(activeTime ?? activeStart)
    const wallStart = performance.now()
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - wallStart) * 60_000 * state.playbackSpeed
      const next = Math.min(end, initial + elapsed)
      dispatch({ type: 'set-time', value: new Date(next).toISOString() })
      if (next >= end) dispatch({ type: 'set-playing', value: false })
    }, 100)
    return () => window.clearInterval(timer)
  }, [dispatch, state.isPlaying, state.playbackSpeed, activeStart, activeEnd])

  function setTimeline(value: number) {
    if (!activeStart || !activeEnd) return
    const start = Date.parse(activeStart)
    const end = Date.parse(activeEnd)
    dispatch({ type: 'set-time', value: new Date(start + (end - start) * value / 100).toISOString() })
  }

  function renderFeatureSlot() {
    if (state.mode === 'draw-match' && slots.trajectory) return slots.trajectory
    if (state.mode === 'taiwan-scenario' && slots.scenario) return slots.scenario
    if (state.mode === 'storm' && slots.wind) return slots.wind
    if (slots.map) return slots.map
    return (
      <div className="feature-placeholder" data-c-slot={state.mode}>
        <div className="placeholder-orbit" />
        <p className="eyebrow">C COMPONENT SLOT · {state.mode.toUpperCase()}</p>
        <h2>{state.mode === 'taiwan-scenario' ? '台湾设施地图插槽' : 'MapLibre 分析地图插槽'}</h2>
        <p>
          B 已提供共享状态、筛选、时间和数据接口。等待 C 接入地图、粒子或手绘组件。
        </p>
        <dl>
          <div><dt>当前事件</dt><dd>{selected?.name ?? '未选择'}</dd></div>
          <div><dt>轨迹图层</dt><dd>{state.layers.tracks.visible ? '显示' : '隐藏'}</dd></div>
          <div><dt>影响透明度</dt><dd>{Math.round(state.layers.impact.opacity * 100)}%</dd></div>
        </dl>
      </div>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">风</span>
          <div>
            <p className="eyebrow">CYCLONESCOPE · OFFLINE ANALYTICS</p>
            <h1>风迹</h1>
          </div>
        </div>
        <nav className="mode-tabs" aria-label="分析模式">
          {modes.map((mode) => (
            <button
              key={mode.value}
              type="button"
              aria-pressed={state.mode === mode.value}
              onClick={() => dispatch({ type: 'set-mode', mode: mode.value })}
            >
              {mode.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className={`api-status ${health?.status === 'ok' ? 'online' : ''}`}>
            <i /> {health ? `API ${health.version}` : 'API 离线'}
          </span>
          <button type="button" onClick={onDemoPreset}>加载演示预设</button>
          <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">API ↗</a>
        </div>
      </header>

      <div className="status-region">
        {health?.data_mode === 'fixture' && (
          <div className="fixture-banner" role="status">
            当前处于演示夹具模式：气旋、风场、影响和台湾设施均不可作为研究结论。
          </div>
        )}
        {error && <div className="error-banner" role="alert">API 请求失败：{error}</div>}
      </div>

      <div className="workspace">
        <aside className="left-panel panel">
          <section>
            <div className="panel-heading">
              <div><p className="eyebrow">FILTERS</p><h2>筛选与图层</h2></div>
              {loading && <span className="spinner" aria-label="加载中" />}
            </div>
            <label>
              海盆
              <select
                value={state.filters.basins[0] ?? ''}
                onChange={(event) =>
                  dispatch({
                    type: 'set-basins',
                    basins: event.target.value ? [event.target.value] : [],
                  })
                }
              >
                <option value="">全部海盆</option>
                <option value="WP">西北太平洋 WP</option>
                <option value="NA">北大西洋 NA</option>
              </select>
            </label>
            <div className="two-fields">
              <label>
                起始年份
                <input
                  type="number"
                  min="1840"
                  max={state.filters.seasonRange[1]}
                  value={state.filters.seasonRange[0]}
                  onChange={(event) =>
                    dispatch({
                      type: 'set-season-range',
                      range: [Number(event.target.value), state.filters.seasonRange[1]],
                    })
                  }
                />
              </label>
              <label>
                结束年份
                <input
                  type="number"
                  min={state.filters.seasonRange[0]}
                  max="2200"
                  value={state.filters.seasonRange[1]}
                  onChange={(event) =>
                    dispatch({
                      type: 'set-season-range',
                      range: [state.filters.seasonRange[0], Number(event.target.value)],
                    })
                  }
                />
              </label>
            </div>
            <label>
              最小风速 <output>{state.filters.minWindMs} m/s</output>
              <input
                type="range"
                min="0"
                max="100"
                value={state.filters.minWindMs}
                onChange={(event) =>
                  dispatch({ type: 'set-min-wind', value: Number(event.target.value) })
                }
              />
            </label>
            <div className="layer-controls">
              {(Object.keys(state.layers) as (keyof typeof state.layers)[]).map((layer) => (
                <div key={layer}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={state.layers[layer].visible}
                      onChange={(event) =>
                        dispatch({
                          type: 'set-layer',
                          layer,
                          value: { visible: event.target.checked },
                        })
                      }
                    />
                    {layerLabels[layer]}
                  </label>
                  <input
                    aria-label={`${layerLabels[layer]}透明度`}
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state.layers[layer].opacity}
                    onChange={(event) =>
                      dispatch({
                        type: 'set-layer',
                        layer,
                        value: { opacity: Number(event.target.value) },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="case-library">
            <div className="panel-heading">
              <div><p className="eyebrow">EVENT LIBRARY</p><h2>高影响案例</h2></div>
              <span className="count">{storms.length}</span>
            </div>
            {storms.length === 0 && !loading && <p className="empty">当前筛选没有案例。</p>}
            {storms.map((storm) => (
              <article
                key={storm.id}
                className={`case-item ${state.selectedStormId === storm.id ? 'selected' : ''}`}
              >
                <button
                  className="case-select"
                  type="button"
                  onClick={() => {
                    if (storm.impact_available) {
                      dispatch({ type: 'set-layer', layer: 'impact', value: { visible: true } })
                    }
                    dispatch({ type: 'select-storm', stormId: storm.id })
                  }}
                >
                  <span>{storm.basin} · {storm.season}</span>
                  <strong>{storm.name}</strong>
                  <small>{valueOrDash(storm.max_wind_ms, ' m/s')}</small>
                </button>
                <button
                  className="compare-toggle"
                  type="button"
                  aria-pressed={state.comparisonStormIds.includes(storm.id)}
                  onClick={() => dispatch({ type: 'toggle-comparison', stormId: storm.id })}
                >
                  对比
                </button>
              </article>
            ))}
          </section>
        </aside>

        <section className="map-stage" aria-label="核心分析画布">
          {renderFeatureSlot()}
          <div className="map-readout">
            <span>{state.mode}</span>
            <strong>{selected?.name ?? 'GLOBAL'}</strong>
            <span>{state.currentTime ?? '无时间选择'}</span>
          </div>
        </section>

        <aside className="right-panel panel">
          {state.mode === 'taiwan-scenario' ? (
            <>
              <ScenarioPanel scenarios={scenarios} onRefresh={onRefreshScenarios} />
              <NarrativeAnalysisPanel
                health={health}
                sources={sources}
                storms={storms}
                scenarioVersion={scenarioVersion}
                onRefresh={onRefreshScenarios}
              />
            </>
          ) : (
            <>
              {state.mode === 'storm' && (
                <section className="a-component-section">
                  <div className="panel-heading">
                    <div><p className="eyebrow">INTENSITY · A</p><h2>强度过程</h2></div>
                    <span className="tag">观测序列</span>
                  </div>
                  <StormIntensityChart />
                </section>
              )}
              {state.mode === 'draw-match' && (
                <section className="a-component-section">
                  <div className="panel-heading">
                    <div><p className="eyebrow">ANALOGUES · A</p><h2>相似气旋对比</h2></div>
                    <span className="tag">标准化</span>
                  </div>
                  <MatchedStormComparison storms={storms} />
                </section>
              )}
              <section>
                <div className="panel-heading">
                  <div><p className="eyebrow">EVENT PROFILE</p><h2>事件详情</h2></div>
                  <span className="tag">{selected?.data_status ?? '未选择'}</span>
                </div>
                {!selected ? (
                  <p className="empty">从左侧选择一场气旋查看指标。</p>
                ) : (
                  <>
                    <div className="metric-grid">
                      <div><span>当前风速</span><strong>{valueOrDash(state.currentObservation?.wind_ms)}</strong><small>m/s</small></div>
                      <div><span>当前气压</span><strong>{valueOrDash(state.currentObservation?.pressure_hpa)}</strong><small>hPa</small></div>
                      <div><span>类别</span><strong className="metric-text">{state.currentObservation?.category ?? '—'}</strong><small>真实观测</small></div>
                      <div><span>移动速度</span><strong>{valueOrDash(state.currentObservation?.moving_speed_kmh)}</strong><small>km/h</small></div>
                      <div><span>观测机构</span><strong className="metric-text">{state.currentObservation?.source_agency ?? '—'}</strong><small>来源</small></div>
                      <div><span>观测时间</span><strong className="metric-time">{state.currentObservation?.time.slice(0, 16).replace('T', ' ') ?? '—'}</strong><small>UTC</small></div>
                    </div>
                    <p className="event-summary">
                      全程最大风速 {valueOrDash(selected.max_wind_ms, ' m/s')} · 最低气压 {valueOrDash(selected.min_pressure_hpa, ' hPa')} · ACE {valueOrDash(selected.ace)}
                    </p>
                  </>
                )}
              </section>

              <section>
                <div className="panel-heading">
                  <div><p className="eyebrow">COMPARISON</p><h2>事件对比</h2></div>
                  <span className="count">{compared.length}/3</span>
                </div>
                <div className="comparison-chart">
                  {compared.map((storm) => (
                    <div key={storm.id}>
                      <span>{storm.name}</span>
                      <div className="bar-track">
                        <i style={{ width: `${Math.min(100, storm.impact_score ?? 0)}%` }} />
                      </div>
                      <strong>{valueOrDash(storm.impact_score)}</strong>
                    </div>
                  ))}
                  {compared.length === 0 && <p className="empty">选择事件并点击“对比”。</p>}
                </div>
              </section>

              <section>
                <div className="panel-heading">
                  <div><p className="eyebrow">PROVENANCE</p><h2>数据来源</h2></div>
                  <span className="count">{sources?.count ?? 0}</span>
                </div>
                <ul className="source-list">
                  {sources?.items.slice(0, 5).map((source) => (
                    <li key={source.id}>
                      <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                      <small>{source.status}</small>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </aside>
      </div>

      <footer className="timeline">
        <button
          type="button"
          aria-label={state.isPlaying ? '暂停' : '播放'}
          onClick={() => dispatch({ type: 'set-playing', value: !state.isPlaying })}
        >
          {state.isPlaying ? 'Ⅱ' : '▶'}
        </button>
        <div className="timeline-window">
          <span>{state.timeWindow?.start.slice(0, 10) ?? selected?.start_time.slice(0, 10) ?? '起始'}</span>
          <input
            aria-label="事件时间轴"
            type="range"
            min="0"
            max="100"
            value={timelineProgress}
            onChange={(event) => setTimeline(Number(event.target.value))}
            disabled={!selected}
          />
          <span>{state.timeWindow?.end.slice(0, 10) ?? selected?.end_time.slice(0, 10) ?? '结束'}</span>
        </div>
        <label>
          速度
          <select
            value={state.playbackSpeed}
            onChange={(event) =>
              dispatch({ type: 'set-speed', value: Number(event.target.value) })
            }
          >
            <option value="0.5">0.5×</option>
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <output>{state.currentTime ?? selected?.start_time ?? '请选择事件'}</output>
      </footer>
    </main>
  )
}

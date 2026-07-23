// Owner: B — complete trajectory-match result list component.
import { useAppDispatch, useAppState } from '../../state/AppState'
import type { StormSummary } from '../../types/contracts'
import { ChartHeader, ComponentState } from '../charts/chartUtils'

interface Props { storms: StormSummary[] }

export default function TrajectoryMatchList({ storms }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const result = state.trajectoryMatch
  const status = state.trajectoryMatchStatus === 'ready' && !result?.items.length ? 'empty' : state.trajectoryMatchStatus

  return (
    <section className="b-component trajectory-list" data-owner="B">
      <ChartHeader eyebrow="TRAJECTORY MATCH · B" title="路线匹配结果" meta={result && <span>Top {result.items.length} · {result.elapsed_ms.toFixed(1)} ms</span>} />
      <ComponentState
        status={status}
        error={state.trajectoryMatchError}
        empty="在地图上绘制路径，松开后将显示 Top 5 历史案例"
      >
        <div className="trajectory-cards">
          {result?.items.map((item) => {
            const storm = storms.find((candidate) => candidate.id === item.storm_id)
            const active = state.selectedMatchId === item.storm_id
            const canEnterRegional = Boolean(storm?.impact_available)
            return (
              <article key={item.storm_id} className={active ? 'selected' : ''}>
                <button type="button" className="trajectory-card-main"
                  onClick={() => dispatch({ type: 'select-match', stormId: item.storm_id })}>
                  <span className="match-rank">#{item.rank}</span>
                  <span><strong>{storm?.name ?? item.storm_id}</strong><small>{storm ? `${storm.season} · ${storm.basin}` : '事件元数据不可用'}</small></span>
                  <span className="match-score">{Math.round(item.similarity * 100)}<small>相似度 / 100</small></span>
                  <i className="match-bar"><b style={{ width: `${item.similarity * 100}%` }} /></i>
                </button>
                <div className="match-components">
                  <span>地理<i><b style={{ width: `${item.geographic_component * 100}%` }} /></i><strong>{Math.round(item.geographic_component * 100)}</strong></span>
                  <span>形状<i><b style={{ width: `${item.shape_component * 100}%` }} /></i><strong>{Math.round(item.shape_component * 100)}</strong></span>
                  <span>方向<i><b style={{ width: `${item.direction_component * 100}%` }} /></i><strong>{Math.round(item.direction_component * 100)}</strong></span>
                </div>
                <div className="capability-tags" aria-label="数据能力">
                  <span className={storm?.wind_available ? 'available' : ''}>风场</span>
                  <span className={storm?.impact_available ? 'available' : ''}>影响</span>
                  <span className={canEnterRegional ? 'available' : ''}>台湾区域</span>
                </div>
                <div className="trajectory-card-actions">
                  <button type="button" onClick={() => dispatch({ type: 'select-match', stormId: item.storm_id })}>查看轨迹</button>
                  <button type="button" disabled={!storm} onClick={() => storm && dispatch({ type: 'select-storm', stormId: storm.id })}>载入事件</button>
                  <button type="button" disabled={!canEnterRegional} title={canEnterRegional ? '' : '缺少台湾危险数据'}
                    onClick={() => {
                      if (!storm || !canEnterRegional) return
                      dispatch({ type: 'select-storm', stormId: storm.id })
                      dispatch({ type: 'set-story-stage', stage: 'regional' })
                    }}>进入台湾案例</button>
                </div>
                {!canEnterRegional && <p>缺少台湾危险数据；仍可进入单场和全球影响比较。</p>}
              </article>
            )
          })}
        </div>
      </ComponentState>
      <p className="method-note">相似度用于检索可比较案例，不是未来路径或灾害结果的概率。失败时保留上一次有效匹配结果。</p>
    </section>
  )
}

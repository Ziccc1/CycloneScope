import { useEffect, useState } from 'react'
import { getJson, type StormSummary } from './api'

interface HealthResponse {
  status: string
  version: string
  sample_data: boolean
}

interface StormListResponse {
  items: StormSummary[]
}

interface SourceListResponse {
  count: number
}

export default function App() {
  const [health, setHealth] = useState('正在连接 API…')
  const [storms, setStorms] = useState<StormSummary[]>([])
  const [sourceCount, setSourceCount] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      try {
        const [healthResponse, stormResponse, sourceResponse] = await Promise.all([
          getJson<HealthResponse>('/api/health', controller.signal),
          getJson<StormListResponse>('/api/storms?classic=true', controller.signal),
          getJson<SourceListResponse>('/api/data-sources', controller.signal),
        ])

        setHealth(`${healthResponse.status} · API ${healthResponse.version}`)
        setStorms(stormResponse.items)
        setSourceCount(sourceResponse.count)
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : String(cause))
        setHealth('连接失败')
      }
    }

    void loadDashboard()
    return () => controller.abort()
  }, [])

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">CYCLONESCOPE · REACT LOCAL INTEGRATION</p>
          <h1>风迹</h1>
          <p>高影响热带气旋可视分析系统的第一阶段 API 联调页</p>
        </div>
        <span className="status">{health}</span>
      </header>

      <section className="notice">
        当前气旋和风场均为测试夹具，不代表真实灾损。正式数据将由预处理流水线替换。
      </section>

      <section className="metrics" aria-label="本地联调状态">
        <article>
          <span>测试案例</span>
          <strong>{storms.length}</strong>
        </article>
        <article>
          <span>已登记数据来源</span>
          <strong>{sourceCount}</strong>
        </article>
        <article>
          <span>下一阶段</span>
          <strong>MapLibre</strong>
        </article>
      </section>

      <section>
        <div className="section-title">
          <div>
            <p className="eyebrow">HIGH-IMPACT EVENT LIBRARY</p>
            <h2>高影响案例接口</h2>
          </div>
          <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">
            打开 Swagger ↗
          </a>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="storm-grid">
          {storms.map((storm) => (
            <article key={storm.id} className="storm-card">
              <span>
                {storm.basin} · {storm.season}
              </span>
              <h3>{storm.name}</h3>
              <dl>
                <div>
                  <dt>测试影响分</dt>
                  <dd>{storm.impact_score?.toFixed(1) ?? '—'}</dd>
                </div>
                <div>
                  <dt>最大风速</dt>
                  <dd>
                    {storm.max_wind_ms == null ? '—' : `${storm.max_wind_ms} m/s`}
                  </dd>
                </div>
              </dl>
              <small>{storm.data_status}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

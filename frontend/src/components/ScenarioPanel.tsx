import { type FormEvent, useEffect, useState } from 'react'
import { scenarioApi } from '../api'
import { useAppDispatch, useAppState } from '../state/AppState'
import type {
  EvaluationResponse,
  FacilityCreate,
  FacilityType,
  ScenarioDetail,
  ScenarioRead,
} from '../types/contracts'

interface Props {
  scenarios: ScenarioRead[]
  onRefresh: () => void
}

interface FacilityPreview {
  facilityId: string
  lon: number
  lat: number
  radiusKm: number
}

const facilityLabels: Record<FacilityType, string> = {
  shelter: '避难所',
  medical: '医疗',
  rescue: '救援',
  warehouse: '物资',
}

export default function ScenarioPanel({ scenarios, onRefresh }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [detail, setDetail] = useState<ScenarioDetail | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null)
  const [name, setName] = useState('台湾设施联调情景')
  const [facilityType, setFacilityType] = useState<FacilityType>('shelter')
  const [lon, setLon] = useState(121.6)
  const [lat, setLat] = useState(24)
  const [capacity, setCapacity] = useState(500)
  const [serviceRadius, setServiceRadius] = useState(5)
  const [atRisk, setAtRisk] = useState(1000)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<FacilityPreview | null>(null)

  async function loadDetail(id: string | null) {
    if (!id) {
      setDetail(null)
      setEvaluation(null)
      return
    }
    try {
      const selected = await scenarioApi.get(id)
      setDetail(selected)
      setName(selected.name)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => {
    void loadDetail(state.selectedScenarioId)
  }, [state.selectedScenarioId])

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<FacilityPreview>).detail
      setPreview(detail)
    }
    const onCommitted = (event: Event) => {
      const detail = (event as CustomEvent<{ facilityId: string; lon: number; lat: number }>).detail
      setPreview({ ...detail, radiusKm: preview?.radiusKm ?? 0 })
      if (!state.selectedScenarioId) return
      void scenarioApi.evaluate(state.selectedScenarioId, {
        at_risk_population: atRisk,
        hazard_threshold: 0.5,
      }).then(setEvaluation).catch(() => undefined)
      setMessage('设施已移动，覆盖范围和评估结果已更新')
      onRefresh()
    }
    window.addEventListener('scenario-facility-preview', onPreview)
    window.addEventListener('scenario-facility-committed', onCommitted)
    return () => {
      window.removeEventListener('scenario-facility-preview', onPreview)
      window.removeEventListener('scenario-facility-committed', onCommitted)
    }
  }, [atRisk, onRefresh, preview?.radiusKm, state.selectedScenarioId])

  async function perform(
    action: () => Promise<unknown>,
    success: string,
    reloadDetail = true,
  ) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      setMessage(success)
      if (reloadDetail) await loadDetail(state.selectedScenarioId)
      onRefresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function createScenario(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      const created = await scenarioApi.create(name)
      dispatch({ type: 'set-scenario', scenarioId: created.id })
    }, '情景已创建', false)
  }

  async function renameScenario() {
    if (!detail) return
    await perform(
      () => scenarioApi.update(detail.id, { name }),
      '情景已重命名',
    )
  }

  async function deleteScenario() {
    if (!detail) return
    await perform(async () => {
      await scenarioApi.delete(detail.id)
      dispatch({ type: 'set-scenario', scenarioId: null })
      setDetail(null)
      setEvaluation(null)
    }, '情景已删除', false)
  }

  async function addFacility(event: FormEvent) {
    event.preventDefault()
    if (!detail) return
    const payload: FacilityCreate = {
      type: facilityType,
      lon,
      lat,
      capacity_value: capacity,
      capacity_unit: 'people',
      service_radius_km: serviceRadius,
      budget_points: null,
    }
    await perform(
      () => scenarioApi.addFacility(detail.id, payload),
      '模拟设施已添加',
    )
  }

  async function updatePosition(facilityId: string, nextLon: number, nextLat: number) {
    if (!detail) return
    await perform(
      () =>
        scenarioApi.updateFacility(detail.id, facilityId, {
          lon: nextLon,
          lat: nextLat,
        }),
      '设施位置已保存',
    )
  }

  async function evaluate() {
    if (!detail) return
    setBusy(true)
    setMessage('')
    try {
      setEvaluation(
        await scenarioApi.evaluate(detail.id, {
          at_risk_population: atRisk,
          hazard_threshold: 0.5,
        }),
      )
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="scenario-panel" aria-labelledby="scenario-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">COUNTERFACTUAL SCENARIO</p>
          <h2 id="scenario-title">设施情景</h2>
        </div>
        <span className="tag">情景模型</span>
      </div>

      <label>
        当前情景
        <select
          value={state.selectedScenarioId ?? ''}
          onChange={(event) =>
            dispatch({
              type: 'set-scenario',
              scenarioId: event.target.value || null,
            })
          }
        >
          <option value="">未选择</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </label>

      <form className="inline-form" onSubmit={createScenario}>
        <input
          aria-label="情景名称"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        <button disabled={busy || !name.trim()} type="submit">
          新建
        </button>
      </form>

      {detail && (
        <>
          {preview && (
            <div className="scenario-preview" role="status">
              <strong>正在预览设施影响</strong>
              <span>{preview.lon.toFixed(4)}°E, {preview.lat.toFixed(4)}°N</span>
              <small>服务范围 {preview.radiusKm > 0 ? `${preview.radiusKm} km` : '未设置'} · 松开鼠标后保存并重新评估</small>
            </div>
          )}
          <div className="button-row">
            <button disabled={busy} type="button" onClick={renameScenario}>
              使用当前名称重命名
            </button>
            <button className="danger" disabled={busy} type="button" onClick={deleteScenario}>
              删除情景
            </button>
          </div>

          <form className="facility-form" onSubmit={addFacility}>
            <label>
              类型
              <select
                value={facilityType}
                onChange={(event) => setFacilityType(event.target.value as FacilityType)}
              >
                {Object.entries(facilityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              经度
              <input
                type="number"
                step="0.01"
                min="-180"
                max="180"
                value={lon}
                onChange={(event) => setLon(Number(event.target.value))}
              />
            </label>
            <label>
              纬度
              <input
                type="number"
                step="0.01"
                min="-90"
                max="90"
                value={lat}
                onChange={(event) => setLat(Number(event.target.value))}
              />
            </label>
            <label>
              容量（人）
              <input
                type="number"
                min="1"
                step="50"
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              />
            </label>
            <label>
              服务半径（km）
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={serviceRadius}
                onChange={(event) => setServiceRadius(Number(event.target.value))}
              />
            </label>
            <button disabled={busy} type="submit">
              添加模拟设施
            </button>
          </form>

          <div className="facility-list">
            {(detail.facilities ?? []).length === 0 && <p className="empty">尚未添加模拟设施。</p>}
            {(detail.facilities ?? []).map((facility) => (
              <article key={facility.id} className={`facility-item facility-${facility.type}`}>
                <div>
                  <strong>{facilityLabels[facility.type]}</strong>
                  <small>
                    {facility.capacity_value ?? '—'} {facility.capacity_unit ?? ''}
                  </small>
                </div>
                <div className="coordinate-row">
                  <input
                    aria-label={`${facilityLabels[facility.type]}经度`}
                    type="number"
                    step="0.01"
                    defaultValue={facility.lon}
                    id={`lon-${facility.id}`}
                  />
                  <input
                    aria-label={`${facilityLabels[facility.type]}纬度`}
                    type="number"
                    step="0.01"
                    defaultValue={facility.lat}
                    id={`lat-${facility.id}`}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const nextLon = Number(
                        (document.getElementById(`lon-${facility.id}`) as HTMLInputElement).value,
                      )
                      const nextLat = Number(
                        (document.getElementById(`lat-${facility.id}`) as HTMLInputElement).value,
                      )
                      void updatePosition(facility.id, nextLon, nextLat)
                    }}
                  >
                    保存位置
                  </button>
                  <button
                    className="danger"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () => scenarioApi.deleteFacility(detail.id, facility.id),
                        '设施已删除',
                      )
                    }
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="evaluation-control">
            <label>
              风险人口
              <input
                type="number"
                min="1"
                value={atRisk}
                onChange={(event) => setAtRisk(Number(event.target.value))}
              />
            </label>
            <button disabled={busy} type="button" onClick={evaluate}>
              重新评估
            </button>
          </div>
        </>
      )}

      {message && <p className="form-message" role="status">{message}</p>}
      {evaluation && (
        <div className="evaluation-result">
          <div><span>覆盖人口</span><strong>{evaluation.modeled_covered_population}</strong></div>
          <div><span>未覆盖</span><strong>{evaluation.modeled_uncovered_population}</strong></div>
          <div><span>覆盖率</span><strong>{(evaluation.modeled_coverage_ratio * 100).toFixed(1)}%</strong></div>
          <div><span>预算点</span><strong>{evaluation.total_budget_points}</strong></div>
          <p>{evaluation.assumptions[0]}</p>
        </div>
      )}
    </section>
  )
}

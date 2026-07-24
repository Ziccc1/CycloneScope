import { type FormEvent, useEffect, useState } from 'react'
import { dataApi, scenarioApi } from '../api'
import { useAppDispatch, useAppState } from '../state/AppState'
import { displayScenarioName } from './scenarioLabels'
import { deriveRegionalRisk, type RegionalRiskAnalysis } from './a/riskAnalysis'
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

const capacityUnits: Record<FacilityType, { unit: 'people' | 'beds' | 'teams' | 'people_day'; label: string; defaultValue: number; step: number }> = {
  shelter: { unit: 'people', label: '容量（人）', defaultValue: 50000, step: 1 },
  medical: { unit: 'beds', label: '床位数（张）', defaultValue: 50, step: 1 },
  rescue: { unit: 'teams', label: '队伍数（支）', defaultValue: 5, step: 1 },
  warehouse: { unit: 'people_day', label: '服务量（人·日）', defaultValue: 5000, step: 1 },
}

const capacityUnitLabels: Record<string, string> = { people: '人', beds: '张', teams: '支', people_day: '人·日' }

export default function ScenarioPanel({ scenarios, onRefresh }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [detail, setDetail] = useState<ScenarioDetail | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationResponse | null>(null)
  const [regionalEvaluation, setRegionalEvaluation] = useState<RegionalRiskAnalysis | null>(null)
  const [localEvaluationVersion, setLocalEvaluationVersion] = useState(0)
  const [name, setName] = useState('同预算配置探索')
  const [facilityType, setFacilityType] = useState<FacilityType>('shelter')
  const [lon, setLon] = useState<number | ''>(121.6)
  const [lat, setLat] = useState<number | ''>(24)
  const [capacity, setCapacity] = useState<number | ''>(50000)
  const [serviceRadius, setServiceRadius] = useState<number | ''>(50)
  const [atRisk, setAtRisk] = useState(1000)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<FacilityPreview | null>(null)

  async function loadDetail(id: string | null) {
    setMessage('')
    if (!id) {
      setDetail(null)
      setEvaluation(null)
      return
    }
    try {
      const selected = await scenarioApi.get(id)
      setDetail(selected)
      setName(displayScenarioName(selected.name))
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => {
    void loadDetail(state.selectedScenarioId)
  }, [state.selectedScenarioId])

  useEffect(() => {
    if (!detail || !state.selectedStormId) {
      setRegionalEvaluation(null)
      return
    }
    const controller = new AbortController()
    Promise.all([
      dataApi.taiwanZones({}, controller.signal),
      dataApi.impact({ storm_id: state.selectedStormId, metric: state.impactMetric }, controller.signal),
      dataApi.taiwanFacilities({}, controller.signal),
    ])
      .then(([zones, impact, facilities]) => {
        setRegionalEvaluation(deriveRegionalRisk({
          zones,
          impact,
          facilities,
          simulatedFacilities: detail.facilities ?? [],
          facilityType: state.selectedFacilityType,
          threshold: state.hazardThreshold,
        }))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setRegionalEvaluation(null)
      })
    return () => controller.abort()
  }, [detail, localEvaluationVersion, state.hazardThreshold, state.impactMetric, state.selectedFacilityType, state.selectedStormId])

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
      void loadDetail(state.selectedScenarioId)
      setLocalEvaluationVersion((value) => value + 1)
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
    const numericLon = Number(lon)
    const numericLat = Number(lat)
    const numericCapacity = Number(capacity)
    const numericRadius = Number(serviceRadius)
    if (![numericLon, numericLat, numericCapacity, numericRadius].every(Number.isFinite) || numericCapacity <= 0 || numericRadius <= 0) {
      setMessage('请先填写有效的经度、纬度、容量和服务半径。')
      return
    }
    // Adding a simulated facility immediately reveals the current-scenario layer.
    dispatch({ type: 'set-scenario-view', value: 'current' })
    const payload: FacilityCreate = {
      type: facilityType,
      lon: numericLon,
      lat: numericLat,
      capacity_value: numericCapacity,
      capacity_unit: capacityUnits[facilityType].unit,
      service_radius_km: numericRadius,
      budget_points: null,
    }
    await perform(
      () => scenarioApi.addFacility(detail.id, payload),
      '模拟设施已添加',
    )
  }

  async function updateFacilityPlacement(facilityId: string, nextLon: number, nextLat: number, nextRadius: number) {
    if (!detail) return
    await perform(
      () =>
        scenarioApi.updateFacility(detail.id, facilityId, {
          lon: nextLon,
          lat: nextLat,
          service_radius_km: nextRadius,
        }),
      '设施位置与服务半径已保存',
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
          hazard_threshold: state.hazardThreshold,
        }),
      )
      setLocalEvaluationVersion((value) => value + 1)
      onRefresh()
      setMessage('区域指标已重新计算')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const uniqueScenarios = scenarios.filter((scenario, index, all) => all.findIndex((item) => displayScenarioName(item.name) === displayScenarioName(scenario.name)) === index)

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
          {uniqueScenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {displayScenarioName(scenario.name)}
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

          <p className="scenario-parameter-note">演示建议：避难所容量 50,000 人、服务半径 50 km，便于观察方案对高风险区域的局部改善；正式结论请替换为经过核验的设施数据。</p>

          <form className="facility-form" onSubmit={addFacility}>
            <label>
              类型
              <select
                value={facilityType}
                onChange={(event) => {
                const nextType = event.target.value as FacilityType
                setFacilityType(nextType)
                setCapacity(capacityUnits[nextType].defaultValue)
              }}
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
                onChange={(event) => setLon(event.target.value === '' ? '' : Number(event.target.value))}
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
                onChange={(event) => setLat(event.target.value === '' ? '' : Number(event.target.value))}
              />
            </label>
            <label>
              {capacityUnits[facilityType].label}
              <input
                type="number"
                min="1"
                step={capacityUnits[facilityType].step}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value === '' ? '' : Number(event.target.value))}
              />
            </label>
            <label>
              服务半径（km）
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={serviceRadius}
                onChange={(event) => setServiceRadius(event.target.value === '' ? '' : Number(event.target.value))}
              />
            </label>
            <button disabled={busy} type="submit">
              添加模拟设施
            </button>
          </form>
          <p className="facility-drag-hint">提示：切换到“当前方案”后，地图上的设施图标或光圈均可拖动；拖动后会自动保存并重新评估。</p>

          <div className="facility-list">
            {(detail.facilities ?? []).length === 0 && <p className="empty">尚未添加模拟设施。</p>}
            {(detail.facilities ?? []).map((facility) => (
              <article key={facility.id} className={`facility-item facility-${facility.type}`}>
                <div>
                  <strong>{facilityLabels[facility.type]}</strong>
                  <small>
                    {facility.capacity_value ?? '—'} {capacityUnitLabels[facility.capacity_unit ?? ''] ?? facility.capacity_unit ?? ''} · 半径 {facility.service_radius_km ?? '—'} km
                  </small>
                </div>
                <div className="coordinate-row">                <label className="facility-field"><span>经度</span><input
                    aria-label={`${facilityLabels[facility.type]}经度`}
                    type="number"
                    step="0.01"
                    defaultValue={String(facility.lon)}
                    placeholder="经度"
                    id={`lon-${facility.id}`} /></label>                <label className="facility-field"><span>纬度</span><input
                    aria-label={`${facilityLabels[facility.type]}纬度`}
                    type="number"
                    step="0.01"
                    defaultValue={String(facility.lat)}
                    placeholder="纬度"
                    id={`lat-${facility.id}`} /></label>                <label className="facility-field"><span>服务半径（km）</span><input
                    aria-label={`${facilityLabels[facility.type]}服务半径`}
                    type="number"
                    min="0.5"
                    step="0.5"
                    defaultValue={String(facility.service_radius_km ?? 5)}
                    placeholder="半径 km"
                    id={`radius-${facility.id}`} /></label>
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
                      const nextRadius = Number(
                        (document.getElementById(`radius-${facility.id}`) as HTMLInputElement).value,
                      )
                      void updateFacilityPlacement(facility.id, nextLon, nextLat, nextRadius)
                    }}
                  >
                    保存设置
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
              备用风险人口（后端回退）
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
      {regionalEvaluation ? (
        <div className="evaluation-result">
          <div><span>{facilityLabels[state.selectedFacilityType]}设施·高风险人口</span><strong>{regionalEvaluation.current.highRiskPopulation.toLocaleString('zh-CN')}</strong></div>
          <div><span>方案已覆盖</span><strong>{regionalEvaluation.current.covered.toLocaleString('zh-CN')}</strong></div>
          <div><span>方案未覆盖</span><strong>{regionalEvaluation.current.uncovered.toLocaleString('zh-CN')}</strong></div>
          <div><span>方案覆盖率</span><strong>{(regionalEvaluation.current.coverageRatio * 100).toFixed(1)}%</strong></div>
          <p>已统一使用区域分析口径：行政区质心、服务半径与容量分配。人口代理和方法限制见“数据可信度”。</p>
        </div>
      ) : evaluation && (
        <div className="evaluation-result">
          <div><span>简化模型覆盖人口</span><strong>{evaluation.modeled_covered_population}</strong></div>
          <div><span>简化模型未覆盖</span><strong>{evaluation.modeled_uncovered_population}</strong></div>
          <div><span>简化模型覆盖率</span><strong>{(evaluation.modeled_coverage_ratio * 100).toFixed(1)}%</strong></div>
          <div><span>预算点</span><strong>{evaluation.total_budget_points}</strong></div>
          <p>区域数据暂不可用，当前为后端容量总和回退结果，不代表空间覆盖。</p>
        </div>
      )}
    </section>
  )
}

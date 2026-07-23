// Owner: B — complete zone-level facility coverage-gap diagnostic component.
import { useEffect, useMemo, useState } from 'react'
import { dataApi } from '../../api'
import { useAppDispatch, useAppState, type FacilitySelection } from '../../state/AppState'
import type { FacilityCollection, ImpactGridCollection, TaiwanZoneCollection } from '../../types/contracts'
import { ChartHeader, ComponentState, formatNumber } from '../charts/chartUtils'

type SortKey = 'name' | 'risk' | 'covered' | 'uncovered' | 'ratio'
interface GapRow {
  zoneId: string
  name: string
  populationYear: number | null
  highRiskPopulation: number
  coveredPopulation: number
  uncoveredPopulation: number
  coverageRatio: number
  primaryGap: string
  hazard: number | null
  capacityStatus: 'included' | 'unknown'
}

function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number) {
  const toRad = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * toRad / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin((lon2 - lon1) * toRad / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.sqrt(a))
}

function featureCenter(feature: ImpactGridCollection['features'][number]) {
  const geometry = feature.geometry as unknown as { coordinates: number[][][] }
  const ring = geometry.coordinates?.[0] ?? []
  if (!ring.length) return null
  return [
    ring.reduce((sum, point) => sum + point[0], 0) / ring.length,
    ring.reduce((sum, point) => sum + point[1], 0) / ring.length,
  ] as [number, number]
}

interface Props { selectedStormImpactAvailable: boolean }

export default function CoverageGapTable({ selectedStormImpactAvailable }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [zones, setZones] = useState<TaiwanZoneCollection | null>(null)
  const [facilities, setFacilities] = useState<FacilityCollection | null>(null)
  const [impact, setImpact] = useState<ImpactGridCollection | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [error, setError] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: 'uncovered', direction: -1 })

  useEffect(() => {
    const controller = new AbortController()
    if (!state.selectedStormId || !selectedStormImpactAvailable) {
      setStatus('empty')
      setZones(null)
      setFacilities(null)
      setImpact(null)
      return () => controller.abort()
    }
    setStatus('loading')
    setError('')
    Promise.all([
      dataApi.taiwanZones({}, controller.signal),
      dataApi.taiwanFacilities({ type: state.selectedFacilityType }, controller.signal),
      dataApi.impact({ storm_id: state.selectedStormId, metric: 'hazard_index' }, controller.signal),
    ])
      .then(([zoneResponse, facilityResponse, impactResponse]) => {
        setZones(zoneResponse)
        setFacilities(facilityResponse)
        setImpact(impactResponse)
        setStatus(zoneResponse.features.length ? 'ready' : 'empty')
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setStatus('error')
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => controller.abort()
  }, [selectedStormImpactAvailable, state.selectedFacilityType, state.selectedStormId])

  const rows = useMemo<GapRow[]>(() => {
    if (!zones || !facilities || !impact) return []
    const impactCenters = impact.features.map((feature) => ({ feature, center: featureCenter(feature) })).filter((item): item is typeof item & { center: [number, number] } => Boolean(item.center))
    return zones.features.map((zone) => {
      const properties = zone.properties
      const population = properties.population ?? 0
      const nearest = impactCenters.reduce<typeof impactCenters[number] | null>((best, item) => {
        if (!best) return item
        const currentDistance = haversineKm(properties.centroid_lon, properties.centroid_lat, item.center[0], item.center[1])
        const bestDistance = haversineKm(properties.centroid_lon, properties.centroid_lat, best.center[0], best.center[1])
        return currentDistance < bestDistance ? item : best
      }, null)
      const sample = nearest?.feature.properties
      const hazard = typeof sample?.hazard_index === 'number' ? sample.hazard_index : null
      const samplePopulation = typeof sample?.population === 'number' ? sample.population : null
      const sampleExposed = typeof sample?.exposed_population === 'number' ? sample.exposed_population : null
      const exposureRatio = samplePopulation && sampleExposed != null ? Math.min(1, sampleExposed / samplePopulation) : hazard ?? 0
      const highRiskPopulation = hazard != null && hazard >= 0.5 ? Math.round(population * exposureRatio) : 0
      const covering = facilities.features.filter((facility) => {
        const [lon, lat] = facility.geometry.coordinates
        return haversineKm(properties.centroid_lon, properties.centroid_lat, lon, lat) <= facility.properties.service_radius_km
      })
      const capacityCanRepresentPeople = state.selectedFacilityType === 'shelter'
      const knownCapacity = covering.reduce((sum, facility) => sum + (facility.properties.capacity_value ?? 0), 0)
      const allCapacityKnown = covering.every((facility) => facility.properties.capacity_value != null)
      const coveredPopulation = capacityCanRepresentPeople && allCapacityKnown
        ? Math.min(highRiskPopulation, knownCapacity)
        : covering.length ? highRiskPopulation : 0
      const uncoveredPopulation = Math.max(0, highRiskPopulation - coveredPopulation)
      return {
        zoneId: properties.zone_id,
        name: properties.name_zh,
        populationYear: properties.population_year,
        highRiskPopulation,
        coveredPopulation,
        uncoveredPopulation,
        coverageRatio: highRiskPopulation ? coveredPopulation / highRiskPopulation : 0,
        primaryGap: !highRiskPopulation
          ? '当前阈值下无高风险人口'
          : !covering.length
            ? '服务范围外'
            : capacityCanRepresentPeople && allCapacityKnown && knownCapacity < highRiskPopulation
              ? '容量不足'
              : capacityCanRepresentPeople
                ? '无明显缺口'
                : '容量不可换算为人口',
        hazard,
        capacityStatus: capacityCanRepresentPeople && allCapacityKnown ? 'included' : 'unknown',
      }
    })
  }, [facilities, impact, state.selectedFacilityType, zones])
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const values: Record<Exclude<SortKey, 'name'>, (row: GapRow) => number> = {
      risk: (row) => row.highRiskPopulation,
      covered: (row) => row.coveredPopulation,
      uncovered: (row) => row.uncoveredPopulation,
      ratio: (row) => row.coverageRatio,
    }
    if (sort.key === 'name') return left.name.localeCompare(right.name, 'zh-CN') * sort.direction
    return (values[sort.key](left) - values[sort.key](right)) * sort.direction
  }), [rows, sort])
  const maximumUncovered = Math.max(1, ...rows.map((row) => row.uncoveredPopulation))
  const populationYears = [...new Set(rows.map((row) => row.populationYear).filter(Boolean))].join('、') || '未知'

  function changeSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key ? (current.direction === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))
  }

  return (
    <section className="b-component coverage-gap" data-owner="B">
      <ChartHeader eyebrow="COVERAGE GAP · B" title="设施缺口诊断表" meta={<span>{rows.length} 个行政区</span>} />
      <div className="facility-segments" aria-label="设施类型">
        {([
          ['shelter', '避难'],
          ['medical', '医疗'],
          ['rescue', '救援'],
        ] as [FacilitySelection, string][]).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={state.selectedFacilityType === value}
            onClick={() => dispatch({ type: 'set-facility-type', value })}>{label}</button>
        ))}
      </div>
      <div className="coverage-context">
        <span>覆盖方法：设施服务半径＋行政区中心点估计</span>
        <span>人口参考年：{populationYears}</span>
        <span>容量：{state.selectedFacilityType === 'shelter' ? '按 people 纳入' : '单位不可直接换算为人口'}</span>
      </div>
      <ComponentState status={status} error={error} empty={!state.selectedStormId ? '先选择具备台湾影响数据的事件' : '所选事件缺少台湾危险数据，无法进入设施分析'}>
        <div className="gap-table-wrap">
          <table className="gap-table">
            <thead><tr>
              <th><button type="button" onClick={() => changeSort('name')}>行政区</button></th>
              <th><button type="button" onClick={() => changeSort('risk')}>高风险人口</button></th>
              <th><button type="button" onClick={() => changeSort('covered')}>已覆盖</button></th>
              <th><button type="button" onClick={() => changeSort('uncovered')}>未覆盖</button></th>
              <th><button type="button" onClick={() => changeSort('ratio')}>覆盖率</button></th>
              <th>主要缺口</th>
            </tr></thead>
            <tbody>{sortedRows.map((row) => (
              <tr key={row.zoneId} className={state.selectedZoneId === row.zoneId ? 'selected' : ''}
                onClick={() => dispatch({ type: 'select-zone', zoneId: row.zoneId })}>
                <th>{row.name}<small>危险度 {row.hazard?.toFixed(2) ?? '—'}</small></th>
                <td>{formatNumber(row.highRiskPopulation)}</td>
                <td>{formatNumber(row.coveredPopulation)}{row.capacityStatus === 'unknown' && <small>容量未知</small>}</td>
                <td className="gap-value"><i style={{ width: `${row.uncoveredPopulation / maximumUncovered * 100}%` }} />{formatNumber(row.uncoveredPopulation)}</td>
                <td>{(row.coverageRatio * 100).toFixed(1)}%</td>
                <td>{row.primaryGap}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </ComponentState>
      <p className="method-note">高风险人口按危险度阈值 0.5 与格网暴露比例估算；中心点服务半径属于筛查口径，不替代道路可达性或真实工程评估。</p>
    </section>
  )
}

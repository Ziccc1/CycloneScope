/**
 * Component owner: A
 * Pure derivation helpers shared by A's regional-risk components.
 */
import type {
  FacilityCollection,
  FacilityRead,
  ImpactGridCollection,
  TaiwanZoneCollection,
} from '../../types/contracts'
import type { FacilityAnalysisType } from '../../state/AppState'
import { toSimplifiedChinese } from '../scenarioLabels'

export interface RiskZoneMetric {
  zoneId: string
  name: string
  population: number | null
  populationYear: number | null
  hazard: number | null
  exposed: number | null
  baselineCovered: number | null
  baselineUncovered: number | null
  baselineOutsideRange: number | null
  baselineCapacityShortfall: number | null
  currentCovered: number | null
  currentUncovered: number | null
  currentOutsideRange: number | null
  currentCapacityShortfall: number | null
}

export interface CoverageSummary {
  highRiskZoneCount: number
  highRiskPopulation: number
  covered: number
  uncovered: number
  outsideRange: number
  capacityShortfall: number | null
  coverageRatio: number
  blindSpotCount: number
  capacityUtilization: number | null
  budgetPoints: number
  facilityCount: number
}

export interface BudgetPlan {
  id: string
  label: string
  budgetPoints: number
  facilityCount: number
  targetZone: string | null
  summary: CoverageSummary
}

export interface RegionalRiskAnalysis {
  zones: RiskZoneMetric[]
  baseline: CoverageSummary
  current: CoverageSummary
  highestHazardZone: RiskZoneMetric | null
  highestExposureZone: RiskZoneMetric | null
  largestGapZone: RiskZoneMetric | null
  missingHazardCount: number
  missingExposureCount: number
  exposureProxyCount: number
  populationYear: number | null
  method: string
  capacityComparable: boolean
  budgetPlans: BudgetPlan[]
}

interface AnalysisFacility {
  id: string
  type: FacilityAnalysisType
  lon: number
  lat: number
  capacityValue: number | null
  capacityUnit: string | null
  serviceRadiusKm: number
  budgetPoints: number
  simulated: boolean
}

interface ZoneSeed {
  zoneId: string
  name: string
  population: number | null
  populationYear: number | null
  centroid: [number, number]
  hazard: number | null
  exposed: number | null
}

interface ZoneCoverage {
  covered: number | null
  uncovered: number | null
  outsideRange: number | null
  capacityShortfall: number | null
}

const ZONE_NAME_ZH: Record<string, string> = {
  Penghu: '澎湖县',
  Tainan: '台南市',
  Taoyuan: '桃园市',
  'New Taipei': '新北市',
  Taipei: '台北市',
  Chiayi: '嘉义市',
  Kaohsiung: '高雄市',
  Hsinchu: '新竹市',
  Taichung: '台中市',
}

function displayZoneName(value: string) {
  return toSimplifiedChinese(ZONE_NAME_ZH[value.trim()] ?? value)
}
const EMPTY_SUMMARY: CoverageSummary = {
  highRiskZoneCount: 0,
  highRiskPopulation: 0,
  covered: 0,
  uncovered: 0,
  outsideRange: 0,
  capacityShortfall: null,
  coverageRatio: 0,
  blindSpotCount: 0,
  capacityUtilization: null,
  budgetPoints: 0,
  facilityCount: 0,
}

function ringContainsPoint(point: [number, number], ring: number[][]) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index]
    const prior = ring[previous]
    const crosses = (current[1] > point[1]) !== (prior[1] > point[1])
    if (
      crosses
      && point[0] < (prior[0] - current[0]) * (point[1] - current[1])
        / (prior[1] - current[1]) + current[0]
    ) inside = !inside
  }
  return inside
}

function polygonContainsPoint(point: [number, number], polygon: number[][][]) {
  return ringContainsPoint(point, polygon[0])
    && !polygon.slice(1).some((ring) => ringContainsPoint(point, ring))
}

function geometryContainsPoint(
  point: [number, number],
  geometry: { type: string; coordinates: unknown },
) {
  if (geometry.type === 'Polygon') {
    return polygonContainsPoint(point, geometry.coordinates as number[][][])
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][])
      .some((polygon) => polygonContainsPoint(point, polygon))
  }
  return false
}

function distanceKm(left: [number, number], right: [number, number]) {
  const radius = 6371
  const toRadians = (value: number) => value * Math.PI / 180
  const dLat = toRadians(right[1] - left[1])
  const dLon = toRadians(right[0] - left[0])
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(left[1])) * Math.cos(toRadians(right[1]))
      * Math.sin(dLon / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isAnalysisType(value: string): value is FacilityAnalysisType {
  return value === 'shelter' || value === 'medical' || value === 'rescue'
}

function realFacilities(
  collection: FacilityCollection,
  type: FacilityAnalysisType,
): AnalysisFacility[] {
  return collection.features.flatMap((feature) => {
    const properties = feature.properties
    const coordinates = feature.geometry.coordinates
    if (!isAnalysisType(properties.type) || properties.type !== type) return []
    return [{
      id: properties.facility_id,
      type,
      lon: coordinates[0],
      lat: coordinates[1],
      capacityValue: properties.capacity_value,
      capacityUnit: properties.capacity_unit,
      serviceRadiusKm: properties.service_radius_km,
      budgetPoints: 0,
      simulated: false,
    }]
  })
}

function simulatedFacilities(
  facilities: FacilityRead[],
  type: FacilityAnalysisType,
): AnalysisFacility[] {
  return facilities.flatMap((facility) => {
    if (!isAnalysisType(facility.type) || facility.type !== type) return []
    return [{
      id: facility.id,
      type,
      lon: facility.lon,
      lat: facility.lat,
      capacityValue: facility.capacity_value,
      capacityUnit: facility.capacity_unit,
      serviceRadiusKm: facility.service_radius_km ?? 0,
      budgetPoints: facility.budget_points ?? 0,
      simulated: true,
    }]
  })
}

function deriveCoverage(
  seeds: ZoneSeed[],
  facilities: AnalysisFacility[],
  threshold: number,
  capacityComparable: boolean,
) {
  const highRisk = seeds.filter((zone) => zone.hazard != null && zone.hazard >= threshold)
  const assignedCapacity = new Map<string, number>()
  if (capacityComparable) {
    for (const facility of facilities) {
      const comparableCapacity = facility.capacityUnit === 'people' ? facility.capacityValue : null
      if (comparableCapacity == null || facility.serviceRadiusKm <= 0) continue
      const candidates = highRisk
        .map((zone) => ({
          zone,
          distance: distanceKm([facility.lon, facility.lat], zone.centroid),
        }))
        .filter((entry) => entry.distance <= facility.serviceRadiusKm)
      if (!candidates.length) continue
      const weights = candidates.map((entry) =>
        Math.max(0.05, 1 - entry.distance / facility.serviceRadiusKm))
      const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)
      candidates.forEach((entry, index) => {
        const distanceFactor = Math.max(0.05, 1 - entry.distance / facility.serviceRadiusKm)
        const allocated = comparableCapacity * (weights[index] / weightTotal) * distanceFactor
        assignedCapacity.set(
          entry.zone.zoneId,
          (assignedCapacity.get(entry.zone.zoneId) ?? 0) + allocated,
        )
      })
    }
  }

  const coverage = new Map<string, ZoneCoverage>()
  for (const zone of seeds) {
    if (zone.hazard == null || zone.hazard < threshold || zone.exposed == null) {
      coverage.set(zone.zoneId, {
        covered: null,
        uncovered: null,
        outsideRange: null,
        capacityShortfall: null,
      })
      continue
    }
    const inRange = facilities.some((facility) =>
      facility.serviceRadiusKm > 0
      && distanceKm([facility.lon, facility.lat], zone.centroid) <= facility.serviceRadiusKm)
    if (!inRange) {
      coverage.set(zone.zoneId, {
        covered: 0,
        uncovered: zone.exposed,
        outsideRange: zone.exposed,
        capacityShortfall: capacityComparable ? 0 : null,
      })
      continue
    }
    const covered = capacityComparable
      ? Math.min(zone.exposed, assignedCapacity.get(zone.zoneId) ?? 0)
      : zone.exposed
    coverage.set(zone.zoneId, {
      covered,
      uncovered: zone.exposed - covered,
      outsideRange: 0,
      capacityShortfall: capacityComparable ? zone.exposed - covered : null,
    })
  }
  return coverage
}

function zoneValue(
  zone: RiskZoneMetric,
  prefix: 'baseline' | 'current',
  suffix: 'Covered' | 'Uncovered' | 'OutsideRange' | 'CapacityShortfall',
) {
  const key = (prefix + suffix) as keyof RiskZoneMetric
  const value = zone[key]
  return typeof value === 'number' ? value : null
}

function summarize(
  zones: RiskZoneMetric[],
  view: 'baseline' | 'current',
  facilities: AnalysisFacility[],
  threshold: number,
  capacityComparable: boolean,
): CoverageSummary {
  const highRisk = zones.filter((zone) => zone.hazard != null && zone.hazard >= threshold && zone.exposed != null)
  if (!highRisk.length) return { ...EMPTY_SUMMARY, capacityShortfall: capacityComparable ? 0 : null }
  const highRiskPopulation = highRisk.reduce((sum, zone) => sum + (zone.exposed ?? 0), 0)
  const covered = highRisk.reduce((sum, zone) => sum + (zoneValue(zone, view, 'Covered') ?? 0), 0)
  const uncovered = highRisk.reduce((sum, zone) => sum + (zoneValue(zone, view, 'Uncovered') ?? 0), 0)
  const outsideRange = highRisk.reduce((sum, zone) => sum + (zoneValue(zone, view, 'OutsideRange') ?? 0), 0)
  const capacityShortfall = capacityComparable
    ? highRisk.reduce((sum, zone) => sum + (zoneValue(zone, view, 'CapacityShortfall') ?? 0), 0)
    : null
  const comparableCapacity = facilities.reduce(
    (sum, facility) => sum + (facility.capacityUnit === 'people' ? facility.capacityValue ?? 0 : 0),
    0,
  )
  const budgetPoints = facilities.reduce(
    (sum, facility) => sum + facility.budgetPoints,
    0,
  )
  return {
    highRiskZoneCount: highRisk.length,
    highRiskPopulation,
    covered,
    uncovered,
    outsideRange,
    capacityShortfall,
    coverageRatio: highRiskPopulation > 0 ? covered / highRiskPopulation : 0,
    blindSpotCount: highRisk.filter(
      (zone) => (zoneValue(zone, view, 'OutsideRange') ?? 0) > 0,
    ).length,
    capacityUtilization: capacityComparable && comparableCapacity > 0
      ? Math.min(1, covered / comparableCapacity)
      : null,
    budgetPoints,
    facilityCount: facilities.length,
  }
}

function greatest(
  zones: RiskZoneMetric[],
  select: (zone: RiskZoneMetric) => number | null,
) {
  return zones.reduce<RiskZoneMetric | null>((best, zone) => {
    const value = select(zone)
    if (value == null) return best
    if (!best) return zone
    const bestValue = select(best)
    return bestValue == null || value > bestValue ? zone : best
  }, null)
}

export interface RegionalRiskInput {
  zones: TaiwanZoneCollection
  impact: ImpactGridCollection
  facilities: FacilityCollection
  simulatedFacilities?: FacilityRead[]
  facilityType: FacilityAnalysisType
  threshold: number
}

export function deriveRegionalRisk({
  zones,
  impact,
  facilities,
  simulatedFacilities: scenarioFacilities = [],
  facilityType,
  threshold,
}: RegionalRiskInput): RegionalRiskAnalysis {
  const seeds: ZoneSeed[] = zones.features.map((feature) => {
    const properties = feature.properties
    const centroid: [number, number] = [
      properties.centroid_lon,
      properties.centroid_lat,
    ]
    const impactCell = impact.features.find((cell) =>
      geometryContainsPoint(centroid, cell.geometry))
    return {
      zoneId: properties.zone_id,
      name: displayZoneName(properties.name_zh),
      population: properties.population,
      populationYear: properties.population_year,
      centroid,
      hazard: impactCell?.properties.hazard_index ?? null,
      // Processed impact grids may not contain modeled exposure yet. Use the zone population as an explicit proxy so the narrative remains inspectable; the method note labels this limitation.
      exposed: impactCell?.properties.exposed_population ?? (impactCell ? properties.population : null),
    }
  })

  const baselineFacilities = realFacilities(facilities, facilityType)
  const currentFacilities = [
    ...baselineFacilities,
    ...simulatedFacilities(scenarioFacilities, facilityType),
  ]
  const capacityComparable = facilityType === 'shelter'
  const baselineCoverage = deriveCoverage(
    seeds,
    baselineFacilities,
    threshold,
    capacityComparable,
  )
  const currentCoverage = deriveCoverage(
    seeds,
    currentFacilities,
    threshold,
    capacityComparable,
  )
  const zoneMetrics = seeds.map<RiskZoneMetric>((zone) => ({
    zoneId: zone.zoneId,
    name: zone.name,
    population: zone.population,
    populationYear: zone.populationYear,
    hazard: zone.hazard,
    exposed: zone.exposed,
    baselineCovered: baselineCoverage.get(zone.zoneId)?.covered ?? null,
    baselineUncovered: baselineCoverage.get(zone.zoneId)?.uncovered ?? null,
    baselineOutsideRange: baselineCoverage.get(zone.zoneId)?.outsideRange ?? null,
    baselineCapacityShortfall: baselineCoverage.get(zone.zoneId)?.capacityShortfall ?? null,
    currentCovered: currentCoverage.get(zone.zoneId)?.covered ?? null,
    currentUncovered: currentCoverage.get(zone.zoneId)?.uncovered ?? null,
    currentOutsideRange: currentCoverage.get(zone.zoneId)?.outsideRange ?? null,
    currentCapacityShortfall: currentCoverage.get(zone.zoneId)?.capacityShortfall ?? null,
  }))
  const targetCandidates = [
    { id: 'gap-first', label: '优先补最大缺口', zone: greatest(zoneMetrics, (zone) => zone.baselineUncovered) },
    { id: 'exposure-first', label: '优先覆盖暴露人口', zone: greatest(zoneMetrics, (zone) => zone.exposed) },
    { id: 'hazard-first', label: '优先响应最高危险度', zone: greatest(zoneMetrics, (zone) => zone.hazard) },
  ]
  const budgetPlans: BudgetPlan[] = targetCandidates.flatMap(({ id, label, zone }) => {
    if (!zone) return []
    const target = seeds.find((seed) => seed.zoneId === zone.zoneId)
    if (!target) return []
    const planFacility: AnalysisFacility = {
      id: `plan-${id}`,
      type: facilityType,
      lon: target.centroid[0],
      lat: target.centroid[1],
      capacityValue: facilityType === 'shelter' ? 50_000 : null,
      capacityUnit: facilityType === 'shelter' ? 'people' : null,
      serviceRadiusKm: 50,
      budgetPoints: 3,
      simulated: true,
    }
    const planFacilities = [...baselineFacilities, planFacility]
    const planCoverage = deriveCoverage(seeds, planFacilities, threshold, capacityComparable)
    const planMetrics = zoneMetrics.map((metric) => ({
      ...metric,
      currentCovered: planCoverage.get(metric.zoneId)?.covered ?? null,
      currentUncovered: planCoverage.get(metric.zoneId)?.uncovered ?? null,
      currentOutsideRange: planCoverage.get(metric.zoneId)?.outsideRange ?? null,
      currentCapacityShortfall: planCoverage.get(metric.zoneId)?.capacityShortfall ?? null,
    }))
    return [{
      id,
      label,
      budgetPoints: planFacility.budgetPoints,
      facilityCount: planFacilities.length,
      targetZone: zone.name,
      summary: summarize(planMetrics, 'current', planFacilities, threshold, capacityComparable),
    }]
  })

  const exposureProxyCount = seeds.filter((zone) => {
    const impactCell = impact.features.find((cell) => geometryContainsPoint(zone.centroid, cell.geometry))
    return impactCell?.properties.exposed_population == null && impactCell != null && zone.population != null
  }).length

  const populationYears = zoneMetrics
    .map((zone) => zone.populationYear)
    .filter((year): year is number => year != null)

  return {
    zones: zoneMetrics,
    baseline: summarize(zoneMetrics, 'baseline', baselineFacilities, threshold, capacityComparable),
    current: summarize(zoneMetrics, 'current', currentFacilities, threshold, capacityComparable),
    highestHazardZone: greatest(zoneMetrics, (zone) => zone.hazard),
    highestExposureZone: greatest(zoneMetrics, (zone) => zone.exposed),
    largestGapZone: greatest(zoneMetrics, (zone) => zone.currentUncovered),
    missingHazardCount: zoneMetrics.filter((zone) => zone.hazard == null).length,
    missingExposureCount: zoneMetrics.filter((zone) => zone.exposed == null).length,
    exposureProxyCount,
    populationYear: populationYears.length ? Math.max(...populationYears) : null,
    method: capacityComparable
      ? '行政区质心落入影响网格；影响网格缺少暴露人口时使用行政区人口作为代理；设施服务半径判定可达；避难容量按行政区质心距离衰减，并在可达高风险区之间分配，避免把中心与边缘位置算成完全相同。'
      : '行政区质心落入影响网格；医疗/救援仅按服务半径判断可达，不跨单位换算容量。',
    capacityComparable,
    budgetPlans,
  }
}

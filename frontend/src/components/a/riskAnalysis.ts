/**
 * Regional scenario model.
 * Demand is disaggregated to a ~2.5 km lattice so position and radius remain spatially observable.
 * Shelter capacity follows a capacity-conserving E2SFCA-style allocation; medical/rescue use
 * distance-decayed physical accessibility because the source data has no comparable capacities.
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
  reachablePopulation: number
  scenarioReachablePopulation: number
  capacityShortfall: number | null
  coverageRatio: number
  riskWeightedCoverageRatio: number
  blindSpotCount: number
  demandPointCount: number
  capacityUtilization: number | null
  capacityValue: number
  capacityUnit: string | null
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

interface ImpactCell {
  id: string
  west: number
  east: number
  south: number
  north: number
  hazard: number | null
  exposedPopulation: number | null
}

interface DemandPoint {
  index: number
  zoneId: string
  lon: number
  lat: number
  population: number
  hazard: number
  impactCellId: string
}

interface ZoneSeed {
  zoneId: string
  name: string
  population: number | null
  populationYear: number | null
  centroid: [number, number]
  hazard: number | null
  exposed: number | null
  usesExposureProxy: boolean
}

interface DemandModel {
  zones: ZoneSeed[]
  points: DemandPoint[]
  pointBuckets: Map<string, number[]>
  bucketStep: number
  missingHazardCount: number
  missingExposureCount: number
  exposureProxyCount: number
}

interface ZoneCoverage {
  covered: number
  uncovered: number
  outsideRange: number
  reachable: number
  scenarioReachable: number
  capacityShortfall: number | null
}

interface CoverageComputation {
  zones: Map<string, ZoneCoverage>
  covered: number
  uncovered: number
  outsideRange: number
  reachable: number
  scenarioReachable: number
  riskWeightedCovered: number
  riskWeightedDemand: number
  blindSpotCount: number
  demandPointCount: number
}

const GRID_STEP_DEG = 0.025
const MAX_RING_POINTS = 360
const EARTH_RADIUS_KM = 6371

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

function geometryPoints(geometry: { type: string; coordinates: unknown }) {
  if (geometry.type === 'Polygon') return (geometry.coordinates as number[][][]).flat()
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as number[][][][]).flat(2)
  return [] as number[][]
}

function geometryBounds(geometry: { type: string; coordinates: unknown }) {
  const points = geometryPoints(geometry)
  if (!points.length) return null
  const longitudes = points.map((point) => point[0])
  const latitudes = points.map((point) => point[1])
  return {
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
  }
}

function simplifyRing(ring: number[][], maximumPoints = MAX_RING_POINTS) {
  if (ring.length <= maximumPoints) return ring
  const step = Math.ceil((ring.length - 1) / maximumPoints)
  const simplified = ring.filter((_, index) => index % step === 0)
  const last = ring[ring.length - 1]
  if (simplified[simplified.length - 1] !== last) simplified.push(last)
  return simplified
}

function simplifyGeometry(geometry: { type: string; coordinates: unknown }) {
  if (geometry.type === 'Polygon') {
    return {
      type: geometry.type,
      coordinates: (geometry.coordinates as number[][][]).map((ring) => simplifyRing(ring)),
    }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: geometry.type,
      coordinates: (geometry.coordinates as number[][][][]).map((polygon) =>
        polygon.map((ring) => simplifyRing(ring))),
    }
  }
  return geometry
}

function distanceKm(left: [number, number], right: [number, number]) {
  const toRadians = (value: number) => value * Math.PI / 180
  const dLat = toRadians(right[1] - left[1])
  const dLon = toRadians(right[0] - left[0])
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(left[1])) * Math.cos(toRadians(right[1]))
      * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanceWeight(distance: number, radius: number) {
  if (radius <= 0 || distance > radius) return 0
  const normalized = distance / radius
  return Math.exp(-2.302585093 * normalized * normalized)
}

function isAnalysisType(value: string): value is FacilityAnalysisType {
  return value === 'shelter' || value === 'medical' || value === 'rescue'
}

function realFacilities(collection: FacilityCollection, type: FacilityAnalysisType): AnalysisFacility[] {
  return collection.features.flatMap((feature) => {
    const properties = feature.properties
    if (!isAnalysisType(properties.type) || properties.type !== type) return []
    return [{
      id: properties.facility_id,
      type,
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
      capacityValue: properties.capacity_value,
      capacityUnit: properties.capacity_unit,
      serviceRadiusKm: properties.service_radius_km,
      budgetPoints: 0,
      simulated: false,
    }]
  })
}

function scenarioFacilities(facilities: FacilityRead[], type: FacilityAnalysisType): AnalysisFacility[] {
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

function impactCells(collection: ImpactGridCollection): ImpactCell[] {
  return collection.features.flatMap((feature) => {
    const bounds = geometryBounds(feature.geometry as { type: string; coordinates: unknown })
    if (!bounds) return []
    return [{
      id: feature.properties.cell_id,
      ...bounds,
      hazard: feature.properties.hazard_index,
      exposedPopulation: feature.properties.exposed_population,
    }]
  })
}

function containingImpactCell(point: [number, number], cells: ImpactCell[]) {
  return cells.find((cell) =>
    point[0] >= cell.west && point[0] <= cell.east
    && point[1] >= cell.south && point[1] <= cell.north)
}

function alignedValues(minimum: number, maximum: number, step: number) {
  const values: number[] = []
  const start = Math.ceil(minimum / step) * step
  for (let value = start; value <= maximum + step * 0.01; value += step) {
    values.push(Number(value.toFixed(6)))
  }
  return values
}

function bucketKey(lon: number, lat: number, step: number) {
  return Math.floor(lon / step) + ':' + Math.floor(lat / step)
}

function buildDemandModel(
  zones: TaiwanZoneCollection,
  impact: ImpactGridCollection,
  threshold: number,
): DemandModel {
  const cells = impactCells(impact)
  const rawByZone = new Map<string, Array<{ lon: number; lat: number; cell: ImpactCell }>>()
  const seedMeta = new Map<string, {
    name: string
    population: number | null
    populationYear: number | null
    centroid: [number, number]
  }>()

  for (const feature of zones.features) {
    const properties = feature.properties
    const zoneId = properties.zone_id
    const centroid: [number, number] = [properties.centroid_lon, properties.centroid_lat]
    const geometry = simplifyGeometry(feature.geometry as { type: string; coordinates: unknown })
    const bounds = geometryBounds(geometry)
    const samples: Array<{ lon: number; lat: number; cell: ImpactCell }> = []
    if (bounds) {
      const longitudes = alignedValues(bounds.west, bounds.east, GRID_STEP_DEG)
      const latitudes = alignedValues(bounds.south, bounds.north, GRID_STEP_DEG)
      for (const lat of latitudes) {
        for (const lon of longitudes) {
          if (!geometryContainsPoint([lon, lat], geometry)) continue
          const cell = containingImpactCell([lon, lat], cells)
          if (cell) samples.push({ lon, lat, cell })
        }
      }
    }
    if (!samples.length) {
      const cell = containingImpactCell(centroid, cells)
      if (cell) samples.push({ lon: centroid[0], lat: centroid[1], cell })
    }
    rawByZone.set(zoneId, samples)
    seedMeta.set(zoneId, {
      name: displayZoneName(properties.name_zh),
      population: properties.population,
      populationYear: properties.population_year,
      centroid,
    })
  }

  const samplesPerImpactCell = new Map<string, number>()
  for (const samples of rawByZone.values()) {
    for (const sample of samples) {
      samplesPerImpactCell.set(
        sample.cell.id,
        (samplesPerImpactCell.get(sample.cell.id) ?? 0) + 1,
      )
    }
  }

  const points: DemandPoint[] = []
  const zoneSeeds: ZoneSeed[] = []
  for (const feature of zones.features) {
    const zoneId = feature.properties.zone_id
    const samples = rawByZone.get(zoneId) ?? []
    const meta = seedMeta.get(zoneId)!
    const proxyPointPopulation = meta.population != null && samples.length
      ? meta.population / samples.length
      : 0
    const validHazards = samples
      .map((sample) => sample.cell.hazard)
      .filter((value): value is number => value != null)
    const highRiskSamples = samples.filter((sample) =>
      sample.cell.hazard != null && sample.cell.hazard >= threshold)
    const usesExposureProxy = highRiskSamples.some((sample) => sample.cell.exposedPopulation == null)
    let highRiskPopulation = 0
    for (const sample of highRiskSamples) {
      const samplePopulation = sample.cell.exposedPopulation != null
        ? sample.cell.exposedPopulation / Math.max(1, samplesPerImpactCell.get(sample.cell.id) ?? 1)
        : proxyPointPopulation
      highRiskPopulation += samplePopulation
      points.push({
        index: points.length,
        zoneId,
        lon: sample.lon,
        lat: sample.lat,
        population: samplePopulation,
        hazard: sample.cell.hazard!,
        impactCellId: sample.cell.id,
      })
    }
    const zoneExposure = meta.population == null && usesExposureProxy
      ? null
      : highRiskPopulation
    zoneSeeds.push({
      zoneId,
      name: meta.name,
      population: meta.population,
      populationYear: meta.populationYear,
      centroid: meta.centroid,
      hazard: validHazards.length
        ? validHazards.reduce((sum, value) => sum + value, 0) / validHazards.length
        : null,
      exposed: zoneExposure,
      usesExposureProxy,
    })
  }

  const pointBuckets = new Map<string, number[]>()
  for (const point of points) {
    const key = bucketKey(point.lon, point.lat, GRID_STEP_DEG)
    const existing = pointBuckets.get(key)
    if (existing) existing.push(point.index)
    else pointBuckets.set(key, [point.index])
  }
  return {
    zones: zoneSeeds,
    points,
    pointBuckets,
    bucketStep: GRID_STEP_DEG,
    missingHazardCount: zoneSeeds.filter((zone) => zone.hazard == null).length,
    missingExposureCount: zoneSeeds.filter((zone) => zone.exposed == null).length,
    exposureProxyCount: zoneSeeds.filter((zone) => zone.usesExposureProxy).length,
  }
}

function nearbyPoints(model: DemandModel, facility: AnalysisFacility) {
  const radius = facility.serviceRadiusKm
  if (radius <= 0 || !model.points.length) return [] as Array<{ index: number; weight: number }>
  const latDelta = radius / 110.574
  const lonDelta = radius / Math.max(30, 111.32 * Math.cos(facility.lat * Math.PI / 180))
  const minX = Math.floor((facility.lon - lonDelta) / model.bucketStep)
  const maxX = Math.floor((facility.lon + lonDelta) / model.bucketStep)
  const minY = Math.floor((facility.lat - latDelta) / model.bucketStep)
  const maxY = Math.floor((facility.lat + latDelta) / model.bucketStep)
  const candidates: Array<{ index: number; weight: number }> = []
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (const index of model.pointBuckets.get(x + ':' + y) ?? []) {
        const point = model.points[index]
        const distance = distanceKm([facility.lon, facility.lat], [point.lon, point.lat])
        if (distance <= radius) candidates.push({ index, weight: distanceWeight(distance, radius) })
      }
    }
  }
  return candidates
}

function deriveCoverage(
  model: DemandModel,
  facilities: AnalysisFacility[],
  facilityType: FacilityAnalysisType,
): CoverageComputation {
  const pointCount = model.points.length
  const reachable = new Uint8Array(pointCount)
  const scenarioReachable = new Uint8Array(pointCount)
  const coverageScore = new Float64Array(pointCount)
  const accessComplement = new Float64Array(pointCount)
  accessComplement.fill(1)

  for (const facility of facilities) {
    const candidates = nearbyPoints(model, facility)
    if (!candidates.length) continue
    for (const candidate of candidates) {
      reachable[candidate.index] = 1
      if (facility.simulated) scenarioReachable[candidate.index] = 1
    }
    if (facilityType === 'shelter') {
      if (facility.capacityUnit !== 'people' || facility.capacityValue == null || facility.capacityValue <= 0) continue
      const weightedDemand = candidates.reduce((sum, candidate) => {
        const point = model.points[candidate.index]
        return sum + point.population * point.hazard * candidate.weight
      }, 0)
      if (weightedDemand <= 0) continue
      const supplyDemandRatio = facility.capacityValue / weightedDemand
      for (const candidate of candidates) {
        const point = model.points[candidate.index]
        coverageScore[candidate.index] += supplyDemandRatio * point.hazard * candidate.weight
      }
    } else {
      for (const candidate of candidates) {
        accessComplement[candidate.index] *= 1 - candidate.weight
      }
    }
  }

  const zoneResults = new Map<string, ZoneCoverage>()
  for (const zone of model.zones) {
    zoneResults.set(zone.zoneId, {
      covered: 0,
      uncovered: 0,
      outsideRange: 0,
      reachable: 0,
      scenarioReachable: 0,
      capacityShortfall: facilityType === 'shelter' ? 0 : null,
    })
  }

  let covered = 0
  let uncovered = 0
  let outsideRange = 0
  let reachablePopulation = 0
  let scenarioReachablePopulation = 0
  let riskWeightedCovered = 0
  let riskWeightedDemand = 0
  let blindSpotCount = 0

  for (const point of model.points) {
    const share = facilityType === 'shelter'
      ? Math.min(1, coverageScore[point.index])
      : 1 - accessComplement[point.index]
    const pointCovered = point.population * share
    const pointUncovered = Math.max(0, point.population - pointCovered)
    const pointReachable = reachable[point.index] ? point.population : 0
    const pointScenarioReachable = scenarioReachable[point.index] ? point.population : 0
    const pointOutside = reachable[point.index] ? 0 : point.population
    if (!reachable[point.index]) blindSpotCount += 1
    covered += pointCovered
    uncovered += pointUncovered
    outsideRange += pointOutside
    reachablePopulation += pointReachable
    scenarioReachablePopulation += pointScenarioReachable
    riskWeightedCovered += pointCovered * point.hazard
    riskWeightedDemand += point.population * point.hazard
    const zone = zoneResults.get(point.zoneId)!
    zone.covered += pointCovered
    zone.uncovered += pointUncovered
    zone.outsideRange += pointOutside
    zone.reachable += pointReachable
    zone.scenarioReachable += pointScenarioReachable
    if (zone.capacityShortfall != null) {
      zone.capacityShortfall += Math.max(0, pointReachable - pointCovered)
    }
  }

  return {
    zones: zoneResults,
    covered,
    uncovered,
    outsideRange,
    reachable: reachablePopulation,
    scenarioReachable: scenarioReachablePopulation,
    riskWeightedCovered,
    riskWeightedDemand,
    blindSpotCount,
    demandPointCount: pointCount,
  }
}

function summarize(
  model: DemandModel,
  computation: CoverageComputation,
  facilities: AnalysisFacility[],
  capacityComparable: boolean,
): CoverageSummary {
  const highRiskPopulation = model.points.reduce((sum, point) => sum + point.population, 0)
  const comparableCapacity = facilities.reduce(
    (sum, facility) => sum + (facility.capacityUnit === 'people' ? facility.capacityValue ?? 0 : 0),
    0,
  )
  const capacityValue = facilities.reduce((sum, facility) => sum + (facility.capacityValue ?? 0), 0)
  const capacityUnits = [...new Set(
    facilities.map((facility) => facility.capacityUnit).filter((unit): unit is string => unit != null),
  )]
  return {
    highRiskZoneCount: model.zones.filter((zone) => (zone.exposed ?? 0) > 0).length,
    highRiskPopulation,
    covered: computation.covered,
    uncovered: computation.uncovered,
    outsideRange: computation.outsideRange,
    reachablePopulation: computation.reachable,
    scenarioReachablePopulation: computation.scenarioReachable,
    capacityShortfall: capacityComparable
      ? Math.max(0, computation.reachable - computation.covered)
      : null,
    coverageRatio: highRiskPopulation > 0 ? computation.covered / highRiskPopulation : 0,
    riskWeightedCoverageRatio: computation.riskWeightedDemand > 0
      ? computation.riskWeightedCovered / computation.riskWeightedDemand
      : 0,
    blindSpotCount: computation.blindSpotCount,
    demandPointCount: computation.demandPointCount,
    capacityUtilization: capacityComparable && comparableCapacity > 0
      ? Math.min(1, computation.covered / comparableCapacity)
      : null,
    capacityValue,
    capacityUnit: capacityUnits.length === 1 ? capacityUnits[0] : null,
    budgetPoints: facilities.reduce((sum, facility) => sum + facility.budgetPoints, 0),
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
  simulatedFacilities = [],
  facilityType,
  threshold,
}: RegionalRiskInput): RegionalRiskAnalysis {
  const model = buildDemandModel(zones, impact, threshold)
  const baselineFacilities = realFacilities(facilities, facilityType)
  const addedFacilities = scenarioFacilities(simulatedFacilities, facilityType)
  const currentFacilities = [...baselineFacilities, ...addedFacilities]
  const capacityComparable = facilityType === 'shelter'
  const baselineCoverage = deriveCoverage(model, baselineFacilities, facilityType)
  const currentCoverage = deriveCoverage(model, currentFacilities, facilityType)

  const zoneMetrics = model.zones.map<RiskZoneMetric>((zone) => {
    const baseline = baselineCoverage.zones.get(zone.zoneId)
    const current = currentCoverage.zones.get(zone.zoneId)
    return {
      zoneId: zone.zoneId,
      name: zone.name,
      population: zone.population,
      populationYear: zone.populationYear,
      hazard: zone.hazard,
      exposed: zone.exposed,
      baselineCovered: baseline?.covered ?? null,
      baselineUncovered: baseline?.uncovered ?? null,
      baselineOutsideRange: baseline?.outsideRange ?? null,
      baselineCapacityShortfall: baseline?.capacityShortfall ?? null,
      currentCovered: current?.covered ?? null,
      currentUncovered: current?.uncovered ?? null,
      currentOutsideRange: current?.outsideRange ?? null,
      currentCapacityShortfall: current?.capacityShortfall ?? null,
    }
  })

  const targetCandidates = [
    { id: 'gap-first', label: '优先补最大缺口', zone: greatest(zoneMetrics, (zone) => zone.baselineUncovered) },
    { id: 'exposure-first', label: '优先覆盖暴露人口', zone: greatest(zoneMetrics, (zone) => zone.exposed) },
    { id: 'hazard-first', label: '优先响应最高危险度', zone: greatest(zoneMetrics, (zone) => zone.hazard) },
  ]
  const budgetPlans: BudgetPlan[] = targetCandidates.flatMap(({ id, label, zone }) => {
    if (!zone) return []
    const target = model.zones.find((candidate) => candidate.zoneId === zone.zoneId)
    if (!target) return []
    const planFacility: AnalysisFacility = {
      id: 'plan-' + id,
      type: facilityType,
      lon: target.centroid[0],
      lat: target.centroid[1],
      capacityValue: facilityType === 'shelter' ? 500 : facilityType === 'medical' ? 20 : 5,
      capacityUnit: facilityType === 'shelter' ? 'people' : facilityType === 'medical' ? 'beds' : 'teams',
      serviceRadiusKm: facilityType === 'shelter' ? 5 : 10,
      budgetPoints: 3,
      simulated: true,
    }
    const planFacilities = [...baselineFacilities, planFacility]
    const planCoverage = deriveCoverage(model, planFacilities, facilityType)
    return [{
      id,
      label,
      budgetPoints: planFacility.budgetPoints,
      facilityCount: planFacilities.length,
      targetZone: zone.name,
      summary: summarize(model, planCoverage, planFacilities, capacityComparable),
    }]
  })

  const populationYears = zoneMetrics
    .map((zone) => zone.populationYear)
    .filter((year): year is number => year != null)

  return {
    zones: zoneMetrics,
    baseline: summarize(model, baselineCoverage, baselineFacilities, capacityComparable),
    current: summarize(model, currentCoverage, currentFacilities, capacityComparable),
    highestHazardZone: greatest(zoneMetrics, (zone) => zone.hazard),
    highestExposureZone: greatest(zoneMetrics, (zone) => zone.exposed),
    largestGapZone: greatest(zoneMetrics, (zone) => zone.currentUncovered),
    missingHazardCount: model.missingHazardCount,
    missingExposureCount: model.missingExposureCount,
    exposureProxyCount: model.exposureProxyCount,
    populationYear: populationYears.length ? Math.max(...populationYears) : null,
    method: capacityComparable
      ? '将行政区人口均匀分配到约 0.025°（约 2.5 km）需求格点，与危险度网格叠置识别高风险人口；设施按球面距离、服务半径和高斯距离衰减建立浮动服务区，再以供需比配置避难容量。每处设施分配总量不超过其登记容量，人口也不会重复计入。'
      : '将行政区人口均匀分配到约 0.025°（约 2.5 km）需求格点，与危险度网格叠置；医疗/救援按球面距离、服务半径和高斯距离衰减计算空间可达率。因真实设施缺少床位或队伍容量，不跨单位推算收治/救援人数。',
    capacityComparable,
    budgetPlans,
  }
}

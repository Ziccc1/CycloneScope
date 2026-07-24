import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ApiError, dataApi, scenarioApi } from '../api'
import { useAppDispatch, useAppState, type ImpactMetric } from '../state/AppState'
<<<<<<< HEAD
import type { StormSummary, TrackPoint, TrajectoryMatchRequest, TrajectoryMatchResponse, WindManifest } from '../types/contracts'
=======
import type { StormSummary, TrackPoint, TrajectoryMatchRequest, WindManifest } from '../types/contracts'
>>>>>>> origin/main
import WindOverlay from './WindOverlay'

interface Props {
  storms: StormSummary[]
  windMode?: boolean
  drawMode?: boolean
  scenarioVersion?: number
}

type TrackPointWithTime = TrackPoint & { time: string }

const TAIWAN_BOUNDS: [[number, number], [number, number]] = [
  [119, 21.5],
  [122.5, 25.5],
]

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

const IMPACT_METRICS: Record<ImpactMetric, { label: string; unit: string; stops: number[] }> = {
  hazard_index: { label: '模型危险度', unit: '0–1', stops: [0, 0.25, 0.5, 0.75, 1] },
  max_wind_ms: { label: '最大风速', unit: 'm/s', stops: [0, 15, 30, 50, 75] },
  precip_mm: { label: '累计降水', unit: 'mm', stops: [0, 50, 150, 350, 700] },
  population: { label: '格网人口', unit: '人', stops: [0, 2_000, 10_000, 40_000, 120_000] },
  exposed_population: { label: '暴露人口', unit: '人', stops: [0, 1_000, 5_000, 20_000, 80_000] },
  reported_damage_usd: { label: '报告灾损', unit: 'USD', stops: [0, 1e7, 1e8, 1e9, 1e10] },
}

function impactColor(metric: ImpactMetric) {
  const { stops } = IMPACT_METRICS[metric]
  return [
    'case',
    ['==', ['get', 'impact_value'], null], 'rgba(0,0,0,0)',
    [
      'interpolate', ['linear'], ['to-number', ['get', 'impact_value']],
      stops[0], '#1a9850', stops[1], '#91cf60', stops[2], '#fee08b', stops[3], '#fc8d59', stops[4], '#d73027',
    ],
  ] as maplibregl.ExpressionSpecification
}

function circlePolygon(lon: number, lat: number, radiusKm: number): Feature<Polygon> {
  const coordinates: [number, number][] = []
  const latScale = 111.32
  const lonScale = Math.max(25, 111.32 * Math.cos(lat * Math.PI / 180))
  for (let index = 0; index <= 40; index += 1) {
    const angle = (index / 40) * Math.PI * 2
    coordinates.push([
      lon + (radiusKm / lonScale) * Math.cos(angle),
      lat + (radiusKm / latScale) * Math.sin(angle),
    ])
  }
  return { type: 'Feature', properties: { radius_km: radiusKm }, geometry: { type: 'Polygon', coordinates: [coordinates] } }
}

function ringContainsPoint(point: [number, number], ring: number[][]) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index]
    const prior = ring[previous]
    const crossesLatitude = (current[1] > point[1]) !== (prior[1] > point[1])
    if (
      crossesLatitude
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
  geometry: FeatureCollection['features'][number]['geometry'],
) {
  if (geometry.type === 'Polygon') return polygonContainsPoint(point, geometry.coordinates)
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => polygonContainsPoint(point, polygon))
  }
  return false
}

function buildImpactRegions(
  zones: FeatureCollection,
  grid: FeatureCollection,
  metric: ImpactMetric,
): FeatureCollection {
  const definition = IMPACT_METRICS[metric]
  return {
    type: 'FeatureCollection',
    features: zones.features.map((zone): Feature => {
      const properties = zone.properties ?? {}
      const point: [number, number] = [
        Number(properties.centroid_lon),
        Number(properties.centroid_lat),
      ]
      const sample = Number.isFinite(point[0]) && Number.isFinite(point[1])
        ? grid.features.find((cell) => geometryContainsPoint(point, cell.geometry))
        : undefined
      const sampleProperties = sample?.properties ?? {}
      const rawValue = sampleProperties[metric]
      const impactValue = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : null
      return {
        ...zone,
        properties: {
          ...properties,
          impact_value: impactValue,
          impact_metric: metric,
          impact_label: definition.label,
          impact_unit: definition.unit,
          impact_method: '行政区中心点采样',
          sample_cell_id: sampleProperties.cell_id ?? null,
          time_start: sampleProperties.time_start ?? null,
          time_end: sampleProperties.time_end ?? null,
          impact_data_status: sampleProperties.data_status ?? null,
          impact_source_ids: sampleProperties.source_ids ?? null,
        },
      }
    }),
  }
}

const style: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    countries: {
      type: 'geojson',
      // Natural Earth 110m boundaries provide a lightweight continental
      // outline independent of the raster tile labels.
      data: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
    },
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'ocean-base',
      type: 'background',
      paint: { 'background-color': '#0b3443' },
    },
    {
      id: 'countries-fill',
      type: 'fill',
      source: 'countries',
      paint: { 'fill-color': '#173c49', 'fill-opacity': 0.2 },
    },
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-opacity': 0.62,
        'raster-saturation': -0.35,
        'raster-contrast': 0.28,
      },
    },
    {
      id: 'countries-line',
      type: 'line',
      source: 'countries',
      paint: { 'line-color': '#b7e3dc', 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.45, 3, 0.8, 8, 1.2], 'line-opacity': 0.68 },
    },
  ],
  projection: { type: 'globe' },
}

function splitTrack(points: TrackPointWithTime[]): FeatureCollection<LineString> {
  const segments: [number, number][][] = []
  let segment: [number, number][] = []
  for (const point of points) {
    const coordinate: [number, number] = [point.lon, point.lat]
    const previous = segment.at(-1)
    if (previous && Math.abs(previous[0] - coordinate[0]) > 180) {
      if (segment.length > 1) segments.push(segment)
      segment = []
    }
    segment.push(coordinate)
  }
  if (segment.length > 1) segments.push(segment)
  return {
    type: 'FeatureCollection',
    features: segments.map((coordinates, index) => ({
      type: 'Feature',
      properties: { segment: index },
      geometry: { type: 'LineString', coordinates },
    })),
  }
}

function currentPoint(point?: TrackPointWithTime): FeatureCollection<Point> {
  if (!point) return EMPTY as FeatureCollection<Point>
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          time: point.time,
          wind_ms: point.wind_ms,
          pressure_hpa: point.pressure_hpa,
          category: point.category,
        },
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      },
    ],
  }
}

function source(map: MapLibreMap | null, id: string) {
  return map?.getSource(id) as GeoJSONSource | undefined
}

function setSourceData(map: MapLibreMap | null, id: string, data: FeatureCollection) {
  source(map, id)?.setData(data)
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function facilityIcon(type: 'shelter' | 'medical' | 'rescue' | 'warehouse') {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建设施图标')
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.fillStyle = '#f3ead8'
  context.strokeStyle = '#122d36'
  context.lineWidth = 4
  context.beginPath()
  context.arc(32, 32, 27, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.fillStyle = '#122d36'
  context.strokeStyle = '#122d36'

  if (type === 'shelter') {
    context.beginPath()
    context.moveTo(15, 31)
    context.lineTo(32, 17)
    context.lineTo(49, 31)
    context.stroke()
    context.strokeRect(20, 30, 24, 17)
    context.fillRect(29, 37, 7, 10)
  } else if (type === 'medical') {
    context.beginPath()
    context.roundRect(17, 20, 30, 27, 6)
    context.stroke()
    context.fillRect(28, 25, 8, 18)
    context.fillRect(23, 30, 18, 8)
    context.beginPath()
    context.moveTo(25, 20)
    context.lineTo(25, 16)
    context.lineTo(39, 16)
    context.lineTo(39, 20)
    context.stroke()
  } else if (type === 'rescue') {
    context.beginPath()
    context.arc(32, 32, 14, 0, Math.PI * 2)
    context.stroke()
    context.beginPath()
    context.arc(32, 32, 6, 0, Math.PI * 2)
    context.stroke()
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      context.beginPath()
      context.moveTo(32 + Math.cos(angle) * 8, 32 + Math.sin(angle) * 8)
      context.lineTo(32 + Math.cos(angle) * 18, 32 + Math.sin(angle) * 18)
      context.stroke()
    }
  } else {
    context.strokeRect(17, 23, 30, 24)
    context.beginPath()
    context.moveTo(17, 30)
    context.lineTo(32, 20)
    context.lineTo(47, 30)
    context.moveTo(32, 21)
    context.lineTo(32, 47)
    context.stroke()
  }
  return context.getImageData(0, 0, 64, 64)
}

function addFacilityIcons(map: MapLibreMap) {
  for (const type of ['shelter', 'medical', 'rescue', 'warehouse'] as const) {
    map.addImage(`facility-${type}`, facilityIcon(type), { pixelRatio: 2 })
  }
}

function addDataLayers(map: MapLibreMap) {
  addFacilityIcons(map)
  map.addSource('taiwan-zones', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'taiwan-zones-fill',
    type: 'fill',
    source: 'taiwan-zones',
    paint: {
      'fill-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'population'], 0],
        0, '#102c38', 500000, '#1b5964', 2000000, '#4f9a8d', 4000000, '#e6b85c',
      ],
      'fill-opacity': 0.48,
    },
  })
  map.addLayer({
    id: 'taiwan-zones-line',
    type: 'line',
    source: 'taiwan-zones',
    paint: { 'line-color': '#b7e3dc', 'line-width': 1.1, 'line-opacity': 0.72 },
  })

  map.addSource('impact-regions', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'impact-regions-fill',
    type: 'fill',
    source: 'impact-regions',
    paint: {
      'fill-color': [
        'case', ['==', ['get', 'impact_value'], null], 'rgba(0,0,0,0)',
        ['interpolate', ['linear'], ['to-number', ['get', 'impact_value']], 0, '#17324d', 0.25, '#287c88', 0.5, '#e1bd55', 0.75, '#ed7446', 1, '#bd2947'],
      ] as maplibregl.ExpressionSpecification,
      'fill-opacity': 0.68,
    },
  })
  map.addLayer({
    id: 'impact-regions-line',
    type: 'line',
    source: 'impact-regions',
    paint: { 'line-color': '#d9e5df', 'line-width': 0.75, 'line-opacity': 0.42 },
  })
  map.addSource('global-impact', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'global-impact-fill',
    type: 'fill',
    source: 'global-impact',
    paint: {
      'fill-color': impactColor('hazard_index'),
      'fill-opacity': 0.2,
    },
  })

  map.addSource('track-context', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'track-context',
    type: 'line',
    source: 'track-context',
    paint: { 'line-color': '#7c9197', 'line-width': 1.5, 'line-opacity': 0.38 },
  })
  map.addSource('storm-track', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'storm-track',
    type: 'line',
    source: 'storm-track',
    paint: { 'line-color': '#71ded2', 'line-width': 3, 'line-opacity': 0.92 },
  })
  map.addSource('drawn-trajectory', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'drawn-trajectory-line',
    type: 'line',
    source: 'drawn-trajectory',
    paint: { 'line-color': '#ffcf70', 'line-width': 4, 'line-opacity': 0.95 },
  })
  map.addLayer({
    id: 'drawn-trajectory-points',
    type: 'circle',
    source: 'drawn-trajectory',
    paint: { 'circle-radius': 3.5, 'circle-color': '#fff0c4', 'circle-stroke-color': '#5c3b19', 'circle-stroke-width': 1 },
  })
  map.addSource('current-point', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'current-point-halo',
    type: 'circle',
    source: 'current-point',
    paint: { 'circle-radius': 10, 'circle-color': '#71ded2', 'circle-opacity': 0.2 },
  })
  map.addLayer({
    id: 'current-point',
    type: 'circle',
    source: 'current-point',
    paint: {
      'circle-radius': 5,
      'circle-color': '#fff0c4',
      'circle-stroke-color': '#0b2028',
      'circle-stroke-width': 2,
    },
  })

  map.addSource('taiwan-facilities', {
    type: 'geojson',
    data: EMPTY,
    cluster: true,
    // Taiwan is dense at the fit-to-bounds zoom. Keep clusters visible until
    // the user deliberately zooms in, instead of painting thousands of icons
    // across the whole island at once.
    clusterMaxZoom: 11,
    clusterRadius: 52,
  })
  map.addLayer({
    id: 'facility-clusters',
    type: 'circle',
    source: 'taiwan-facilities',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#173f4b',
      'circle-radius': ['step', ['get', 'point_count'], 15, 100, 20, 1000, 26],
      'circle-stroke-color': '#8fe6d4',
      'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'facility-cluster-count',
    type: 'symbol',
    source: 'taiwan-facilities',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 },
    paint: { 'text-color': '#f5f0df' },
  })
  map.addLayer({
    id: 'taiwan-facilities',
    type: 'symbol',
    source: 'taiwan-facilities',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': [
        'match', ['get', 'type'],
        'medical', 'facility-medical',
        'rescue', 'facility-rescue',
        'warehouse', 'facility-warehouse',
        'facility-shelter',
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.62, 10, 0.88],
      'icon-padding': 2,
      'icon-allow-overlap': false,
    },
    paint: {
      'icon-opacity': 0.9,
    },
  })
  map.addSource('scenario-facilities', { type: 'geojson', data: EMPTY })
  map.addSource('scenario-facility-areas', { type: 'geojson', data: EMPTY })
  map.addLayer({
    id: 'scenario-facility-areas-fill',
    type: 'fill',
    source: 'scenario-facility-areas',
    paint: { 'fill-color': '#f6c85f', 'fill-opacity': 0.13 },
  })
  map.addLayer({
    id: 'scenario-facility-areas-line',
    type: 'line',
    source: 'scenario-facility-areas',
    paint: { 'line-color': '#ffc857', 'line-width': 2, 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'scenario-facility-halo',
    type: 'circle',
    source: 'scenario-facilities',
    paint: {
      'circle-radius': 13,
      'circle-color': '#ffc857',
      'circle-opacity': 0.24,
      'circle-stroke-color': '#fff0c4',
      'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'scenario-facilities',
    type: 'symbol',
    source: 'scenario-facilities',
    layout: {
      'icon-image': [
        'match', ['get', 'type'],
        'medical', 'facility-medical',
        'rescue', 'facility-rescue',
        'warehouse', 'facility-warehouse',
        'facility-shelter',
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.76, 10, 1.08],
      'icon-allow-overlap': true,
    },
    paint: { 'icon-opacity': 1 },
  })
}

export default function MapView({ storms, windMode = false, drawMode = false, scenarioVersion = 0 }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const scenarioIdRef = useRef<string | null>(null)
  const scenarioFeaturesRef = useRef<Feature<Point>[]>([])
  const trackRef = useRef<TrackPointWithTime[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [status, setStatus] = useState('全球概览准备就绪')
  const [error, setError] = useState('')
  const [facilityCount, setFacilityCount] = useState(0)
  const [windManifest, setWindManifest] = useState<WindManifest | null>(null)
  const [windStatus, setWindStatus] = useState('风场未加载')
  const [impactStatus, setImpactStatus] = useState('')
  const [globalImpactStatus, setGlobalImpactStatus] = useState('')
  const [reportedDamageAvailable, setReportedDamageAvailable] = useState(false)
  const [drawMatchMode, setDrawMatchMode] = useState<TrajectoryMatchRequest['mode']>('geographic')
  const [drawPoints, setDrawPoints] = useState<{ lon: number; lat: number }[]>([])
<<<<<<< HEAD
  const [drawResult, setDrawResult] = useState<TrajectoryMatchResponse | null>(null)
=======
>>>>>>> origin/main
  const [drawMatching, setDrawMatching] = useState(false)
  const drawingRef = useRef(false)
  const drawnPointsRef = useRef<{ lon: number; lat: number }[]>([])
  const selected = useMemo(
    () => storms.find((storm) => storm.id === state.selectedStormId) ?? null,
    [storms, state.selectedStormId],
  )
  scenarioIdRef.current = state.selectedScenarioId

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: [120, 18],
      zoom: 1.2,
      minZoom: 0.8,
      maxZoom: 12,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new maplibregl.AttributionControl(), 'bottom-right')
    map.on('load', () => {
      addDataLayers(map)
      setMapReady(true)
    })
    const popup = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature) return
      const properties = feature.properties ?? {}
      const title = properties.name_zh ?? properties.name ?? properties.cell_id ?? '图层详情'
      const isSchoolShelter = properties.type === 'shelter' && /國小|小学|小學|國中|中學|高中|學校/.test(String(title))
      const lines = [
        properties.type ? `类型：${properties.type}` : '',
        properties.impact_value != null
          ? `${properties.impact_label ?? '区域影响'}：${Number(properties.impact_value).toFixed(properties.impact_metric === 'hazard_index' ? 2 : 1)} ${properties.impact_unit ?? ''}`
          : properties.impact_metric ? `${properties.impact_label ?? '区域影响'}：未覆盖` : '',
        properties.impact_method ? `空间口径：${properties.impact_method}` : '',
        properties.sample_cell_id ? `采样格网：${properties.sample_cell_id}` : '',
        properties.population != null ? `人口：${Number(properties.population).toLocaleString()}` : '',
        properties.hazard_index != null ? `危险度：${Number(properties.hazard_index).toFixed(2)}` : '',
        properties.max_wind_ms != null ? `最大风速：${Number(properties.max_wind_ms).toFixed(1)} m/s` : '',
        properties.exposed_population != null ? `暴露人口：${Number(properties.exposed_population).toLocaleString()}` : '',
        properties.capacity_value != null
          ? `容量：${properties.capacity_value} ${properties.capacity_unit ?? ''}`
          : properties.type ? '容量：未知' : '',
        properties.impact_data_status ? `影响数据状态：${properties.impact_data_status}` : '',
        properties.data_status ? `区划数据状态：${properties.data_status}` : '',
        properties.time_start ? `时间窗：${properties.time_start} – ${properties.time_end ?? '未知'}` : '',
        properties.impact_source_ids ? `影响来源：${properties.impact_source_ids}` : '',
        properties.source_ids ? `区划来源：${properties.source_ids}` : '',
        isSchoolShelter ? '说明：学校礼堂、教室或操场被官方指定为避难收容地点。' : '',
      ].filter(Boolean)
      new maplibregl.Popup({ closeButton: true })
        .setLngLat(event.lngLat)
        .setHTML(
          `<strong>${escapeHtml(title)}</strong><br>${lines.map(escapeHtml).join('<br>') || '暂无更多属性'}`,
        )
        .addTo(map)
    }
    for (const layer of ['taiwan-zones-fill', 'impact-regions-fill', 'global-impact-fill', 'taiwan-facilities']) {
      map.on('click', layer, popup)
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    }
    map.on('click', 'scenario-facilities', (event) => {
      const feature = event.features?.[0]
      const properties = feature?.properties ?? {}
      const facilityId = String(properties.facility_id ?? '')
      if (!facilityId) return
      const title = `新增${properties.type ?? '设施'}`
      const base = [
        `位置：${Number(properties.lon).toFixed(4)}°E, ${Number(properties.lat).toFixed(4)}°N`,
        properties.capacity_value != null ? `容量：${properties.capacity_value} ${properties.capacity_unit ?? ''}` : '容量：未设置',
        properties.service_radius_km != null ? `服务半径：${properties.service_radius_km} km` : '服务半径：未设置',
        '状态：模拟设施',
      ]
      const popupRef = new maplibregl.Popup({ closeButton: true })
        .setLngLat(event.lngLat)
        .setHTML(`<strong>${escapeHtml(title)}</strong><br>${base.map(escapeHtml).join('<br>')}`)
        .addTo(map)
      void dataApi.facilityServiceArea(facilityId)
        .then((response) => {
          const reachable = response.items.reduce((sum, item) => sum + item.reachable_population, 0)
          const zones = response.items.length
          popupRef.setHTML(
            `<strong>${escapeHtml(title)}</strong><br>${[...base, `可达区域：${zones} 个`, `可达人口：${reachable.toLocaleString()} 人`, `评估口径：${response.data_status}`].map(escapeHtml).join('<br>')}`,
          )
        })
        .catch(() => undefined)
    })
    map.on('click', 'facility-clusters', (event) => {
      const feature = event.features?.[0]
      const clusterId = Number(feature?.properties?.cluster_id)
      const facilities = map.getSource('taiwan-facilities') as GeoJSONSource | undefined
      if (!facilities || !Number.isFinite(clusterId)) return
      void facilities.getClusterExpansionZoom(clusterId).then((zoom) => {
        if (!feature || feature.geometry.type !== 'Point') return
        map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom })
      })
    })
    map.on('mouseenter', 'facility-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'facility-clusters', () => { map.getCanvas().style.cursor = '' })
    let draggingFacility: { id: string; radiusKm: number } | null = null
    const onFacilityDown = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0]
      if (!feature || feature.geometry.type !== 'Point') return
      const id = String(feature.properties?.facility_id ?? '')
      if (!id || !scenarioIdRef.current) return
      draggingFacility = {
        id,
        radiusKm: Number(feature.properties?.service_radius_km ?? 0),
      }
      map.getCanvas().style.cursor = 'grabbing'
      map.dragPan.disable()
      event.preventDefault()
    }
    const onFacilityMove = (event: maplibregl.MapMouseEvent) => {
      if (!draggingFacility) return
      const { id, radiusKm } = draggingFacility
      const source = map.getSource('scenario-facilities') as GeoJSONSource | undefined
      if (!source) return
      const features = scenarioFeaturesRef.current.map((item) => ({
        ...item,
        properties: { ...(item.properties ?? {}) },
        geometry: { type: 'Point' as const, coordinates: [...item.geometry.coordinates] as [number, number] },
      }))
      const moved = features.find((item) => String(item.properties?.facility_id ?? '') === id)
      if (!moved) return
      moved.geometry.coordinates = [event.lngLat.lng, event.lngLat.lat]
      scenarioFeaturesRef.current = features
      source.setData({ type: 'FeatureCollection', features })
      setSourceData(map, 'scenario-facility-areas', {
        type: 'FeatureCollection',
        features: radiusKm > 0 ? [{
          ...circlePolygon(event.lngLat.lng, event.lngLat.lat, radiusKm),
          properties: { facility_id: id, radius_km: radiusKm, is_preview: true },
        }] : [],
      })
      window.dispatchEvent(new CustomEvent('scenario-facility-preview', {
        detail: { facilityId: id, lon: event.lngLat.lng, lat: event.lngLat.lat, radiusKm },
      }))
    }
    const onFacilityUp = () => {
      if (!draggingFacility) return
      const feature = scenarioFeaturesRef.current.find((item) => String(item.properties?.facility_id ?? '') === draggingFacility?.id)
      const coordinates = feature?.geometry.coordinates ?? null
      const id = draggingFacility.id
      draggingFacility = null
      map.getCanvas().style.cursor = ''
      map.dragPan.enable()
      if (!coordinates || !scenarioIdRef.current) return
      void scenarioApi.updateFacility(scenarioIdRef.current, id, {
        lon: coordinates[0],
        lat: coordinates[1],
      }).then(() => {
        window.dispatchEvent(new CustomEvent('scenario-facility-committed', {
          detail: { facilityId: id, lon: coordinates[0], lat: coordinates[1], scenarioId: scenarioIdRef.current },
        }))
      }).catch(() => undefined)
    }
<<<<<<< HEAD
    // Both the icon and its halo are draggable, including medical and rescue facilities.
    map.on('mousedown', 'scenario-facilities', onFacilityDown)
    map.on('mousedown', 'scenario-facility-halo', onFacilityDown)
=======
    map.on('mousedown', 'scenario-facilities', onFacilityDown)
>>>>>>> origin/main
    map.on('mousemove', onFacilityMove)
    map.on('mouseup', onFacilityUp)
    mapRef.current = map
    return () => {
      map.off('mousedown', 'scenario-facilities', onFacilityDown)
<<<<<<< HEAD
      map.off('mousedown', 'scenario-facility-halo', onFacilityDown)
=======
>>>>>>> origin/main
      map.off('mousemove', onFacilityMove)
      map.off('mouseup', onFacilityUp)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    setSourceData(map, 'drawn-trajectory', EMPTY)
    drawnPointsRef.current = []
    setDrawPoints([])
<<<<<<< HEAD
    setDrawResult(null)
=======
    dispatch({ type: 'set-trajectory-match', value: null })
>>>>>>> origin/main
    if (!drawMode) return

    map.easeTo({ center: [120, 18], zoom: 1.2, duration: 500 })
    let lastPoint: { lon: number; lat: number } | null = null
    const onDown = (event: maplibregl.MapMouseEvent) => {
      if (event.originalEvent.button !== 0) return
      drawingRef.current = true
      map.dragPan.disable()
      map.getCanvas().style.cursor = 'crosshair'
      lastPoint = null
      drawnPointsRef.current = []
      setDrawPoints([])
<<<<<<< HEAD
      setDrawResult(null)
=======
      dispatch({ type: 'set-trajectory-match-status', status: 'loading' })
>>>>>>> origin/main
      event.preventDefault()
    }
    const onMove = (event: maplibregl.MapMouseEvent) => {
      if (!drawingRef.current) return
      const next = { lon: event.lngLat.lng, lat: event.lngLat.lat }
      if (lastPoint && Math.hypot(next.lon - lastPoint.lon, next.lat - lastPoint.lat) < 0.08) return
      lastPoint = next
      drawnPointsRef.current = [...drawnPointsRef.current, next]
      setDrawPoints(drawnPointsRef.current)
      setSourceData(map, 'drawn-trajectory', {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: drawnPointsRef.current.map((point) => [point.lon, point.lat]) },
        }],
      })
    }
    const onUp = () => {
      if (!drawingRef.current) return
      drawingRef.current = false
      map.dragPan.enable()
      map.getCanvas().style.cursor = 'crosshair'
      if (drawnPointsRef.current.length < 2) return
      setDrawMatching(true)
      dataApi.trajectory({
        mode: drawMatchMode,
        points: drawnPointsRef.current,
        top_k: 5,
        filters: {
<<<<<<< HEAD
          basins: state.filters.basins as NonNullable<TrajectoryMatchRequest['filters']>['basins'],
          season_from: state.filters.seasonRange[0],
          season_to: state.filters.seasonRange[1],
        },
      }, undefined)
        .then((response) => setDrawResult(response))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
=======
          basins: (state.selectedBasin ? [state.selectedBasin] : []) as NonNullable<TrajectoryMatchRequest['filters']>['basins'],
          season_from: state.selectedYearRange[0],
          season_to: state.selectedYearRange[1],
        },
      }, undefined)
        .then((response) => {
          dispatch({ type: 'set-trajectory-match', value: response, status: 'ready' })
        })
        .catch((cause: unknown) => {
          const message = cause instanceof Error ? cause.message : String(cause)
          setError(message)
          dispatch({ type: 'set-trajectory-match-status', status: 'error', error: message })
        })
>>>>>>> origin/main
        .finally(() => setDrawMatching(false))
    }
    map.on('mousedown', onDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onUp)
    return () => {
      drawingRef.current = false
      map.dragPan.enable()
      map.getCanvas().style.cursor = ''
      map.off('mousedown', onDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onUp)
    }
<<<<<<< HEAD
  }, [drawMatchMode, drawMode, mapReady])
=======
  }, [dispatch, drawMatchMode, drawMode, mapReady, state.selectedBasin, state.selectedYearRange])
>>>>>>> origin/main

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    if (state.mode === 'taiwan-scenario') {
      map.fitBounds(TAIWAN_BOUNDS, { padding: 44, duration: 900, maxZoom: 10 })
    } else if (state.mode === 'overview') {
      map.easeTo({ center: [120, 18], zoom: 1.2, duration: 900 })
    }
  }, [mapReady, state.mode])

  useEffect(() => {
    if (!mapReady) return
    if (state.mode !== 'taiwan-scenario') {
      scenarioFeaturesRef.current = []
      setSourceData(mapRef.current, 'taiwan-zones', EMPTY)
      setSourceData(mapRef.current, 'taiwan-facilities', EMPTY)
      setSourceData(mapRef.current, 'scenario-facilities', EMPTY)
      setSourceData(mapRef.current, 'scenario-facility-areas', EMPTY)
      setFacilityCount(0)
      return
    }
    const controller = new AbortController()
    setStatus('加载台湾区划与设施')
    setError('')
    Promise.all([
      dataApi.taiwanZones({}, controller.signal),
      dataApi.taiwanFacilities({}, controller.signal),
      state.selectedScenarioId ? scenarioApi.get(state.selectedScenarioId, controller.signal) : Promise.resolve(null),
    ])
      .then(([zones, facilities, scenario]) => {
        setSourceData(mapRef.current, 'taiwan-zones', zones as unknown as FeatureCollection)
        setSourceData(mapRef.current, 'taiwan-facilities', facilities as unknown as FeatureCollection)
<<<<<<< HEAD
        const simulated = state.scenarioView === 'current'
          ? (scenario?.facilities ?? []).map((facility) => ({
            type: 'Feature' as const,
            id: facility.id,
            properties: {
              facility_id: facility.id,
              type: facility.type,
              lon: facility.lon,
              lat: facility.lat,
              capacity_value: facility.capacity_value,
              capacity_unit: facility.capacity_unit,
              service_radius_km: facility.service_radius_km,
              is_simulated: true,
            },
            geometry: { type: 'Point' as const, coordinates: [facility.lon, facility.lat] as [number, number] },
          }))
          : []
=======
        const simulated = (scenario?.facilities ?? []).map((facility) => ({
          type: 'Feature' as const,
          id: facility.id,
          properties: {
            facility_id: facility.id,
            type: facility.type,
            lon: facility.lon,
            lat: facility.lat,
            capacity_value: facility.capacity_value,
            capacity_unit: facility.capacity_unit,
            service_radius_km: facility.service_radius_km,
            is_simulated: true,
          },
          geometry: { type: 'Point' as const, coordinates: [facility.lon, facility.lat] as [number, number] },
        }))
>>>>>>> origin/main
        scenarioFeaturesRef.current = simulated
        setSourceData(mapRef.current, 'scenario-facilities', { type: 'FeatureCollection', features: simulated })
        setSourceData(mapRef.current, 'scenario-facility-areas', {
          type: 'FeatureCollection',
<<<<<<< HEAD
          features: state.scenarioView === 'current'
            ? (scenario?.facilities ?? [])
              .filter((facility) => facility.service_radius_km != null && facility.service_radius_km > 0)
              .map((facility) => ({
                ...circlePolygon(facility.lon, facility.lat, facility.service_radius_km ?? 0),
                properties: { facility_id: facility.id, type: facility.type, radius_km: facility.service_radius_km },
              }))
            : [],
        })
        setFacilityCount(facilities.features.length + simulated.length)
        setStatus(`台湾 22 区 · ${state.scenarioView === 'baseline' ? '历史基线' : '当前方案'} · ${(facilities.features.length + simulated.length).toLocaleString()} 设施${simulated.length ? ` · 新增 ${simulated.length}` : ''}`)
=======
          features: (scenario?.facilities ?? [])
            .filter((facility) => facility.service_radius_km != null && facility.service_radius_km > 0)
            .map((facility) => ({
              ...circlePolygon(facility.lon, facility.lat, facility.service_radius_km ?? 0),
              properties: { facility_id: facility.id, type: facility.type, radius_km: facility.service_radius_km },
            })),
        })
        setFacilityCount(facilities.features.length + simulated.length)
        setStatus(`台湾 22 区 · ${(facilities.features.length + simulated.length).toLocaleString()} 设施${simulated.length ? ` · 新增 ${simulated.length}` : ''}`)
>>>>>>> origin/main
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : String(cause))
        setStatus('台湾图层不可用')
      })
    return () => controller.abort()
<<<<<<< HEAD
  }, [mapReady, scenarioVersion, state.mode, state.selectedScenarioId, state.scenarioView])
=======
  }, [mapReady, scenarioVersion, state.mode, state.selectedScenarioId])
>>>>>>> origin/main

  useEffect(() => {
    if (!mapReady || !selected?.id || state.mode === 'overview') {
      trackRef.current = []
      setSourceData(mapRef.current, 'track-context', EMPTY)
      setSourceData(mapRef.current, 'storm-track', EMPTY)
      setSourceData(mapRef.current, 'current-point', EMPTY)
      return
    }
    const controller = new AbortController()
    setError('')
    setStatus(`加载 ${selected.name} 真实轨迹`)
    dataApi.track(selected.id, {}, controller.signal)
      .then((track) => {
        const points = track.points as TrackPointWithTime[]
        trackRef.current = points
        if (!points.length) {
          dispatch({ type: 'set-time-window', value: null })
          dispatch({ type: 'set-time', value: null })
          dispatch({ type: 'set-current-observation', value: null })
          setStatus(`${selected.name} · 暂无真实观测点`)
          return
        }
        dispatch({ type: 'set-time-window', value: { start: points[0].time, end: points.at(-1)!.time } })
        dispatch({ type: 'set-time', value: points[0].time })
        dispatch({ type: 'set-current-observation', value: points[0] })
        setSourceData(mapRef.current, 'track-context', splitTrack(points))
        setSourceData(mapRef.current, 'storm-track', splitTrack(points.slice(0, 1)))
        setSourceData(mapRef.current, 'current-point', currentPoint(points[0]))
        if (state.mode !== 'taiwan-scenario' && points.length) {
          const bounds = points.reduce(
            (value, point) => value.extend([point.lon, point.lat]),
            new maplibregl.LngLatBounds([points[0].lon, points[0].lat], [points[0].lon, points[0].lat]),
          )
          mapRef.current?.fitBounds(bounds, { padding: 74, maxZoom: 4.5, duration: 800 })
        }
        setStatus(`${selected.name} · ${points.length} 个真实观测点`)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : String(cause))
        setStatus('真实轨迹不可用')
      })
    return () => controller.abort()
  }, [dispatch, mapReady, selected?.id, selected?.name, state.mode])

  useEffect(() => {
    if (!mapReady || !trackRef.current.length) return
    const cutoff = state.currentTime ? Date.parse(state.currentTime) : Date.parse(trackRef.current[0].time)
    const visible = trackRef.current.filter((point) => Date.parse(point.time) <= cutoff)
    const current = visible.at(-1) ?? trackRef.current[0]
    setSourceData(mapRef.current, 'storm-track', splitTrack(visible))
    setSourceData(mapRef.current, 'current-point', currentPoint(current))
    dispatch({ type: 'set-current-observation', value: current })
  }, [dispatch, mapReady, state.currentTime])

  useEffect(() => {
    if (!mapReady || !selected?.impact_available || !state.layers.impact.visible) {
      setSourceData(mapRef.current, 'impact-regions', EMPTY)
      setImpactStatus('')
      return
    }
    const controller = new AbortController()
    Promise.all([
<<<<<<< HEAD
      dataApi.impact({ storm_id: selected.id, metric: state.impactMetric }, controller.signal),
=======
      dataApi.impact({ storm_id: selected.id, metric: state.selectedImpactMetric }, controller.signal),
>>>>>>> origin/main
      dataApi.taiwanZones({}, controller.signal),
    ])
      .then(([gridResponse, zonesResponse]) => {
        const grid = gridResponse as unknown as FeatureCollection
        const zones = zonesResponse as unknown as FeatureCollection
<<<<<<< HEAD
        const regions = buildImpactRegions(zones, grid, state.impactMetric)
        setSourceData(mapRef.current, 'impact-regions', regions)
        const hasMetric = grid.features.some((feature) => feature.properties?.[state.impactMetric] != null)
=======
        const regions = buildImpactRegions(zones, grid, state.selectedImpactMetric)
        setSourceData(mapRef.current, 'impact-regions', regions)
        const hasMetric = grid.features.some((feature) => feature.properties?.[state.selectedImpactMetric] != null)
>>>>>>> origin/main
        const hasReportedDamage = grid.features.some((feature) => feature.properties?.reported_damage_usd != null)
        const coloredRegions = regions.features.filter((feature) => feature.properties?.impact_value != null).length
        setReportedDamageAvailable(hasReportedDamage)
        setImpactStatus(
          hasMetric
            ? `${coloredRegions}/${regions.features.length} 行政区 · 中心点采样`
<<<<<<< HEAD
            : `${IMPACT_METRICS[state.impactMetric].label}：未提供`,
        )
        if (state.impactMetric === 'reported_damage_usd' && !hasReportedDamage) {
=======
            : `${IMPACT_METRICS[state.selectedImpactMetric].label}：未提供`,
        )
        if (state.selectedImpactMetric === 'reported_damage_usd' && !hasReportedDamage) {
>>>>>>> origin/main
          dispatch({ type: 'set-impact-metric', value: 'hazard_index' })
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        if (!(cause instanceof ApiError && cause.status === 404)) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
        setSourceData(mapRef.current, 'impact-regions', EMPTY)
        setImpactStatus('区域影响图层不可用')
      })
    return () => controller.abort()
<<<<<<< HEAD
  }, [dispatch, mapReady, selected?.id, selected?.impact_available, state.impactMetric, state.layers.impact.visible])
=======
  }, [dispatch, mapReady, selected?.id, selected?.impact_available, state.selectedImpactMetric, state.layers.impact.visible])
>>>>>>> origin/main

  useEffect(() => {
    if (!windMode) {
      setWindManifest(null)
      setWindStatus('风场不可用')
      return
    }
    const controller = new AbortController()
    const request = state.mode === 'overview'
      ? dataApi.periodWind('global-demo', controller.signal)
      : selected?.wind_available
        ? dataApi.stormWind(selected.id, controller.signal)
        : null
    if (!request) {
      setWindManifest(null)
      setWindStatus('风场不可用')
      return () => controller.abort()
    }
    request
      .then((manifest) => {
        setWindManifest(manifest)
        if (state.mode === 'overview') {
          setStatus(`全球 ERA5 10m 风场 · ${manifest.width}×${manifest.height} 网格`)
        }
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setWindManifest(null)
        setWindStatus('风场不可用')
      })
    return () => controller.abort()
  }, [selected?.id, selected?.wind_available, state.mode, windMode])

  useEffect(() => {
    // Do not paint the raw ERA5 grid over the whole globe. It is a wind-speed
    // proxy, not a geographic impact layer, and would incorrectly tint ocean
    // and land alike. Boundary-based impact rendering remains available for
    // Taiwan and storm analyses where administrative geometries are present.
    if (!mapReady || state.mode !== 'overview' || !state.layers.impact.visible) {
      setSourceData(mapRef.current, 'global-impact', EMPTY)
      setGlobalImpactStatus('')
      return
    }
    setSourceData(mapRef.current, 'global-impact', EMPTY)
    setGlobalImpactStatus('全球行政区影响层待接入（当前不显示规则网格）')
  }, [mapReady, state.layers.impact.visible, state.mode])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    map.setPaintProperty('track-context', 'line-opacity', state.layers.tracks.visible ? state.layers.tracks.opacity * 0.42 : 0)
    map.setPaintProperty('storm-track', 'line-opacity', state.layers.tracks.visible ? state.layers.tracks.opacity : 0)
<<<<<<< HEAD
    map.setPaintProperty('impact-regions-fill', 'fill-color', impactColor(state.impactMetric))
=======
    map.setPaintProperty('impact-regions-fill', 'fill-color', impactColor(state.selectedImpactMetric))
>>>>>>> origin/main
    map.setPaintProperty('impact-regions-fill', 'fill-opacity', state.layers.impact.visible ? state.layers.impact.opacity : 0)
    map.setPaintProperty('impact-regions-line', 'line-opacity', state.layers.impact.visible ? 0.42 : 0)
    map.setPaintProperty('global-impact-fill', 'fill-color', impactColor('hazard_index'))
    // Global boundaries are not bundled yet; keep the placeholder source
    // invisible rather than suggesting that a regular ERA5 cell is a region.
    map.setPaintProperty('global-impact-fill', 'fill-opacity', 0)
    map.setPaintProperty('taiwan-facilities', 'icon-opacity', state.layers.facilities.visible ? state.layers.facilities.opacity : 0)
    map.setPaintProperty('scenario-facilities', 'icon-opacity', state.layers.facilities.visible ? state.layers.facilities.opacity : 0)
    map.setPaintProperty('scenario-facility-halo', 'circle-opacity', state.layers.facilities.visible ? 0.24 * state.layers.facilities.opacity : 0)
    map.setPaintProperty('scenario-facility-areas-fill', 'fill-opacity', state.layers.facilities.visible ? 0.2 : 0)
    map.setPaintProperty('scenario-facility-areas-line', 'line-opacity', state.layers.facilities.visible ? 0.9 : 0)
    map.setPaintProperty('facility-clusters', 'circle-opacity', state.layers.facilities.opacity)
    map.setPaintProperty('facility-cluster-count', 'text-opacity', state.layers.facilities.opacity)
    map.setLayoutProperty('facility-clusters', 'visibility', state.layers.facilities.visible ? 'visible' : 'none')
    map.setLayoutProperty('facility-cluster-count', 'visibility', state.layers.facilities.visible ? 'visible' : 'none')
<<<<<<< HEAD
  }, [mapReady, state.impactMetric, state.layers, state.mode])
=======
  }, [mapReady, state.selectedImpactMetric, state.layers, state.mode])
>>>>>>> origin/main

  const capability = state.mode === 'overview'
    ? windManifest?.capability ?? '未加载'
    : !selected?.wind_available
      ? 'none'
      : windManifest?.capability ?? '未加载'
<<<<<<< HEAD
  const impactDefinition = IMPACT_METRICS[state.impactMetric]
=======
  const impactDefinition = IMPACT_METRICS[state.selectedImpactMetric]
>>>>>>> origin/main
  const impactLayerActive = state.layers.impact.visible && (state.mode !== 'overview' && Boolean(selected?.impact_available))

  return (
    <div className="map-view">
      <div ref={containerRef} className="maplibre-container" />
      {windMode && (
        <WindOverlay
          map={mapReady ? mapRef.current : null}
          manifest={windManifest}
          currentTime={state.currentTime}
          visible={state.layers.wind.visible && capability !== 'none'}
          opacity={state.layers.wind.opacity}
          onStatus={setWindStatus}
        />
      )}
      <div className="map-layer-badge">
        <span className="eyebrow">
          {state.mode === 'taiwan-scenario' ? 'TAIWAN SCENARIO MAP' : 'MAPLIBRE ANALYSIS MAP'}
        </span>
        <strong>
          {state.mode === 'taiwan-scenario'
            ? '台湾区划与防灾设施'
            : state.mode === 'overview'
              ? '全球 ERA5 风场概览'
              : '真实气旋轨迹'}
        </strong>
        <small>{status}</small>
        {windMode && <small>ERA5 能力：{capability} · {windStatus}</small>}
        {state.mode === 'overview' && windMode && windManifest && (
          <small>底色：10m 风速氛围（u/v 合成，非行政区影响）· 粒子：风向与流动</small>
        )}
        {selected && !selected.impact_available && state.layers.impact.visible && (
          <small>该案例暂无区域影响数据</small>
        )}
        {selected?.impact_available && state.layers.impact.visible && impactStatus && <small>{impactStatus}</small>}
        {state.mode === 'overview' && state.layers.impact.visible && globalImpactStatus && <small>{globalImpactStatus}</small>}
        {state.mode === 'taiwan-scenario' && facilityCount > 0 && (
          <small>{facilityCount.toLocaleString()} 设施 · 范围 119–122.5°E / 21.5–25.5°N</small>
        )}
        {error && <small className="map-error">{error}</small>}
      </div>
      {drawMode && (
        <div className="draw-match-panel" aria-label="手绘轨迹匹配">
          <div className="draw-match-heading">
            <div>
              <span className="eyebrow">DRAW MATCH</span>
              <strong>手绘轨迹匹配</strong>
            </div>
            <span>{drawPoints.length} 点</span>
          </div>
          <p>在地图上按住鼠标左键绘制一段轨迹，松开后自动匹配历史气旋。</p>
          <div className="draw-match-actions">
            <button type="button" className={drawMatchMode === 'geographic' ? 'active' : ''} onClick={() => setDrawMatchMode('geographic')}>地理位置</button>
            <button type="button" className={drawMatchMode === 'shape' ? 'active' : ''} onClick={() => setDrawMatchMode('shape')}>形状相似</button>
            <button
              type="button"
              onClick={() => {
                drawnPointsRef.current = []
                setDrawPoints([])
<<<<<<< HEAD
                setDrawResult(null)
=======
                dispatch({ type: 'set-trajectory-match', value: null })
>>>>>>> origin/main
                setSourceData(mapRef.current, 'drawn-trajectory', EMPTY)
              }}
            >清除</button>
          </div>
          {drawMatching && <small className="draw-match-status">正在匹配 A7 轨迹特征…</small>}
<<<<<<< HEAD
          {drawResult && !drawMatching && (
            <div className="draw-match-results">
              <div className="draw-match-result-meta">已匹配 {drawResult.items.length} 个候选 · {drawResult.elapsed_ms.toFixed(1)} ms</div>
              {drawResult.items.map((item) => {
                const storm = storms.find((candidate) => candidate.id === item.storm_id)
                return (
                  <button
                    type="button"
                    className="draw-match-result"
                    key={item.storm_id}
                    onClick={() => storm && dispatch({ type: 'select-storm', stormId: storm.id })}
                  >
                    <span><b>#{item.rank}</b> {storm?.name ?? item.storm_id}</span>
                    <strong>{Math.round(item.similarity * 100)}%</strong>
                    <small>{storm ? `${storm.basin} · ${storm.season} · 形态 ${Math.round(item.frechet_component * 100)} · 方向 ${Math.round(item.direction_component * 100)}` : item.explanation}</small>
                  </button>
                )
              })}
              {drawResult.items[0] && (
                <p className="draw-match-story">
                  叙事线索：这条手绘路径与「{storms.find((storm) => storm.id === drawResult.items[0].storm_id)?.name ?? drawResult.items[0].storm_id}」最接近；
                  形态相似度 {Math.round(drawResult.items[0].frechet_component * 100)}%，移动方向一致性 {Math.round(drawResult.items[0].direction_component * 100)}%。
                  点击候选可在右侧查看该事件的时间、风速、气压和完整轨迹。
                </p>
              )}
            </div>
=======
          {state.trajectoryMatch && !drawMatching && (
            <small className="draw-match-status">
              已匹配 {state.trajectoryMatch.items.length} 个候选，完整结果见右侧“相似轨迹”列表。
            </small>
>>>>>>> origin/main
          )}
        </div>
      )}
      {impactLayerActive && state.mode !== 'overview' && (
        <label className="map-metric-control">
          <span>影响指标</span>
          <select
<<<<<<< HEAD
            value={state.impactMetric}
=======
            value={state.selectedImpactMetric}
>>>>>>> origin/main
            onChange={(event) => dispatch({ type: 'set-impact-metric', value: event.target.value as ImpactMetric })}
          >
            {(Object.entries(IMPACT_METRICS) as [ImpactMetric, (typeof IMPACT_METRICS)[ImpactMetric]][])
              .filter(([value]) => value !== 'reported_damage_usd' || reportedDamageAvailable)
              .map(([value, definition]) => (
              <option key={value} value={value}>{definition.label}</option>
              ))}
          </select>
          <small>{impactDefinition.unit} · 行政区中心采样</small>
        </label>
      )}
      {(state.mode === 'taiwan-scenario' || impactLayerActive) && (
        <div className="map-legend" aria-label="地图图例">
          {impactLayerActive && state.mode !== 'overview' && (
            <span><i className="legend-impact" />{impactDefinition.label}（{impactDefinition.unit}，行政区）</span>
          )}
          {state.mode === 'taiwan-scenario' && <span><i className="legend-zone" />行政区人口</span>}
          {state.mode === 'taiwan-scenario' && <span><i className="legend-shelter">⌂</i>避难所</span>}
          {state.mode === 'taiwan-scenario' && <span><i className="legend-medical">＋</i>医疗</span>}
          {state.mode === 'taiwan-scenario' && <span><i className="legend-rescue">◎</i>救援</span>}
        </div>
      )}
    </div>
  )
}
<<<<<<< HEAD



=======
>>>>>>> origin/main

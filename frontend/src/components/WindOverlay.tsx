import { useEffect, useRef } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { dataApi } from '../api'
import type { WindFrame, WindManifest } from '../types/contracts'

interface Props {
  map: MapLibreMap | null
  manifest: WindManifest | null
  currentTime: string | null
  visible: boolean
  opacity: number
  onStatus: (status: string) => void
}

interface Particle {
  lon: number
  lat: number
  age: number
  maxAge: number
}

function nearestFrame(manifest: WindManifest, currentTime: string | null) {
  if (!manifest.frames.length) return null
  const target = currentTime ? Date.parse(currentTime) : Date.parse(manifest.frames[0].time)
  return manifest.frames.reduce((best, candidate) => (
    Math.abs(Date.parse(candidate.time) - target) < Math.abs(Date.parse(best.time) - target)
      ? candidate
      : best
  ))
}

function wrapLongitude(value: number) {
  let result = value
  while (result > 180) result -= 360
  while (result < -180) result += 360
  return result
}

function longitudeDistance(a: number, b: number) {
  return Math.abs(wrapLongitude(a - b))
}

function isVisibleGlobePoint(
  map: MapLibreMap,
  lon: number,
  lat: number,
  projected: { x: number; y: number },
) {
  // In globe projection MapLibre can project a location on the far side onto
  // the canvas. Projecting it back exposes that mismatch and gives us the
  // same flat visible-surface mask that Earth uses for its canvases.
  const inverse = map.unproject([projected.x, projected.y])
  return longitudeDistance(inverse.lng, lon) < 2.5 && Math.abs(inverse.lat - lat) < 2.5
}

function isWithinGlobeDisk(
  map: MapLibreMap,
  projected: { x: number; y: number },
  width: number,
  height: number,
) {
  const center = map.getCenter()
  const centerPoint = map.project([center.lng, center.lat])
  // In MapLibre's globe projection, a point 90° away from the camera center
  // lies on the horizon. Use that projected distance as the exact screen-space
  // mask so the raster never paints outside the sphere.
  const horizon = map.project([wrapLongitude(center.lng + 90), center.lat])
  const radius = Math.hypot(horizon.x - centerPoint.x, horizon.y - centerPoint.y)
  if (!Number.isFinite(radius) || radius <= 0) return true
  const dx = projected.x - centerPoint.x
  const dy = projected.y - centerPoint.y
  return dx * dx + dy * dy <= radius * radius * 1.015
}

function longitudeSpan(manifest: WindManifest) {
  const { west, east, crosses_antimeridian: crosses } = manifest.bounds
  return crosses ? east + 360 - west : east - west
}

function longitudeOffset(lon: number, manifest: WindManifest) {
  const { west, crosses_antimeridian: crosses } = manifest.bounds
  let adjusted = lon
  if (crosses && adjusted < west) adjusted += 360
  // The global ERA5 frame starts at -180° and ends at 178°. MapLibre may
  // return the same meridian as +180° after a globe wrap; normalize it back
  // into the inclusive source range to avoid a vertical seam.
  if (!crosses && longitudeSpan(manifest) > 100) {
    while (adjusted < west) adjusted += 360
    while (adjusted > manifest.bounds.east) adjusted -= 360
  }
  return adjusted - west
}

function inBounds(lon: number, lat: number, manifest: WindManifest) {
  const { west, east, south, north, crosses_antimeridian: crosses } = manifest.bounds
  const inLongitude = crosses ? lon >= west || lon <= east : lon >= west && lon <= east
  return inLongitude && lat >= south && lat <= north
}

function bilinearVector(
  frame: WindFrame,
  manifest: WindManifest,
  lon: number,
  lat: number,
): [number, number] | null {
  const x = longitudeOffset(lon, manifest) / manifest.resolution_degrees
  const yFromSouth = (lat - manifest.bounds.south) / manifest.resolution_degrees
  if (x < 0 || yFromSouth < 0 || x > frame.width - 1 || yFromSouth > frame.height - 1) return null
  const column = Math.min(Math.floor(x), frame.width - 2)
  const southRow = Math.min(Math.floor(yFromSouth), frame.height - 2)
  const row = frame.height - 1 - southRow
  const fx = x - column
  const fy = yFromSouth - southRow
  const indexes = [
    row * frame.width + column,
    row * frame.width + column + 1,
    (row - 1) * frame.width + column,
    (row - 1) * frame.width + column + 1,
  ]
  const values = indexes.map((index) => [frame.u[index], frame.v[index]] as const)
  if (values.some(([u, v]) => u == null || v == null)) return null
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
  return values.reduce<[number, number]>(
    (sum, [u, v], index) => [sum[0] + (u ?? 0) * weights[index], sum[1] + (v ?? 0) * weights[index]],
    [0, 0],
  )
}

function advectVector(
  vector: [number, number],
  lon: number,
  lat: number,
  seconds: number,
): [number, number] {
  const [u, v] = vector
  const metersPerDegreeLat = 111_320
  const metersPerDegreeLon = Math.max(1, metersPerDegreeLat * Math.cos(lat * Math.PI / 180))
  // MapLibre rejects latitudes outside WGS84. Backward trail samples can
  // cross a pole even when the forward particle remains in bounds, so clamp
  // them before projection instead of letting the RAF loop die on an error.
  return [
    wrapLongitude(lon + u * seconds / metersPerDegreeLon),
    Math.max(-89.8, Math.min(89.8, lat + v * seconds / metersPerDegreeLat)),
  ]
}

function advect(
  frame: WindFrame,
  manifest: WindManifest,
  lon: number,
  lat: number,
  seconds: number,
) {
  const vector = bilinearVector(frame, manifest, lon, lat)
  return vector ? advectVector(vector, lon, lat, seconds) : null
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    return value / 0x1_0000_0000
  }
}

function createParticle(
  map: MapLibreMap,
  manifest: WindManifest,
  random: () => number,
  width: number,
  height: number,
): Particle {
  // Earth seeds particles in the visible screen, not uniformly in longitude
  // and latitude. This keeps the globe visually filled even with a curved
  // projection where much of a geographic rectangle is on the far side.
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const point = map.unproject([random() * width, random() * height])
    const projected = map.project([point.lng, point.lat])
    if (!isWithinGlobeDisk(map, projected, width, height)) continue
    const lon = wrapLongitude(point.lng)
    const lat = Math.max(-89.8, Math.min(89.8, point.lat))
    if (inBounds(lon, lat, manifest)) {
      return { lon, lat, age: Math.floor(random() * 90), maxAge: 90 + Math.floor(random() * 70) }
    }
  }
  const center = map.getCenter()
  const lon = wrapLongitude(center.lng)
  const lat = Math.max(manifest.bounds.south, Math.min(manifest.bounds.north, center.lat))
  return { lon, lat, age: Math.floor(random() * 90), maxAge: 90 + Math.floor(random() * 70) }
}

function sizeCanvas(canvas: HTMLCanvasElement, map: MapLibreMap) {
  const width = map.getCanvas().clientWidth
  const height = map.getCanvas().clientHeight
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.max(1, Math.round(width * ratio))
  const pixelHeight = Math.max(1, Math.round(height * ratio))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const context = canvas.getContext('2d')
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
  return { context, width, height }
}

function windColor(speed: number, alpha: number, minimum: number, maximum: number) {
  const value = Math.max(0, Math.min(1, (speed - minimum) / Math.max(0.001, maximum - minimum)))
  const stops = [
    [4, 22, 76],
    [8, 74, 174],
    [14, 178, 183],
    [54, 220, 126],
    [255, 216, 72],
  ]
  const scaled = value * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  const mix = scaled - index
  const from = stops[index]
  const to = stops[index + 1]
  const rgb = from.map((channel, position) => Math.round(channel + (to[position] - channel) * mix))
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

function drawArrow(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.moveTo(to.x, to.y)
  context.lineTo(to.x - 4 * Math.cos(angle - Math.PI / 6), to.y - 4 * Math.sin(angle - Math.PI / 6))
  context.moveTo(to.x, to.y)
  context.lineTo(to.x - 4 * Math.cos(angle + Math.PI / 6), to.y - 4 * Math.sin(angle + Math.PI / 6))
}

export default function WindOverlay({ map, manifest, currentTime, visible, opacity, onStatus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null)
  const foregroundCanvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<WindFrame | null>(null)
  const previousFrameRef = useRef<WindFrame | null>(null)
  const blendStartedAtRef = useRef(0)
  const frameCacheRef = useRef(new Map<string, WindFrame>())
  const staticRedrawRef = useRef<(() => void) | null>(null)
  const opacityRef = useRef(opacity)
  const reference = manifest ? nearestFrame(manifest, currentTime) : null

  useEffect(() => {
    opacityRef.current = opacity
  }, [opacity])

  useEffect(() => {
    frameRef.current = null
    previousFrameRef.current = null
    blendStartedAtRef.current = 0
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }, [manifest?.dataset_id])

  useEffect(() => {
    if (!manifest) {
      onStatus('风场不可用')
      return
    }
    if (!reference) {
      onStatus('风场不可用：manifest 无帧')
      return
    }
    if (!visible) return

    const cacheKey = `${manifest.dataset_id}:${reference.url}`
    const installFrame = (frame: WindFrame) => {
      if (frame.width !== manifest.width || frame.height !== manifest.height) {
        throw new Error('风场帧尺寸与 manifest 不一致')
      }
      if (frameRef.current?.time !== frame.time) {
        previousFrameRef.current = frameRef.current
        frameRef.current = frame
        blendStartedAtRef.current = performance.now()
      }
      const capability = manifest.capability ?? 'dynamic'
      onStatus(`${capability === 'static' ? '静态箭头' : '动态粒子示踪（风矢量）'} · ${reference.time}`)
      staticRedrawRef.current?.()
    }

    const cached = frameCacheRef.current.get(cacheKey)
    if (cached) {
      installFrame(cached)
      return
    }

    const controller = new AbortController()
    onStatus(`同步 ERA5 ${reference.time}`)
    dataApi.windFrame(reference.url, controller.signal)
      .then((frame) => {
        frameCacheRef.current.set(cacheKey, frame)
        if (frameCacheRef.current.size > 8) {
          const oldest = frameCacheRef.current.keys().next().value
          if (oldest) frameCacheRef.current.delete(oldest)
        }
        installFrame(frame)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        onStatus(`风场不可用：${cause instanceof Error ? cause.message : String(cause)}`)
      })
    return () => controller.abort()
  }, [manifest, reference?.url, reference?.time, visible, onStatus])

  useEffect(() => {
    const canvas = canvasRef.current
    const backgroundCanvas = backgroundCanvasRef.current
    const foregroundCanvas = foregroundCanvasRef.current
    if (!map || !canvas || !backgroundCanvas || !foregroundCanvas || !manifest || !visible) {
      canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      backgroundCanvas?.getContext('2d')?.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height)
      foregroundCanvas?.getContext('2d')?.clearRect(0, 0, foregroundCanvas.width, foregroundCanvas.height)
      if (manifest && !visible) onStatus('风场已隐藏')
      return
    }

    let animation = 0
    let stopped = false
    let staticRedraw: (() => void) | null = null
    const random = seededRandom(manifest.dataset_id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0))
    const globalField = longitudeSpan(manifest) > 100
    const initialWidth = map.getCanvas().clientWidth
    const initialHeight = map.getCanvas().clientHeight
    const particleCount = Math.max(
      globalField ? 6200 : 700,
      Math.min(globalField ? 9000 : 1800, Math.round(initialWidth * initialHeight / 180)),
    )
    const particles = Array.from({ length: particleCount }, () => createParticle(map, manifest, random, initialWidth, initialHeight))
    let mapMoving = false
    let backgroundDirty = true
    const pauseForMapGesture = () => { mapMoving = true; backgroundDirty = true }
    const resumeAfterMapGesture = () => { mapMoving = false }
    const markBackgroundDirty = () => { backgroundDirty = true }
    map.on('movestart', pauseForMapGesture)
    map.on('moveend', resumeAfterMapGesture)
    map.on('resize', markBackgroundDirty)

    const drawMapEmphasis = () => {
      if (!map.isStyleLoaded()) return
      const sized = sizeCanvas(foregroundCanvas, map)
      const context = sized.context
      if (!context) return
      context.clearRect(0, 0, sized.width, sized.height)
      const seenLabels = new Set<string>()
      const features = map.queryRenderedFeatures(undefined, { layers: ['countries-line'] })
      const labelFeatures = map.querySourceFeatures('countries')
      context.save()
      context.strokeStyle = 'rgba(231, 255, 248, 0.72)'
      context.lineWidth = 1
      for (const feature of features) {
        const geometry = feature.geometry
        if (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString') continue
        const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates
        for (const line of lines) {
          context.beginPath()
          line.forEach((coordinate, index) => {
            const point = map.project(coordinate as [number, number])
            if (index === 0) context.moveTo(point.x, point.y)
            else context.lineTo(point.x, point.y)
          })
          context.stroke()
        }
      }
      context.font = '500 11px system-ui, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      for (const feature of labelFeatures) {
        const name = String(feature.properties?.NAME ?? '').trim()
        if (!name || seenLabels.has(name) || !feature.geometry) continue
        if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue
        const ring = feature.geometry.type === 'Polygon'
          ? feature.geometry.coordinates[0]
          : feature.geometry.coordinates[0]?.[0]
        if (!ring?.length) continue
        const centroid = ring.reduce((sum, coordinate) => [sum[0] + coordinate[0], sum[1] + coordinate[1]], [0, 0] as [number, number])
        const point = map.project([centroid[0] / ring.length, centroid[1] / ring.length])
        if (!isWithinGlobeDisk(map, point, sized.width, sized.height)) continue
        seenLabels.add(name)
        context.lineWidth = 3
        context.strokeStyle = 'rgba(5, 20, 27, 0.9)'
        context.strokeText(name, point.x, point.y)
        context.fillStyle = 'rgba(239, 255, 250, 0.94)'
        context.fillText(name, point.x, point.y)
      }
      context.restore()
    }
    drawMapEmphasis()
    map.on('move', drawMapEmphasis)
    map.on('resize', drawMapEmphasis)

    const drawWindBackground = (frame: WindFrame, sized: ReturnType<typeof sizeCanvas>) => {
      const background = sized.context
      if (!background) return
      background.clearRect(0, 0, sized.width, sized.height)
      let minimum = Number.POSITIVE_INFINITY
      let maximum = Number.NEGATIVE_INFINITY
      for (let index = 0; index < frame.u.length; index += 1) {
        const u = frame.u[index]
        const v = frame.v[index]
        if (u == null || v == null) continue
        const speed = Math.sqrt(u * u + v * v)
        minimum = Math.min(minimum, speed)
        maximum = Math.max(maximum, speed)
      }
      if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return
      // Earth's scalar layer is a continuous raster, not a visible grid.
      // Sample the projected screen and bilinearly interpolate the ERA5 u/v
      // field at each sample. The 4px blocks keep redraws cheap while hiding
      // the source grid and preserving smooth wind-speed color variation.
      const sampleSize = globalField ? 2 : 3
      background.globalAlpha = Math.min(0.84, Math.max(0.54, opacityRef.current * 0.94))
      for (let y = 0; y < sized.height; y += sampleSize) {
        for (let x = 0; x < sized.width; x += sampleSize) {
          const point = map.unproject([x + sampleSize * 0.5, y + sampleSize * 0.5])
          const projected = { x: x + sampleSize * 0.5, y: y + sampleSize * 0.5 }
          if (!isWithinGlobeDisk(map, projected, sized.width, sized.height)) continue
          const vector = bilinearVector(frame, manifest, point.lng, point.lat)
          if (!vector) continue
          const speed = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1])
          background.fillStyle = windColor(speed, 1, minimum, maximum)
          background.fillRect(x, y, sampleSize + 1, sampleSize + 1)
        }
      }
      background.globalAlpha = 1
      backgroundDirty = false
    }

    const drawStatic = () => {
      const frame = frameRef.current
      const sized = sizeCanvas(canvas, map)
      const context = sized.context
      if (!context) return
      context.clearRect(0, 0, sized.width, sized.height)
      if (!frame) return
      context.strokeStyle = `rgba(113, 222, 210, ${Math.max(0.42, opacityRef.current)})`
      context.lineWidth = 1.45
      context.shadowColor = 'rgba(113, 222, 210, 0.5)'
      context.shadowBlur = 2
      context.beginPath()
      const columnStep = Math.max(1, Math.ceil(frame.width / 28))
      const rowStep = Math.max(1, Math.ceil(frame.height / 18))
      for (let row = 0; row < frame.height; row += rowStep) {
        for (let column = 0; column < frame.width; column += columnStep) {
          const lon = wrapLongitude(manifest.bounds.west + column * manifest.resolution_degrees)
          const lat = manifest.bounds.north - row * manifest.resolution_degrees
          const next = advect(frame, manifest, lon, lat, 7_200)
          if (!next) continue
          const from = map.project([lon, lat])
          const projected = map.project(next)
          if (from.x < -20 || from.y < -20 || from.x > sized.width + 20 || from.y > sized.height + 20) continue
          drawArrow(context, from, projected)
        }
      }
      context.stroke()
    }

    if ((manifest.capability ?? 'dynamic') === 'static') {
      drawStatic()
      map.on('move', drawStatic)
      map.on('resize', drawStatic)
      staticRedraw = drawStatic
      staticRedrawRef.current = drawStatic
    } else {
      let previousTime = performance.now()
      const drawDynamic = (time: number) => {
        if (stopped) return
        const sized = sizeCanvas(canvas, map)
        const context = sized.context
        const frame = frameRef.current
        if (!context) return
        // MapLibre reprojects the entire view during pan/zoom. Avoid doing a
        // second full particle projection pass in the same interaction frame;
        // resume immediately on moveend with the new camera transform.
        if (mapMoving || map.isMoving()) {
          context.clearRect(0, 0, sized.width, sized.height)
          backgroundCanvas.getContext('2d')?.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height)
          animation = window.requestAnimationFrame(drawDynamic)
          return
        }
        if (backgroundDirty && frame) {
          drawWindBackground(frame, sizeCanvas(backgroundCanvas, map))
        }
        // Earth/nullschool-style trails: retain only a short-lived history so
        // streamlines reveal circulation without becoming a static texture.
        context.save()
        context.globalCompositeOperation = 'destination-in'
        // Earth-style trail buffer: retain a short history of the particle
        // segments so the flow reads as continuous streamlines.
        context.fillStyle = 'rgba(0, 0, 0, 0.965)'
        context.fillRect(0, 0, sized.width, sized.height)
        context.restore()
        if (!frame) {
          animation = window.requestAnimationFrame(drawDynamic)
          return
        }
        context.globalCompositeOperation = 'source-over'
        context.strokeStyle = `rgba(113, 222, 210, ${Math.max(0.5, opacityRef.current)})`
        context.lineWidth = globalField ? 1.25 : 1.2
        context.lineCap = 'round'
        context.globalAlpha = 1
        context.shadowBlur = 0
        // Batch all segments into one path. Per-particle beginPath/stroke and
        // head-dot arcs were the main source of interaction jank at global
        // particle densities.
        context.beginPath()
        const seconds = Math.min(34, Math.max(8, time - previousTime)) * (globalField ? 130 : 42)
        previousTime = time
        const previousFrame = previousFrameRef.current
        const blend = previousFrame
          ? Math.min(1, Math.max(0, (time - blendStartedAtRef.current) / 550))
          : 1
        for (let index = 0; index < particles.length; index += 1) {
          const particle = particles[index]
          const currentVector = bilinearVector(frame, manifest, particle.lon, particle.lat)
          const oldVector = previousFrame
            ? bilinearVector(previousFrame, manifest, particle.lon, particle.lat)
            : null
          const vector = currentVector && oldVector
            ? [
                oldVector[0] + (currentVector[0] - oldVector[0]) * blend,
                oldVector[1] + (currentVector[1] - oldVector[1]) * blend,
              ] as [number, number]
            : currentVector
          const next = vector ? advectVector(vector, particle.lon, particle.lat, seconds) : null
          if (!next || !inBounds(next[0], next[1], manifest) || particle.age >= particle.maxAge) {
            particles[index] = createParticle(map, manifest, random, sized.width, sized.height)
            continue
          }

          const from = map.project([particle.lon, particle.lat])
          const to = map.project(next)
          if (
            !isWithinGlobeDisk(map, from, sized.width, sized.height)
            || !isWithinGlobeDisk(map, to, sized.width, sized.height)
            ||
            !isVisibleGlobePoint(map, particle.lon, particle.lat, from)
            || !isVisibleGlobePoint(map, next[0], next[1], to)
          ) {
            particles[index] = createParticle(map, manifest, random, sized.width, sized.height)
            continue
          }
          if (from.x >= -5 && from.y >= -5 && from.x <= sized.width + 5 && from.y <= sized.height + 5) {
            // Earth draws only the current particle segment. The persistent
            // fading canvas supplies the visible tail across frames.
            context.moveTo(from.x, from.y)
            context.lineTo(to.x, to.y)
          }
          particle.lon = next[0]
          particle.lat = next[1]
          particle.age += 1
        }
        context.stroke()
        context.globalAlpha = 1
        if (blend >= 1) previousFrameRef.current = null
        animation = window.requestAnimationFrame(drawDynamic)
      }
      animation = window.requestAnimationFrame(drawDynamic)
    }

    return () => {
      stopped = true
      window.cancelAnimationFrame(animation)
      staticRedrawRef.current = null
      if (staticRedraw) {
        map.off('move', staticRedraw)
        map.off('resize', staticRedraw)
      }
      map.off('movestart', pauseForMapGesture)
      map.off('moveend', resumeAfterMapGesture)
      map.off('resize', markBackgroundDirty)
      map.off('move', drawMapEmphasis)
      map.off('resize', drawMapEmphasis)
      const sized = sizeCanvas(canvas, map)
      sized.context?.clearRect(0, 0, sized.width, sized.height)
      sizeCanvas(backgroundCanvas, map).context?.clearRect(0, 0, sized.width, sized.height)
      sizeCanvas(foregroundCanvas, map).context?.clearRect(0, 0, sized.width, sized.height)
    }
  }, [map, manifest, visible, onStatus])

  return (
    <>
      <canvas ref={backgroundCanvasRef} className="wind-field-background" aria-hidden="true" />
      <canvas ref={canvasRef} className="particle-overlay" role="img" aria-label="ERA5 风场粒子动画" />
      <canvas ref={foregroundCanvasRef} className="map-emphasis-overlay" aria-hidden="true" />
    </>
  )
}

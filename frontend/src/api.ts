import type {
  EvaluationRequest,
  EvaluationResponse,
  FacilityCollection,
  FacilityCreate,
  FacilityRead,
  FacilityServiceAreaResponse,
  FacilityUpdate,
  ImpactGridCollection,
  ScenarioDetail,
  ScenarioRead,
  ScenarioUpdate,
  StormCatalogResponse,
  StormDetail,
  StormTrackResponse,
  TaiwanZoneCollection,
  TrajectoryMatchRequest,
  TrajectoryMatchResponse,
  WindFrame,
  WindManifest,
} from './types/contracts'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ResourceState<T> {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'stale'
  data: T | null
  error: string
}

export function buildQuery(
  path: string,
  values: Record<string, string | number | boolean | null | undefined>,
) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  })
  const encoded = query.toString()
  return encoded ? `${path}?${encoded}` : path
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (body.detail) return JSON.stringify(body.detail)
  } catch {
    // Fall through to the status text.
  }
  return response.statusText || '请求失败'
}

export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (!response.ok) {
    throw new ApiError(response.status, await parseError(response))
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function getJson<T>(url: string, signal?: AbortSignal) {
  return requestJson<T>(url, { signal })
}

export const scenarioApi = {
  list(signal?: AbortSignal) {
    return getJson<ScenarioRead[]>('/api/scenarios', signal)
  },
  get(id: string, signal?: AbortSignal) {
    return getJson<ScenarioDetail>(`/api/scenarios/${id}`, signal)
  },
  create(name: string) {
    return requestJson<ScenarioRead>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },
  update(id: string, payload: ScenarioUpdate) {
    return requestJson<ScenarioRead>(`/api/scenarios/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return requestJson<void>(`/api/scenarios/${id}`, { method: 'DELETE' })
  },
  addFacility(id: string, payload: FacilityCreate) {
    return requestJson<FacilityRead>(`/api/scenarios/${id}/facilities`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateFacility(id: string, facilityId: string, payload: Partial<FacilityUpdate>) {
    return requestJson<FacilityRead>(
      `/api/scenarios/${id}/facilities/${facilityId}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    )
  },
  deleteFacility(id: string, facilityId: string) {
    return requestJson<void>(
      `/api/scenarios/${id}/facilities/${facilityId}`,
      { method: 'DELETE' },
    )
  },
  evaluate(id: string, payload: EvaluationRequest) {
    return requestJson<EvaluationResponse>(`/api/scenarios/${id}/evaluate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}

export const dataApi = {
  storms(
    filters: Record<string, string | number | boolean | null | undefined> = {},
    signal?: AbortSignal,
  ) {
    return getJson<StormCatalogResponse>(
      buildQuery('/api/storms', filters),
      signal,
    )
  },
  storm(id: string, signal?: AbortSignal) {
    return getJson<StormDetail>(`/api/storms/${id}`, signal)
  },
  track(
    id: string,
    filters: { start?: string; end?: string } = {},
    signal?: AbortSignal,
  ) {
    return getJson<StormTrackResponse>(
      buildQuery(`/api/storms/${id}/track`, filters),
      signal,
    )
  },
  stormWind(id: string, signal?: AbortSignal) {
    return getJson<WindManifest>(`/api/storms/${id}/wind/manifest`, signal)
  },
  periodWind(id: string, signal?: AbortSignal) {
    return getJson<WindManifest>(`/api/wind/periods/${id}/manifest`, signal)
  },
  windFrame(url: string, signal?: AbortSignal) {
    return getJson<WindFrame>(url, signal)
  },
  impact(
    filters: Record<string, string | number | null | undefined>,
    signal?: AbortSignal,
  ) {
    return getJson<ImpactGridCollection>(
      buildQuery('/api/impact/grid', filters),
      signal,
    )
  },
  taiwanZones(
    filters: Record<string, string | null | undefined> = {},
    signal?: AbortSignal,
  ) {
    return getJson<TaiwanZoneCollection>(
      buildQuery('/api/taiwan/zones', filters),
      signal,
    )
  },
  taiwanFacilities(
    filters: Record<string, string | null | undefined> = {},
    signal?: AbortSignal,
  ) {
    return getJson<FacilityCollection>(
      buildQuery('/api/taiwan/facilities', filters),
      signal,
    )
  },
  facilityServiceArea(id: string, signal?: AbortSignal) {
    return getJson<FacilityServiceAreaResponse>(
      `/api/taiwan/facilities/${id}/service-area`,
      signal,
    )
  },
  trajectory(payload: TrajectoryMatchRequest, signal?: AbortSignal) {
    return requestJson<TrajectoryMatchResponse>('/api/trajectory-match', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    })
  },
}

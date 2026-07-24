import { useCallback, useMemo, useState } from 'react'
import { buildQuery, getJson, scenarioApi } from './api'
import AppShell from './components/AppShell'
import MapView from './components/MapView'
import { useResource } from './hooks/useResource'
import {
  AppStateProvider,
  useAppDispatch,
  useAppState,
} from './state/AppState'
import type {
  DataSourceListResponse,
  HealthResponse,
  ScenarioRead,
  StormCatalogResponse,
} from './types/contracts'

function Dashboard() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [scenarioVersion, setScenarioVersion] = useState(0)
  const stormUrl = useMemo(
    () =>
      buildQuery('/api/storms', {
        classic: true,
        basin: state.mode === 'taiwan-scenario' ? undefined : state.filters.basins[0],
        season_from: state.mode === 'taiwan-scenario' ? undefined : state.filters.seasonRange[0],
        season_to: state.mode === 'taiwan-scenario' ? undefined : state.filters.seasonRange[1],
        min_wind_ms: state.mode === 'taiwan-scenario' ? undefined : state.filters.minWindMs || undefined,
      }),
    [state.filters, state.mode],
  )
  const health = useResource<HealthResponse>(
    (signal) => getJson('/api/health', signal),
    [],
  )
  const storms = useResource<StormCatalogResponse>(
    (signal) => getJson(stormUrl, signal),
    [stormUrl],
    (value) => value.items.length === 0,
  )
  const sources = useResource<DataSourceListResponse>(
    (signal) => getJson('/api/data-sources', signal),
    [],
  )
  const scenarios = useResource<ScenarioRead[]>(
    (signal) => scenarioApi.list(signal),
    [scenarioVersion],
    (value) => value.length === 0,
  )

  const refreshScenarios = useCallback(
    () => setScenarioVersion((value) => value + 1),
    [],
  )

  async function loadDemoPreset() {
    const demoStorm = storms.data?.items.find((item) => item.name.toLowerCase() === 'morakot') ?? storms.data?.items[0] ?? null
    const demoFacility = {
      type: 'shelter' as const,
      lon: 120.3267,
      lat: 23.1503,
      capacity_value: 500,
      capacity_unit: 'people' as const,
      service_radius_km: 5,
      budget_points: 3,
    }
    const priorityFacility = {
      ...demoFacility,
      capacity_value: 5000,
      service_radius_km: 10,
      budget_points: 5,
    }
    dispatch({ type: 'load-demo-preset', stormId: demoStorm?.id ?? null })
    let scenario = scenarios.data?.find((item) =>
      item.name === '同预算配置探索' || item.name === '台湾设施联调情景'
    )
    if (!scenario) {
      try {
        scenario = await scenarioApi.create('同预算配置探索')
        await scenarioApi.addFacility(scenario.id, demoFacility)
        refreshScenarios()
      } catch {
        return
      }
    }
    if (scenario) {
      try {
        const detail = await scenarioApi.get(scenario.id)
        const shelters = detail.facilities?.filter((facility) => facility.type === 'shelter') ?? []
        const seed = shelters.find((facility) =>
          (facility.lon === demoFacility.lon && facility.lat === demoFacility.lat)
          || (facility.lon === 120.3 && facility.lat === 22.65)
          || (facility.lon === 121.6 && facility.lat === 24)
        ) ?? (shelters.length === 1 ? shelters[0] : undefined)
        if (seed) {
          if (seed.lon !== demoFacility.lon
            || seed.lat !== demoFacility.lat
            || seed.capacity_value !== demoFacility.capacity_value
            || seed.service_radius_km !== demoFacility.service_radius_km
            || seed.budget_points !== demoFacility.budget_points) {
            await scenarioApi.updateFacility(scenario.id, seed.id, demoFacility)
            refreshScenarios()
          }
        } else {
          await scenarioApi.addFacility(scenario.id, demoFacility)
          refreshScenarios()
        }
      } catch {
        // A stale demo preset should not prevent the rest of the page from loading.
      }
    }
    let priorityScenario = scenarios.data?.find((item) =>
      item.name === '答辩演示情景' || item.name === '高风险优先配置'
    )
    try {
      if (!priorityScenario) {
        priorityScenario = await scenarioApi.create('答辩演示情景')
        await scenarioApi.addFacility(priorityScenario.id, priorityFacility)
        refreshScenarios()
      } else {
        const priorityDetail = await scenarioApi.get(priorityScenario.id)
        const priorityShelters = priorityDetail.facilities?.filter((facility) => facility.type === 'shelter') ?? []
        const legacyPriority = priorityShelters.find((facility) =>
          (facility.capacity_value ?? 0) >= 50000
          || (facility.service_radius_km ?? 0) >= 30
        )
        if (legacyPriority) {
          await scenarioApi.updateFacility(priorityScenario.id, legacyPriority.id, priorityFacility)
          refreshScenarios()
        } else if (priorityShelters.length === 0) {
          await scenarioApi.addFacility(priorityScenario.id, priorityFacility)
          refreshScenarios()
        }
      }
    } catch {
      // Keep the same-budget preset usable even if the secondary preset cannot be migrated.
    }
    dispatch({ type: 'set-scenario', scenarioId: scenario.id })
  }

  const error = [health.error, storms.error, sources.error, scenarios.error]
    .filter(Boolean)
    .join('；')
  const loading = [health.status, storms.status, sources.status].some(
    (status) => status === 'loading' || status === 'stale',
  )

  return (
    <AppShell
      health={health.data}
      storms={storms.data?.items ?? []}
      sources={sources.data}
      scenarios={scenarios.data ?? []}
      loading={loading}
      error={error}
      slots={{
        map: <MapView storms={storms.data?.items ?? []} windMode scenarioVersion={scenarioVersion} />,
        wind: <MapView storms={storms.data?.items ?? []} windMode scenarioVersion={scenarioVersion} />,
        trajectory: <MapView storms={storms.data?.items ?? []} windMode={false} drawMode scenarioVersion={scenarioVersion} />,
      }}
      scenarioVersion={scenarioVersion}
      onRefreshScenarios={refreshScenarios}
      onDemoPreset={() => void loadDemoPreset()}
    />
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <Dashboard />
    </AppStateProvider>
  )
}

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
        basin: state.filters.basins[0],
        season_from: state.filters.seasonRange[0],
        season_to: state.filters.seasonRange[1],
        min_wind_ms: state.filters.minWindMs || undefined,
      }),
    [state.filters],
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
    dispatch({ type: 'load-demo-preset', stormId: demoStorm?.id ?? null })
    let scenario = scenarios.data?.find((item) => item.name === '同预算配置探索')
    if (!scenario) {
      const legacy = scenarios.data?.find((item) => item.name === '答辩演示情景' || item.name === '台湾设施联调情景')
      try {
        scenario = legacy
          ? await scenarioApi.update(legacy.id, { name: '同预算配置探索' })
          : await scenarioApi.create('同预算配置探索')
        await scenarioApi.addFacility(scenario.id, {
          type: 'shelter',
          lon: 121.6,
          lat: 24,
          capacity_value: 50000,
          capacity_unit: 'people',
          service_radius_km: 50,
          budget_points: 3,
        })
        refreshScenarios()
      } catch {
        return
      }
    }
    if (scenario) {
      try {
        const detail = await scenarioApi.get(scenario.id)
        const seed = detail.facilities?.find((facility) =>
          facility.type === 'shelter'
          && facility.lon === 121.6
          && facility.lat === 24
          && facility.capacity_value === 500
          && facility.service_radius_km === 5
        )
        if (seed) {
          await scenarioApi.updateFacility(scenario.id, seed.id, {
            capacity_value: 50000,
            service_radius_km: 50,
            budget_points: 5,
          })
          refreshScenarios()
        }
      } catch {
        // A stale demo preset should not prevent the rest of the page from loading.
      }
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

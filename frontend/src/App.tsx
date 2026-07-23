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
  const classicStormUrl = useMemo(
    () =>
      buildQuery('/api/storms', {
        classic: true,
        basin: state.selectedBasin,
        season_from: state.selectedYearRange[0],
        season_to: state.selectedYearRange[1],
        min_wind_ms: state.minWindMs || undefined,
      }),
    [state.minWindMs, state.selectedBasin, state.selectedYearRange],
  )
  const health = useResource<HealthResponse>(
    (signal) => getJson('/api/health', signal),
    [],
  )
  const allStorms = useResource<StormCatalogResponse>(
    (signal) => getJson('/api/storms', signal),
    [],
    (value) => value.items.length === 0,
  )
  const classicStorms = useResource<StormCatalogResponse>(
    (signal) => getJson(classicStormUrl, signal),
    [classicStormUrl],
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
    dispatch({ type: 'load-demo-preset' })
    let scenario = scenarios.data?.find((item) => item.name === '答辩演示情景')
    if (!scenario) {
      try {
        scenario = await scenarioApi.create('答辩演示情景')
        await scenarioApi.addFacility(scenario.id, {
          type: 'shelter',
          lon: 121.6,
          lat: 24,
          capacity_value: 500,
          capacity_unit: 'people',
          service_radius_km: 5,
          budget_points: 3,
        })
        refreshScenarios()
      } catch {
        return
      }
    }
    dispatch({ type: 'set-scenario', scenarioId: scenario.id })
  }

  const filteredMapStorms = useMemo(() => (allStorms.data?.items ?? []).filter((storm) =>
    storm.season >= state.selectedYearRange[0]
    && storm.season <= state.selectedYearRange[1]
    && (!state.selectedBasin || storm.basin === state.selectedBasin)
    && (storm.max_wind_ms == null || storm.max_wind_ms >= state.minWindMs)), [allStorms.data, state.minWindMs, state.selectedBasin, state.selectedYearRange])

  const error = [health.error, allStorms.error, classicStorms.error, sources.error, scenarios.error]
    .filter(Boolean)
    .join('；')
  const loading = [health.status, allStorms.status, classicStorms.status, sources.status].some(
    (status) => status === 'loading' || status === 'stale',
  )

  return (
    <AppShell
      health={health.data}
      storms={classicStorms.data?.items ?? []}
      allStorms={allStorms.data?.items ?? []}
      allStormsStatus={allStorms.status}
      allStormsError={allStorms.error}
      sources={sources.data}
      scenarios={scenarios.data ?? []}
      loading={loading}
      error={error}
      slots={{
        map: <MapView storms={filteredMapStorms} windMode scenarioVersion={scenarioVersion} />,
        wind: <MapView storms={filteredMapStorms} windMode scenarioVersion={scenarioVersion} />,
        trajectory: <MapView storms={filteredMapStorms} windMode={false} drawMode scenarioVersion={scenarioVersion} />,
      }}
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

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from 'react'

export type AnalysisMode = 'overview' | 'storm' | 'draw-match' | 'taiwan-scenario'
export type StoryStage = 'global' | 'event' | 'similarity' | 'impact' | 'regional' | 'response'
export type FacilitySelection = 'shelter' | 'medical' | 'rescue'
export interface LayerState { visible: boolean; opacity: number }
export type ImpactMetric =
  | 'hazard_index'
  | 'max_wind_ms'
  | 'precip_mm'
  | 'population'
  | 'exposed_population'
  | 'reported_damage_usd'
export type FacilityAnalysisType = FacilitySelection
export type ScenarioView = 'baseline' | 'current'

export interface CurrentObservation {
  time: string
  lon: number
  lat: number
  wind_ms: number | null
  pressure_hpa: number | null
  category: string | null
  moving_speed_kmh: number | null
  source_agency: string | null
}

export interface AppState {
  storyStage: StoryStage
  mode: AnalysisMode
  selectedBasin: string | null
  selectedYearRange: [number, number]
  selectedStormId: string | null
  selectedZoneId: string | null
  selectedMatchId: string | null
  selectedImpactMetric: ImpactMetric
  minWindMs: number
  trajectoryMatch: import('../types/contracts').TrajectoryMatchResponse | null
  trajectoryMatchStatus: 'idle' | 'loading' | 'ready' | 'error'
  trajectoryMatchError: string
  comparisonStormIds: string[]
  currentTime: string | null
  currentObservation: CurrentObservation | null
  timeWindow: { start: string; end: string } | null
  impactMetric: ImpactMetric
  hazardThreshold: number
  filters: { basins: string[]; seasonRange: [number, number]; minWindMs: number }
  layers: Record<'tracks' | 'wind' | 'impact' | 'facilities', LayerState>
  selectedScenarioId: string | null
  selectedFacilityType: FacilityAnalysisType
  scenarioView: ScenarioView
  isPlaying: boolean
  playbackSpeed: number
}

type Action =
  | { type: 'set-story-stage'; stage: StoryStage }
  | { type: 'set-mode'; mode: AnalysisMode }
  | { type: 'select-storm'; stormId: string | null }
  | { type: 'select-taiwan-storm'; stormId: string }
  | { type: 'select-zone'; zoneId: string | null }
  | { type: 'select-match'; stormId: string | null }
  | { type: 'toggle-comparison'; stormId: string }
  | { type: 'set-basin'; basin: string | null }
  | { type: 'set-basins'; basins: string[] }
  | { type: 'set-year-range'; range: [number, number] }
  | { type: 'set-season-range'; range: [number, number] }
  | { type: 'set-min-wind'; value: number }
  | { type: 'set-layer'; layer: keyof AppState['layers']; value: Partial<LayerState> }
  | { type: 'set-time'; value: string | null }
  | { type: 'set-current-observation'; value: CurrentObservation | null }
  | { type: 'set-time-window'; value: AppState['timeWindow'] }
  | { type: 'set-impact-metric'; value: ImpactMetric }
  | { type: 'set-scenario'; scenarioId: string | null }
  | { type: 'set-hazard-threshold'; value: number }
  | { type: 'set-zone'; zoneId: string | null }
  | { type: 'set-match'; stormId: string | null }
  | { type: 'set-facility-type'; value: FacilityAnalysisType }
  | { type: 'set-scenario-view'; value: ScenarioView }
  | {
      type: 'set-trajectory-match'
      value: import('../types/contracts').TrajectoryMatchResponse | null
      status?: AppState['trajectoryMatchStatus']
      error?: string
    }
  | { type: 'set-trajectory-match-status'; status: AppState['trajectoryMatchStatus']; error?: string }
  | { type: 'set-playing'; value: boolean }
  | { type: 'set-speed'; value: number }
  | { type: 'load-demo-preset'; stormId?: string | null }

export const initialState: AppState = {
  storyStage: 'global',
  mode: 'overview',
  selectedBasin: null,
  selectedYearRange: [1840, 2200],
  selectedStormId: null,
  selectedZoneId: null,
  selectedMatchId: null,
  selectedImpactMetric: 'hazard_index',
  minWindMs: 0,
  trajectoryMatch: null,
  trajectoryMatchStatus: 'idle',
  trajectoryMatchError: '',
  comparisonStormIds: [],
  currentTime: null,
  currentObservation: null,
  timeWindow: null,
  impactMetric: 'hazard_index',
  hazardThreshold: 0.25,
  filters: { basins: [], seasonRange: [1840, 2200], minWindMs: 0 },
  layers: {
    tracks: { visible: true, opacity: 0.75 },
    wind: { visible: true, opacity: 0.45 },
    impact: { visible: true, opacity: 0.62 },
    facilities: { visible: true, opacity: 0.9 },
  },
  selectedScenarioId: null,
  selectedFacilityType: 'shelter',
  scenarioView: 'current',
  isPlaying: false,
  playbackSpeed: 1,
}

function stageForMode(mode: AnalysisMode): StoryStage {
  if (mode === 'overview') return 'global'
  if (mode === 'draw-match') return 'similarity'
  if (mode === 'taiwan-scenario') return 'regional'
  return 'event'
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set-story-stage': {
      const mode: AnalysisMode =
        action.stage === 'global'
          ? 'overview'
          : action.stage === 'similarity'
            ? 'draw-match'
            : action.stage === 'regional' || action.stage === 'response'
              ? 'taiwan-scenario'
              : 'storm'
      return { ...state, storyStage: action.stage, mode, isPlaying: action.stage === 'event' ? state.isPlaying : false }
    }
    case 'set-mode':
      return action.mode === 'overview'
        ? {
            ...state,
            storyStage: 'global',
            mode: action.mode,
            selectedStormId: null,
            selectedZoneId: null,
            selectedMatchId: null,
            currentTime: null,
            currentObservation: null,
            timeWindow: null,
            isPlaying: false,
          }
        : { ...state, mode: action.mode, storyStage: stageForMode(action.mode) }
    case 'select-storm':
      return {
        ...state,
        selectedStormId: action.stormId,
        selectedMatchId: null,
        mode: action.stormId ? 'storm' : state.mode,
        storyStage: action.stormId ? 'event' : state.storyStage,
        currentTime: null,
        currentObservation: null,
        timeWindow: null,
        isPlaying: false,
      }
    case 'select-taiwan-storm':
      return {
        ...state,
        selectedStormId: action.stormId,
        selectedMatchId: null,
        selectedZoneId: null,
        mode: 'taiwan-scenario',
        storyStage: 'regional',
        currentTime: null,
        currentObservation: null,
        timeWindow: null,
        isPlaying: false,
        layers: {
          ...state.layers,
          impact: { ...state.layers.impact, visible: true },
          facilities: { ...state.layers.facilities, visible: true },
        },
      }
    case 'select-zone':
    case 'set-zone':
      return { ...state, selectedZoneId: action.zoneId }
    case 'select-match':
    case 'set-match':
      return { ...state, selectedMatchId: action.stormId }
    case 'toggle-comparison': {
      const exists = state.comparisonStormIds.includes(action.stormId)
      const comparisonStormIds = exists
        ? state.comparisonStormIds.filter((id) => id !== action.stormId)
        : [...state.comparisonStormIds, action.stormId].slice(-2)
      return { ...state, comparisonStormIds }
    }
    case 'set-basins':
      return {
        ...state,
        selectedBasin: action.basins[0] ?? null,
        filters: { ...state.filters, basins: action.basins },
      }
    case 'set-basin':
      return {
        ...state,
        selectedBasin: action.basin,
        filters: { ...state.filters, basins: action.basin ? [action.basin] : [] },
      }
    case 'set-season-range':
      return {
        ...state,
        selectedYearRange: action.range,
        filters: { ...state.filters, seasonRange: action.range },
      }
    case 'set-year-range':
      return {
        ...state,
        selectedYearRange: action.range,
        filters: { ...state.filters, seasonRange: action.range },
      }
    case 'set-min-wind':
      return {
        ...state,
        minWindMs: action.value,
        filters: { ...state.filters, minWindMs: action.value },
      }
    case 'set-layer':
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.layer]: { ...state.layers[action.layer], ...action.value },
        },
      }
    case 'set-time':
      return { ...state, currentTime: action.value }
    case 'set-current-observation':
      return { ...state, currentObservation: action.value }
    case 'set-time-window':
      return { ...state, timeWindow: action.value }
    case 'set-impact-metric':
      return { ...state, impactMetric: action.value, selectedImpactMetric: action.value }
    case 'set-scenario':
      return { ...state, selectedScenarioId: action.scenarioId }
    case 'set-hazard-threshold':
      return { ...state, hazardThreshold: Math.max(0, Math.min(1, action.value)) }
    case 'set-facility-type':
      return { ...state, selectedFacilityType: action.value }
    case 'set-scenario-view':
      return { ...state, scenarioView: action.value }
    case 'set-trajectory-match':
      return {
        ...state,
        trajectoryMatch: action.value,
        trajectoryMatchStatus: action.status ?? (action.value ? 'ready' : 'idle'),
        trajectoryMatchError: action.error ?? '',
      }
    case 'set-trajectory-match-status':
      return { ...state, trajectoryMatchStatus: action.status, trajectoryMatchError: action.error ?? '' }
    case 'set-playing':
      return { ...state, isPlaying: action.value }
    case 'set-speed':
      return { ...state, playbackSpeed: action.value }
    case 'load-demo-preset': {
      const stormId = action.stormId ?? 'demo-morakot-2009'
      return {
        ...initialState,
        storyStage: 'event',
        mode: 'storm',
        selectedBasin: 'WP',
        selectedYearRange: [2000, 2020],
        selectedStormId: stormId,
        currentTime: '2009-08-07T00:00:00Z',
        timeWindow: {
          start: '2009-08-05T00:00:00Z',
          end: '2009-08-08T00:00:00Z',
        },
        filters: { basins: ['WP'], seasonRange: [2000, 2020], minWindMs: 0 },
        layers: {
          ...initialState.layers,
          impact: { visible: true, opacity: 0.68 },
        },
      }
    }
    default:
      return state
  }
}

const StateContext = createContext<AppState | null>(null)
const DispatchContext = createContext<Dispatch<Action> | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const value = useMemo(() => state, [state])
  return (
    <StateContext.Provider value={value}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useAppState() {
  const value = useContext(StateContext)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider')
  return value
}

export function useAppDispatch() {
  const value = useContext(DispatchContext)
  if (!value) throw new Error('useAppDispatch must be used inside AppStateProvider')
  return value
}

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from 'react'

export type AnalysisMode =
  | 'overview'
  | 'storm'
  | 'draw-match'
  | 'taiwan-scenario'

export type StoryStage =
  | 'global'
  | 'event'
  | 'similarity'
  | 'impact'
  | 'regional'
  | 'response'

export type FacilitySelection = 'shelter' | 'medical' | 'rescue'

export interface LayerState {
  visible: boolean
  opacity: number
}

export type ImpactMetric =
  | 'hazard_index'
  | 'max_wind_ms'
  | 'precip_mm'
  | 'population'
  | 'exposed_population'
  | 'reported_damage_usd'

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
  selectedFacilityType: FacilitySelection
  scenarioView: 'baseline' | 'current'
  comparisonStormIds: string[]
  currentTime: string | null
  currentObservation: CurrentObservation | null
  timeWindow: { start: string; end: string } | null
  selectedImpactMetric: ImpactMetric
  minWindMs: number
  trajectoryMatch: import('../types/contracts').TrajectoryMatchResponse | null
  trajectoryMatchStatus: 'idle' | 'loading' | 'ready' | 'error'
  trajectoryMatchError: string
  layers: Record<'tracks' | 'wind' | 'impact' | 'facilities', LayerState>
  selectedScenarioId: string | null
  isPlaying: boolean
  playbackSpeed: number
}

type Action =
  | { type: 'set-story-stage'; stage: StoryStage }
  | { type: 'set-mode'; mode: AnalysisMode }
  | { type: 'select-storm'; stormId: string | null }
  | { type: 'select-zone'; zoneId: string | null }
  | { type: 'select-match'; stormId: string | null }
  | { type: 'toggle-comparison'; stormId: string }
  | { type: 'set-basin'; basin: string | null }
  | { type: 'set-year-range'; range: [number, number] }
  | { type: 'set-min-wind'; value: number }
  | { type: 'set-layer'; layer: keyof AppState['layers']; value: Partial<LayerState> }
  | { type: 'set-time'; value: string | null }
  | { type: 'set-current-observation'; value: CurrentObservation | null }
  | { type: 'set-time-window'; value: AppState['timeWindow'] }
  | { type: 'set-impact-metric'; value: ImpactMetric }
  | { type: 'set-facility-type'; value: FacilitySelection }
  | { type: 'set-scenario-view'; value: 'baseline' | 'current' }
  | {
      type: 'set-trajectory-match'
      value: import('../types/contracts').TrajectoryMatchResponse | null
      status?: AppState['trajectoryMatchStatus']
      error?: string
    }
  | { type: 'set-trajectory-match-status'; status: AppState['trajectoryMatchStatus']; error?: string }
  | { type: 'set-scenario'; scenarioId: string | null }
  | { type: 'set-playing'; value: boolean }
  | { type: 'set-speed'; value: number }
  | { type: 'load-demo-preset' }

export const initialState: AppState = {
  storyStage: 'global',
  mode: 'overview',
  selectedBasin: null,
  selectedYearRange: [1840, 2200],
  selectedStormId: null,
  selectedZoneId: null,
  selectedMatchId: null,
  selectedFacilityType: 'shelter',
  scenarioView: 'current',
  comparisonStormIds: [],
  currentTime: null,
  currentObservation: null,
  timeWindow: null,
  selectedImpactMetric: 'hazard_index',
  minWindMs: 0,
  trajectoryMatch: null,
  trajectoryMatchStatus: 'idle',
  trajectoryMatchError: '',
  layers: {
    tracks: { visible: true, opacity: 0.75 },
    wind: { visible: true, opacity: 0.45 },
    impact: { visible: true, opacity: 0.62 },
    facilities: { visible: true, opacity: 0.9 },
  },
  selectedScenarioId: null,
  isPlaying: false,
  playbackSpeed: 1,
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
      return {
        ...state,
        storyStage: action.stage,
        mode,
        isPlaying: action.stage === 'event' ? state.isPlaying : false,
      }
    }
    case 'set-mode':
      return action.mode === 'overview'
        ? {
            ...state,
            mode: action.mode,
            storyStage: 'global',
            selectedStormId: null,
            currentTime: null,
            currentObservation: null,
            timeWindow: null,
            isPlaying: false,
          }
        : {
            ...state,
            mode: action.mode,
            storyStage:
              action.mode === 'draw-match'
                ? 'similarity'
                : action.mode === 'taiwan-scenario'
                  ? 'regional'
                  : 'event',
          }
    case 'select-storm':
      return {
        ...state,
        selectedStormId: action.stormId,
        mode: action.stormId ? 'storm' : state.mode,
        storyStage: action.stormId ? 'event' : state.storyStage,
        currentTime: null,
        currentObservation: null,
        timeWindow: null,
        isPlaying: false,
      }
    case 'select-zone':
      return { ...state, selectedZoneId: action.zoneId }
    case 'select-match':
      return { ...state, selectedMatchId: action.stormId }
    case 'toggle-comparison': {
      const exists = state.comparisonStormIds.includes(action.stormId)
      const next = exists
        ? state.comparisonStormIds.filter((id) => id !== action.stormId)
        : [...state.comparisonStormIds, action.stormId].slice(-2)
      return { ...state, comparisonStormIds: next }
    }
    case 'set-basin':
      return { ...state, selectedBasin: action.basin }
    case 'set-year-range':
      return { ...state, selectedYearRange: action.range }
    case 'set-min-wind':
      return { ...state, minWindMs: action.value }
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
      return { ...state, selectedImpactMetric: action.value }
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
      return {
        ...state,
        trajectoryMatchStatus: action.status,
        trajectoryMatchError: action.error ?? '',
      }
    case 'set-scenario':
      return { ...state, selectedScenarioId: action.scenarioId }
    case 'set-playing':
      return { ...state, isPlaying: action.value }
    case 'set-speed':
      return { ...state, playbackSpeed: action.value }
    case 'load-demo-preset':
      return {
        ...initialState,
        storyStage: 'event',
        mode: 'storm',
        selectedStormId: 'demo-morakot-2009',
        currentTime: '2009-08-07T00:00:00Z',
        timeWindow: {
          start: '2009-08-05T00:00:00Z',
          end: '2009-08-08T00:00:00Z',
        },
        selectedBasin: 'WP',
        selectedYearRange: [2000, 2020],
        layers: {
          ...initialState.layers,
          impact: { visible: true, opacity: 0.68 },
        },
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

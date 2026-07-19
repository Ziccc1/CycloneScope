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

export interface LayerState {
  visible: boolean
  opacity: number
}

export interface AppState {
  mode: AnalysisMode
  selectedStormId: string | null
  comparisonStormIds: string[]
  currentTime: string | null
  timeWindow: { start: string; end: string } | null
  filters: {
    basins: string[]
    seasonRange: [number, number]
    minWindMs: number
  }
  layers: Record<'tracks' | 'wind' | 'impact' | 'facilities', LayerState>
  selectedScenarioId: string | null
  isPlaying: boolean
  playbackSpeed: number
}

type Action =
  | { type: 'set-mode'; mode: AnalysisMode }
  | { type: 'select-storm'; stormId: string | null }
  | { type: 'toggle-comparison'; stormId: string }
  | { type: 'set-basins'; basins: string[] }
  | { type: 'set-season-range'; range: [number, number] }
  | { type: 'set-min-wind'; value: number }
  | { type: 'set-layer'; layer: keyof AppState['layers']; value: Partial<LayerState> }
  | { type: 'set-time'; value: string | null }
  | { type: 'set-time-window'; value: AppState['timeWindow'] }
  | { type: 'set-scenario'; scenarioId: string | null }
  | { type: 'set-playing'; value: boolean }
  | { type: 'set-speed'; value: number }
  | { type: 'load-demo-preset' }

export const initialState: AppState = {
  mode: 'overview',
  selectedStormId: null,
  comparisonStormIds: [],
  currentTime: null,
  timeWindow: null,
  filters: {
    basins: [],
    seasonRange: [1840, 2200],
    minWindMs: 0,
  },
  layers: {
    tracks: { visible: true, opacity: 0.75 },
    wind: { visible: true, opacity: 0.45 },
    impact: { visible: false, opacity: 0.68 },
    facilities: { visible: true, opacity: 0.9 },
  },
  selectedScenarioId: null,
  isPlaying: false,
  playbackSpeed: 1,
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set-mode':
      return { ...state, mode: action.mode }
    case 'select-storm':
      return { ...state, selectedStormId: action.stormId, mode: action.stormId ? 'storm' : state.mode }
    case 'toggle-comparison': {
      const exists = state.comparisonStormIds.includes(action.stormId)
      const next = exists
        ? state.comparisonStormIds.filter((id) => id !== action.stormId)
        : [...state.comparisonStormIds, action.stormId].slice(-2)
      return { ...state, comparisonStormIds: next }
    }
    case 'set-basins':
      return { ...state, filters: { ...state.filters, basins: action.basins } }
    case 'set-season-range':
      return { ...state, filters: { ...state.filters, seasonRange: action.range } }
    case 'set-min-wind':
      return { ...state, filters: { ...state.filters, minWindMs: action.value } }
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
    case 'set-time-window':
      return { ...state, timeWindow: action.value }
    case 'set-scenario':
      return { ...state, selectedScenarioId: action.scenarioId }
    case 'set-playing':
      return { ...state, isPlaying: action.value }
    case 'set-speed':
      return { ...state, playbackSpeed: action.value }
    case 'load-demo-preset':
      return {
        ...initialState,
        mode: 'storm',
        selectedStormId: 'demo-morakot-2009',
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

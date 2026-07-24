/**
 * Component owner: A
 * Loads the shared regional datasets once and supplies all Taiwan-scenario narratives.
 */
import { useEffect, useMemo, useState } from 'react'
import { dataApi, scenarioApi } from '../../api'
import { useAppState } from '../../state/AppState'
import type {
  DataSourceListResponse,
  FacilityCollection,
  HealthResponse,
  ImpactGridCollection,
  ScenarioDetail,
  StormSummary,
  TaiwanZoneCollection,
} from '../../types/contracts'
import CoverageBreakdown from './CoverageBreakdown'
import CoverageGapTable from './CoverageGapTable'
import BudgetBenefitFrontier from './BudgetBenefitFrontier'
import DataConfidenceLayer from './DataConfidenceLayer'
import HazardExposureGap from './HazardExposureGap'
import NarrativeEvidenceCard from './NarrativeEvidenceCard'
import { displayScenarioName } from '../scenarioLabels'
import RiskMetricCards from './RiskMetricCards'
import ScenarioDataContext from './ScenarioDataContext'
import ScenarioMetricComparison from './ScenarioMetricComparison'
import ZoneRiskRanking from './ZoneRiskRanking'
import { deriveRegionalRisk } from './riskAnalysis'

type AnalysisStatus = 'loading' | 'ready' | 'empty' | 'error'

interface Props {
  health: HealthResponse | null
  sources: DataSourceListResponse | null
  storms: StormSummary[]
  scenarioVersion: number
  onRefresh: () => void
}

interface DatasetState {
  zones: TaiwanZoneCollection | null
  impact: ImpactGridCollection | null
  facilities: FacilityCollection | null
  scenario: ScenarioDetail | null
}

const EMPTY_DATA: DatasetState = {
  zones: null,
  impact: null,
  facilities: null,
  scenario: null,
}

export default function NarrativeAnalysisPanel({
  health,
  sources,
  storms,
  scenarioVersion,
  onRefresh,
}: Props) {
  const state = useAppState()
  const [datasets, setDatasets] = useState<DatasetState>(EMPTY_DATA)
  const [status, setStatus] = useState<AnalysisStatus>('empty')
  const [error, setError] = useState('')
  const selectedStorm = storms.find((storm) => storm.id === state.selectedStormId) ?? null

  useEffect(() => {
    if (state.mode !== 'taiwan-scenario') return
    const controller = new AbortController()
    let active = true

    async function load() {
      setStatus('loading')
      setError('')
      try {
        const impactRequest = selectedStorm?.impact_available
          ? dataApi.impact(
              { storm_id: selectedStorm.id, metric: state.impactMetric },
              controller.signal,
            )
          : Promise.resolve(null)
        const scenarioRequest = state.selectedScenarioId
          ? scenarioApi.get(state.selectedScenarioId, controller.signal)
          : Promise.resolve(null)
        const [zones, impact, facilities, scenario] = await Promise.all([
          dataApi.taiwanZones({}, controller.signal),
          impactRequest,
          dataApi.taiwanFacilities({}, controller.signal),
          scenarioRequest,
        ])
        if (!active) return
        setDatasets({ zones, impact, facilities, scenario })
        setStatus(
          impact && impact.features.length > 0 && zones.features.length > 0
            ? 'ready'
            : 'empty',
        )
      } catch (cause) {
        if (!active || controller.signal.aborted) return
        setDatasets(EMPTY_DATA)
        setStatus('error')
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }

    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [
    state.mode,
    state.selectedScenarioId,
    state.impactMetric,
    selectedStorm?.id,
    selectedStorm?.impact_available,
    scenarioVersion,
  ])

  const analysis = useMemo(() => {
    if (!datasets.zones || !datasets.impact || !datasets.facilities) return null
    return deriveRegionalRisk({
      zones: datasets.zones,
      impact: datasets.impact,
      facilities: datasets.facilities,
      simulatedFacilities: datasets.scenario?.facilities ?? [],
      facilityType: state.selectedFacilityType,
      threshold: state.hazardThreshold,
    })
  }, [
    datasets,
    state.selectedFacilityType,
    state.hazardThreshold,
  ])

  return (
    <>
      <section className="a-component-section context-section">
        <div className="panel-heading">
          <div><p className="eyebrow">DATA CONTEXT · A</p><h2>数据时空背景</h2></div>
          <span className="tag">{health?.data_mode === 'processed' ? '处理数据' : '演示数据'}</span>
        </div>
        <ScenarioDataContext
          storm={selectedStorm}
          sources={sources}
          health={health}
          analysis={analysis}
        />
      </section>

      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">HAZARD → EXPOSURE → GAP · A</p><h2>危险—暴露—缺口</h2></div>
          <span className="tag">叙事链</span>
        </div>
        <HazardExposureGap analysis={analysis} />
      </section>

      <details className="a-details">
        <summary>数据质量与行政区诊断</summary>
      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">DATA CONFIDENCE · A</p><h2>数据可信度</h2></div>
          <span className="tag">来源/年份/缺失</span>
        </div>
        <DataConfidenceLayer storm={selectedStorm} sources={sources} health={health} analysis={analysis} />
      </section>

      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">RISK SNAPSHOT · A</p><h2>风险指标卡</h2></div>
          <span className="count">8</span>
        </div>
        <RiskMetricCards analysis={analysis} status={status} error={error} />
      </section>

      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">ZONE RANKING · A</p><h2>行政区风险排名</h2></div>
          <span className="tag">Top 10</span>
        </div>
        <ZoneRiskRanking analysis={analysis} status={status} error={error} />
      </section>

      <section className="a-component-section gap-table-section">
        <div className="panel-heading">
          <div><p className="eyebrow">COVERAGE GAP · A</p><h2>行政区设施缺口</h2></div>
          <span className="tag">可排序</span>
        </div>
        <CoverageGapTable analysis={analysis} />
      </section>

      </details>
      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">COVERAGE · A</p><h2>设施覆盖拆解</h2></div>
          <span className="tag">{state.selectedFacilityType}</span>
        </div>
        <CoverageBreakdown analysis={analysis} status={status} error={error} />
      </section>

      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">BUDGET → BENEFIT · A</p><h2>预算—收益前沿</h2></div>
          <span className="tag">边际收益</span>
        </div>
        <BudgetBenefitFrontier analysis={analysis} scenario={datasets.scenario} />
      </section>

      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">SCENARIO DELTA · A</p><h2>基线与方案对比</h2></div>
          <span className="tag">{datasets.scenario ? displayScenarioName(datasets.scenario.name) : '未选择情景'}</span>
        </div>
        <ScenarioMetricComparison
          analysis={analysis}
          scenario={datasets.scenario}
          status={status}
          error={error}
          onRefresh={onRefresh}
        />
      </section>

      <section className="a-component-section">
        <div className="panel-heading">
          <div><p className="eyebrow">NARRATIVE EVIDENCE · A</p><h2>叙事证据卡片</h2></div>
          <span className="tag">汇报线索</span>
        </div>
        <NarrativeEvidenceCard analysis={analysis} storm={selectedStorm} />
      </section>
    </>
  )
}

import type { CostView, MetricKey } from './types'
import type { Lang } from './i18n'

export interface UrlState {
  lang: Lang
  theme: 'dark' | 'light'
  metric: MetricKey
  costView: CostView
  taskInput: number
  taskOutput: number
  logScale: boolean
  includeEfforts: boolean
  maxEffortOnly: boolean
  minScore: number
  query: string
  /** null means all families */
  families: string[] | null
  selectedId: string | null
  /** id of the named preset this view corresponds to (informational) */
  presetId: string | null
}

const METRICS: MetricKey[] = ['intelligenceIndex', 'codingIndex', 'agenticIndex', 'tau2', 'hle', 'omniscience', 'outputSpeed', 'latencySeconds', 'contextTokens']
const COST_VIEWS: CostView[] = ['input', 'blended', 'cache', 'output', 'task']

/** Metrics where a lower value is better (e.g. latency). */
export function isLowerBetter(metric: MetricKey): boolean {
  return metric === 'latencySeconds'
}

/** Default "show everything" threshold for a metric (0 = higher is better, max = lower is better). */
export function defaultMinScore(metric: MetricKey, max: number): number {
  return isLowerBetter(metric) ? max : 0
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function parseUrl(search: string, allFamilies: string[], metricMax: Record<MetricKey, number>): UrlState {
  const p = new URLSearchParams(search)
  const metricRaw = p.get('metric')
  const costRaw = p.get('cost')
  const famRaw = p.get('f')
  let families: string[] | null = null
  if (famRaw) {
    const valid = famRaw.split(',').filter((f) => allFamilies.includes(f))
    families = valid.length ? valid : null
  }
  const metric: MetricKey = METRICS.includes(metricRaw as MetricKey) ? (metricRaw as MetricKey) : 'intelligenceIndex'
  const max = metricMax[metric] || 1
  return {
    lang: p.get('lang') === 'en' ? 'en' : 'it',
    theme: p.get('theme') === 'light' ? 'light' : 'dark',
    metric,
    costView: COST_VIEWS.includes(costRaw as CostView) ? (costRaw as CostView) : 'input',
    taskInput: clampInt(p.get('tin'), 1, 1_000_000, 3000),
    taskOutput: clampInt(p.get('tout'), 1, 1_000_000, 1000),
    logScale: p.get('log') !== '0',
    includeEfforts: p.get('efforts') !== '0',
    maxEffortOnly: p.get('maxeffort') === '1',
    minScore: clampInt(p.get('min'), 0, max, defaultMinScore(metric, max)),
    query: p.get('q') ?? '',
    families,
    selectedId: p.get('sel') || null,
    presetId: p.get('p') || null,
  }
}

/** Serialize state to a query string, omitting default values so URLs stay short. */
export function toSearch(s: UrlState, allFamilies: string[], metricMax: Record<MetricKey, number>, presetId?: string | null): string {
  const p = new URLSearchParams()
  if (s.lang !== 'it') p.set('lang', s.lang)
  if (s.theme !== 'dark') p.set('theme', s.theme)
  if (s.metric !== 'intelligenceIndex') p.set('metric', s.metric)
  if (s.costView !== 'input') p.set('cost', s.costView)
  if (s.taskInput !== 3000) p.set('tin', String(s.taskInput))
  if (s.taskOutput !== 1000) p.set('tout', String(s.taskOutput))
  if (!s.logScale) p.set('log', '0')
  if (!s.includeEfforts) p.set('efforts', '0')
  if (s.maxEffortOnly) p.set('maxeffort', '1')
  const max = metricMax[s.metric] || 1
  if (s.minScore !== defaultMinScore(s.metric, max)) p.set('min', String(s.minScore))
  if (s.query) p.set('q', s.query)
  if (s.families && s.families.length > 0 && s.families.length !== allFamilies.length) {
    p.set('f', s.families.join(','))
  }
  if (s.selectedId) p.set('sel', s.selectedId)
  if (presetId) p.set('p', presetId)
  return p.toString()
}

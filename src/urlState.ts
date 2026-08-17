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
  reasoningOnly: boolean
  openWeightsOnly: boolean
  minPrice: number
  maxPrice: number
  compareIds: string[]
  minContext: number
  releasedFrom: string
  showSubscriptions: boolean
  usageFactor: number // 1.0 (100%), 0.5 (50%), 0.25 (25%)
  subscriptionOnly: boolean
}


const METRICS: MetricKey[] = [
  'intelligenceIndex',
  'codingIndex',
  'agenticIndex',
  'tau2',
  'hle',
  'omniscience',
  'outputSpeed',
  'latencySeconds',
  'contextTokens',
  'valueScore',
  'speedAdjustedScore',
  'contextValue',
]
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
  if (raw === null) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampFloat(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
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
  const compareRaw = p.get('cmp')
  const compareIds = compareRaw ? compareRaw.split(',').filter(Boolean) : []
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
    reasoningOnly: p.get('reason') === '1',
    openWeightsOnly: p.get('open') === '1',
    minPrice: clampFloat(p.get('pmin'), 0, 1000, 0),
    maxPrice: clampFloat(p.get('pmax'), 0, 1000, 1000),
    compareIds,
    minContext: clampInt(p.get('ctxmin'), 0, 10_000_000, 0),
    releasedFrom: /^\d{4}-\d{2}-\d{2}$/.test(p.get('relfrom') ?? '') ? (p.get('relfrom') as string) : '',
    showSubscriptions: p.get('subs') !== '0',
    usageFactor: clampFloat(p.get('usage'), 0.1, 1.0, 1.0),
    subscriptionOnly: p.get('subonly') === '1',
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
  if (s.reasoningOnly) p.set('reason', '1')
  if (s.openWeightsOnly) p.set('open', '1')
  if (s.minPrice > 0) p.set('pmin', String(s.minPrice))
  if (s.maxPrice < 1000) p.set('pmax', String(s.maxPrice))
  if (s.compareIds.length > 0) p.set('cmp', s.compareIds.join(','))
  if (s.minContext > 0) p.set('ctxmin', String(s.minContext))
  if (s.releasedFrom) p.set('relfrom', s.releasedFrom)
  if (!s.showSubscriptions) p.set('subs', '0')
  if (s.usageFactor !== 1.0) p.set('usage', String(s.usageFactor))
  if (s.subscriptionOnly) p.set('subonly', '1')
  return p.toString()
}


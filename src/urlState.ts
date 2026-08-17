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
}

const METRICS: MetricKey[] = ['intelligenceIndex', 'agenticIndex', 'omniscience']
const COST_VIEWS: CostView[] = ['input', 'blended', 'cache', 'output', 'task']

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function parseUrl(search: string, allFamilies: string[], maxScore: number): UrlState {
  const p = new URLSearchParams(search)
  const metricRaw = p.get('metric')
  const costRaw = p.get('cost')
  const famRaw = p.get('f')
  let families: string[] | null = null
  if (famRaw) {
    const valid = famRaw.split(',').filter((f) => allFamilies.includes(f))
    families = valid.length ? valid : null
  }
  return {
    lang: p.get('lang') === 'en' ? 'en' : 'it',
    theme: p.get('theme') === 'light' ? 'light' : 'dark',
    metric: METRICS.includes(metricRaw as MetricKey) ? (metricRaw as MetricKey) : 'intelligenceIndex',
    costView: COST_VIEWS.includes(costRaw as CostView) ? (costRaw as CostView) : 'input',
    taskInput: clampInt(p.get('tin'), 1, 1_000_000, 3000),
    taskOutput: clampInt(p.get('tout'), 1, 1_000_000, 1000),
    logScale: p.get('log') !== '0',
    includeEfforts: p.get('efforts') !== '0',
    maxEffortOnly: p.get('maxeffort') === '1',
    minScore: clampInt(p.get('min'), 0, maxScore, 0),
    query: p.get('q') ?? '',
    families,
    selectedId: p.get('sel') || null,
  }
}

/** Serialize state to a query string, omitting default values so URLs stay short. */
export function toSearch(s: UrlState, allFamilies: string[]): string {
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
  if (s.minScore > 0) p.set('min', String(s.minScore))
  if (s.query) p.set('q', s.query)
  if (s.families && s.families.length > 0 && s.families.length !== allFamilies.length) {
    p.set('f', s.families.join(','))
  }
  if (s.selectedId) p.set('sel', s.selectedId)
  return p.toString()
}

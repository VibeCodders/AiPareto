import { useEffect, useMemo, useRef, useState } from 'react'
import modelsData from './data/models.json'
import metaData from './data/meta.json'
import subscriptionsData from './data/subscriptions.json'
import type { CostView, EfficiencyWeights, MetricKey, Model, Point, SubscriptionPlan, ValueScoreBase } from './types'
import { blendedCostOf, computeFrontier, computeMetric, costUnitLabel, dominates, formatAxisTick, formatDelta, formatMetric, formatParams, formatTokens, formatUsd, costOf, frontierDeltaOf, frontierUpgradeOf, priceRatiosOf, type EfficiencyOpts, type FrontierUpgrade } from './pareto'
import { isLowerBetter } from './urlState'
import { STRINGS, type Lang, type T } from './i18n'
import { DEFAULT_BUDGET, parseUrl, toSearch, type UrlState } from './urlState'
import { deletePreset, getPreset, listPresets, savePreset, type Preset } from './presets'
import { exportModelsCsv } from './csv'
import { downloadChartPng } from './chartExport'
import { useTransientFlag } from './useTransientFlag'
import { estimateModels, isCostEstimated, isEstimated, isFieldEstimated, type EstimatedModel } from './estimation'
import { bestSlugsFor, winCount } from './compare'
import ParetoChart, { type SizeBy } from './components/ParetoChart'
import ModelTable from './components/ModelTable'
import ComparePanel from './components/ComparePanel'
import TopValuePanel from './components/TopValuePanel'
import TrendChart from './components/TrendChart'
import StatCell from './components/StatCell'

const BASE_MODELS = modelsData as unknown as Model[]
const SUBSCRIPTIONS = subscriptionsData as SubscriptionPlan[]
const META = metaData as { fetchedAt: string }

const ALL_FAMILIES = [...new Set([...BASE_MODELS.map((m) => m.family), ...SUBSCRIPTIONS.map((s) => s.provider)])].sort()

type MetricLabelKey =
  | 'intel'
  | 'coding'
  | 'agentic'
  | 'tau2'
  | 'hle'
  | 'omniscience'
  | 'outputSpeed'
  | 'latency'
  | 'context'
  | 'valueScore'
  | 'speedAdjustedScore'
  | 'contextValue'
  | 'efficiencyScore'
  | 'arenaElo'
  | 'benchlmScore'

// Community/HF benchmarks offered when picking an X-axis metric. Kept out of METRICS so
// the Y-axis badge row stays focused on the main scores (they're still selectable via URL).
const COMMON_METRICS: Array<{ key: MetricKey; labelKey: keyof T }> = [
  { key: 'hfMMLU', labelKey: 'hfMMLU' },
  { key: 'hfGSM8K', labelKey: 'hfGSM8K' },
  { key: 'hfHumanEval', labelKey: 'hfHumanEval' },
  { key: 'hfARC', labelKey: 'hfARC' },
  { key: 'hfWinogrande', labelKey: 'hfWinogrande' },
  { key: 'hfHellaSwag', labelKey: 'hfHellaSwag' },
  { key: 'hfTruthfulQA', labelKey: 'hfTruthfulQA' },
  { key: 'arenaCodeElo', labelKey: 'arenaCodeElo' },
]

const METRICS: Array<{ key: MetricKey; labelKey: MetricLabelKey; higherIsBetter: boolean }> = [
  { key: 'intelligenceIndex', labelKey: 'intel', higherIsBetter: true },
  { key: 'codingIndex', labelKey: 'coding', higherIsBetter: true },
  { key: 'agenticIndex', labelKey: 'agentic', higherIsBetter: true },
  { key: 'tau2', labelKey: 'tau2', higherIsBetter: true },
  { key: 'hle', labelKey: 'hle', higherIsBetter: true },
  { key: 'omniscience', labelKey: 'omniscience', higherIsBetter: true },
  { key: 'outputSpeed', labelKey: 'outputSpeed', higherIsBetter: true },
  { key: 'latencySeconds', labelKey: 'latency', higherIsBetter: false },
  { key: 'contextTokens', labelKey: 'context', higherIsBetter: true },
  { key: 'valueScore', labelKey: 'valueScore', higherIsBetter: true },
  { key: 'speedAdjustedScore', labelKey: 'speedAdjustedScore', higherIsBetter: true },
  { key: 'contextValue', labelKey: 'contextValue', higherIsBetter: true },
  { key: 'efficiencyScore', labelKey: 'efficiencyScore', higherIsBetter: true },
  { key: 'arenaElo', labelKey: 'arenaElo', higherIsBetter: true },
  { key: 'benchlmScore', labelKey: 'benchlmScore', higherIsBetter: true },
]

const VALUE_SCORE_BASES: Array<{ key: ValueScoreBase; labelKey: 'intel' | 'coding' | 'agentic' }> = [
  { key: 'intelligenceIndex', labelKey: 'intel' },
  { key: 'codingIndex', labelKey: 'coding' },
  { key: 'agenticIndex', labelKey: 'agentic' },
]

function computeMetricMax(models: Model[], costView: CostView, taskInput: number, taskOutput: number, valueScoreBase: ValueScoreBase = 'intelligenceIndex'): Record<MetricKey, number> {
  const base = Object.fromEntries(
    METRICS.map(({ key }) => {
      const vals = models.map((m) => computeMetric(m, key, costView, taskInput, taskOutput, valueScoreBase)).filter((v): v is number => v != null)
      return [key, vals.length ? Math.ceil(Math.max(...vals)) : 1]
    }),
  ) as Record<MetricKey, number>
  // Efficiency Score is a weighted average of components each normalized to <=100, so it is always bounded by 100.
  base.efficiencyScore = 100
  return base
}

// Only used to clamp minScore while parsing the initial URL, before costView is known from state.
const STATIC_METRIC_MAX = computeMetricMax(BASE_MODELS, 'blended', 3000, 1000)
const INITIAL = parseUrl(window.location.search, ALL_FAMILIES, STATIC_METRIC_MAX)

// Preferences persist across sessions; an explicit URL parameter always wins over the saved value.
const LS_LANG = 'ai-pareto-lang'
const LS_THEME = 'ai-pareto-theme'
const urlParams = new URLSearchParams(window.location.search)
const urlHasLang = urlParams.get('lang') != null
const urlHasTheme = urlParams.get('theme') != null

const PALETTE = [
  '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#fb7185',
  '#2dd4bf', '#c084fc', '#f97316', '#4ade80', '#38bdf8', '#e879f9',
  '#a3e635', '#facc15', '#22d3ee', '#fda4af', '#93c5fd', '#86efac',
]

// Every metric we can place on an axis (Y badges + X-axis community benchmarks).
const AXIS_METRICS: Array<{ key: MetricKey; labelKey: keyof T }> = [...METRICS, ...COMMON_METRICS]

function metricLabelOf(t: T, key: MetricKey): string {
  // Resolves any MetricKey to its label without assuming it lives in METRICS — a URL could
  // select a community benchmark not shown as a Y-axis badge, which used to throw on a
  // missing entry (null-asserted lookup).
  const found = AXIS_METRICS.find((m) => m.key === key)
  return found ? t[found.labelKey] : key
}

function costViewLabelOf(t: T, key: CostView): string {
  return t[COST_VIEWS.find((v) => v.key === key)!.labelKey]
}

function xNameLabelOf(t: T, xMetric: MetricKey | null, costView: CostView, taskInput: number, taskOutput: number, kTokens: (n: number) => string): string {
  if (xMetric != null) return metricLabelOf(t, xMetric)
  if (costView === 'task') return `${t.costViewTask} (${kTokens(taskInput)} → ${kTokens(taskOutput)})`
  return costViewLabelOf(t, costView)
}

function colorFor(family: string): string {
  let h = 0
  for (const ch of family) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const COST_VIEWS: Array<{ key: CostView; labelKey: 'costViewInput' | 'costViewBlended' | 'costViewCache' | 'costViewOutput' | 'costViewTask' }> = [
  { key: 'input', labelKey: 'costViewInput' },
  { key: 'blended', labelKey: 'costViewBlended' },
  { key: 'cache', labelKey: 'costViewCache' },
  { key: 'output', labelKey: 'costViewOutput' },
  { key: 'task', labelKey: 'costViewTask' },
]

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (urlHasLang ? INITIAL.lang : (localStorage.getItem(LS_LANG) === 'en' ? 'en' : 'it')))
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (urlHasTheme ? INITIAL.theme : (localStorage.getItem(LS_THEME) === 'light' ? 'light' : 'dark')))
  const [metric, setMetric] = useState<MetricKey>(INITIAL.metric)
  const [costView, setCostView] = useState<CostView>(INITIAL.costView)
  const [taskInput, setTaskInput] = useState(INITIAL.taskInput)
  const [taskOutput, setTaskOutput] = useState(INITIAL.taskOutput)
  const [logScale, setLogScale] = useState(INITIAL.logScale)
  const [families, setFamilies] = useState<Set<string>>(() => new Set(INITIAL.families ?? ALL_FAMILIES))
  const [query, setQuery] = useState(INITIAL.query)
  const [minScore, setMinScore] = useState(INITIAL.minScore)
  const [includeEfforts, setIncludeEfforts] = useState(INITIAL.includeEfforts)
  const [maxEffortOnly, setMaxEffortOnly] = useState(INITIAL.maxEffortOnly)
  const [selectedId, setSelectedId] = useState<string | null>(INITIAL.selectedId)
  const [presets, setPresets] = useState<Preset[]>(() => listPresets())
  const [presetId, setPresetId] = useState<string | null>(() => (INITIAL.presetId && getPreset(INITIAL.presetId) ? INITIAL.presetId : null))
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [copied, triggerCopied] = useTransientFlag()
  const [reasoningOnly, setReasoningOnly] = useState(INITIAL.reasoningOnly)
  const [openWeightsOnly, setOpenWeightsOnly] = useState(INITIAL.openWeightsOnly)
  const [minPrice, setMinPrice] = useState(INITIAL.minPrice)
  const [maxPrice, setMaxPrice] = useState(INITIAL.maxPrice)
  const [compareIds, setCompareIds] = useState<string[]>(INITIAL.compareIds)
  const [minContext, setMinContext] = useState(INITIAL.minContext)
  const [releasedFrom, setReleasedFrom] = useState(INITIAL.releasedFrom)
  const [showSubscriptions, setShowSubscriptions] = useState(INITIAL.showSubscriptions)
  const [usageFactor, setUsageFactor] = useState(INITIAL.usageFactor)
  const [subscriptionOnly, setSubscriptionOnly] = useState(INITIAL.subscriptionOnly)
  const [valueScoreBase, setValueScoreBase] = useState<ValueScoreBase>(INITIAL.valueScoreBase)
  const [efficiencyWeights, setEfficiencyWeights] = useState<EfficiencyWeights>(INITIAL.efficiencyWeights)
  const [showTrend, setShowTrend] = useState(INITIAL.showTrend)
  const [paretoOnly, setParetoOnly] = useState(INITIAL.paretoOnly)
  const [maxMonthlyCost, setMaxMonthlyCost] = useState(INITIAL.maxMonthlyCost)
  const [sizeBy, setSizeBy] = useState<SizeBy>(INITIAL.sizeBy)
  const [showLabels, setShowLabels] = useState(INITIAL.showLabels)
  const [estimateMissing, setEstimateMissing] = useState(INITIAL.estimateMissing)
  const [xMetric, setXMetric] = useState<MetricKey | null>(INITIAL.xMetric)
  const [budget, setBudget] = useState<number>(INITIAL.budget)
  const chartSvgRef = useRef<SVGSVGElement | null>(null)
  const [svgReady, setSvgReady] = useState(false)
  const [pngSaved, triggerPngSaved] = useTransientFlag()

  const t = STRINGS[lang]

  // Fills missing benchmark/spec values (flagged as estimates) when the user opts in.
  const DISPLAY_BASE: Model[] = useMemo(() => (estimateMissing ? estimateModels(BASE_MODELS) : BASE_MODELS), [estimateMissing])

  // Synthesize combined Model items with subscriptions calculated dynamically based on usageFactor
  const ALL_ITEMS = useMemo(() => {
    const subModels: Model[] = SUBSCRIPTIONS.map((sub) => {
      const baseModel = DISPLAY_BASE.find((m) => m.slug === sub.modelSlug || m.id === sub.modelId) || DISPLAY_BASE[0]
      const actualTokensMonthly = sub.estimatedTokensMonthly * usageFactor
      const effectiveCostPerM = (sub.priceMonthly / actualTokensMonthly) * 1e6
      // What paying per-token for the underlying model would cost at the same estimated usage, for comparison.
      const paygoBlended = baseModel.inputPerM != null && baseModel.outputPerM != null ? 0.8 * baseModel.inputPerM + 0.2 * baseModel.outputPerM : null
      const paygoEquivalentMonthly = paygoBlended != null ? (paygoBlended * actualTokensMonthly) / 1e6 : null

      const subEstimatedMetrics = new Set<string>(
        (baseModel as Partial<EstimatedModel>).estimatedMetrics ? Array.from((baseModel as Partial<EstimatedModel>).estimatedMetrics!) : [],
      )

      // Subscriptions have flat effective token cost for input; derive output/cache
      // proportional to the base model's pricing shape (or standard multipliers).
      const { output: ratioOutput, cacheRead: ratioCacheRead, cacheWrite: ratioCacheWrite } = priceRatiosOf(baseModel)

      const subOutputPerM = Number((effectiveCostPerM * ratioOutput).toFixed(4))
      const subCacheReadPerM = Number((effectiveCostPerM * ratioCacheRead).toFixed(4))
      const subCacheWritePerM = Number((effectiveCostPerM * ratioCacheWrite).toFixed(4))

      subEstimatedMetrics.add('outputPerM')
      subEstimatedMetrics.add('cacheReadPerM')
      subEstimatedMetrics.add('cacheWritePerM')
      subEstimatedMetrics.add('inputPerM')

      return {
        ...baseModel,
        id: `sub:${sub.id}`,
        name: sub.name,
        slug: `sub:${sub.id}`,
        aaName: `${sub.name} [${sub.priceMonthly}$/mo ~${(actualTokensMonthly / 1e6).toFixed(1)}M tok]`,
        family: sub.provider,
        isSubscription: true,
        subscription: {
          ...sub,
          estimatedTokensMonthly: actualTokensMonthly,
        },
        effectiveCostPerM,
        paygoEquivalentMonthly,
        inputPerM: effectiveCostPerM,
        outputPerM: subOutputPerM,
        cacheReadPerM: subCacheReadPerM,
        cacheWritePerM: subCacheWritePerM,
        estimatedMetrics: subEstimatedMetrics,
      }
    })
    return [...DISPLAY_BASE, ...subModels]
  }, [usageFactor, DISPLAY_BASE])


  // Reactive to costView/taskInput/taskOutput/valueScoreBase since valueScore's scale depends on the chosen cost basis and benchmark.
  const METRIC_MAX = useMemo(() => computeMetricMax(ALL_ITEMS, costView, taskInput, taskOutput, valueScoreBase), [ALL_ITEMS, costView, taskInput, taskOutput, valueScoreBase])

  const efficiencyOpts = useMemo(
    () => ({ weights: efficiencyWeights, norm: { value: METRIC_MAX.valueScore, speed: METRIC_MAX.speedAdjustedScore, context: METRIC_MAX.contextValue } }),
    [efficiencyWeights, METRIC_MAX],
  )

  useEffect(() => {
    setMinScore((prev) => Math.min(prev, METRIC_MAX[metric]))
  }, [METRIC_MAX, metric])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = lang
    document.title = STRINGS[lang].title
  }, [theme, lang])

  // Mirror the current filter state into the URL so views are shareable.
  const currentState: UrlState = {
    lang,
    theme,
    metric,
    costView,
    taskInput,
    taskOutput,
    logScale,
    includeEfforts,
    maxEffortOnly,
    minScore,
    query,
    families: [...families],
    selectedId,
    presetId: null,
    reasoningOnly,
    openWeightsOnly,
    minPrice,
    maxPrice,
    compareIds,
    minContext,
    releasedFrom,
    showSubscriptions,
    usageFactor,
    subscriptionOnly,
    valueScoreBase,
    efficiencyWeights,
    showTrend,
    paretoOnly,
    maxMonthlyCost,
    sizeBy,
    showLabels,
    estimateMissing,
    xMetric,
    budget,
  }

  useEffect(() => {
    localStorage.setItem(LS_LANG, lang)
    localStorage.setItem(LS_THEME, theme)
    const url = new URL(window.location.href)
    url.search = toSearch(currentState, ALL_FAMILIES, METRIC_MAX, presetId)
    window.history.replaceState(null, '', url.toString())
  }, [lang, theme, metric, costView, taskInput, taskOutput, logScale, includeEfforts, maxEffortOnly, minScore, query, families, selectedId, presetId, reasoningOnly, openWeightsOnly, minPrice, maxPrice, compareIds, minContext, releasedFrom, showSubscriptions, usageFactor, subscriptionOnly, valueScoreBase, efficiencyWeights, showTrend, paretoOnly, maxMonthlyCost, sizeBy, showLabels, estimateMissing, xMetric, budget])

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleFamily = (f: string) => {
    setFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  const selectMetric = (key: MetricKey) => {
    if (key === 'valueScore') {
      setMinScore(0)
    } else if (isLowerBetter(key)) {
      setMinScore((prev) => (prev === 0 ? METRIC_MAX[key] : Math.min(prev, METRIC_MAX[key])))
    } else {
      setMinScore((prev) => (prev >= METRIC_MAX[key] ? 0 : Math.min(prev, METRIC_MAX[key])))
    }
    setMetric(key)
  }

  const applyState = (s: UrlState) => {
    setLang(s.lang)
    setTheme(s.theme)
    setMetric(s.metric)
    setCostView(s.costView)
    setTaskInput(s.taskInput)
    setTaskOutput(s.taskOutput)
    setLogScale(s.logScale)
    setIncludeEfforts(s.includeEfforts)
    setMaxEffortOnly(s.maxEffortOnly)
    setMinScore(s.minScore)
    setQuery(s.query)
    setFamilies(new Set(s.families?.filter((f) => ALL_FAMILIES.includes(f)) ?? ALL_FAMILIES))
    setSelectedId(s.selectedId && ALL_ITEMS.some((m) => m.slug === s.selectedId) ? s.selectedId : null)
    setReasoningOnly(s.reasoningOnly)
    setOpenWeightsOnly(s.openWeightsOnly)
    setMinPrice(s.minPrice)
    setMaxPrice(s.maxPrice)
    setCompareIds(s.compareIds.filter((id) => ALL_ITEMS.some((m) => m.slug === id)))
    setMinContext(s.minContext)
    setReleasedFrom(s.releasedFrom)
    setShowSubscriptions(s.showSubscriptions)
    setUsageFactor(s.usageFactor)
    setSubscriptionOnly(s.subscriptionOnly)
    setValueScoreBase(s.valueScoreBase)
    setEfficiencyWeights(s.efficiencyWeights)
    setShowTrend(s.showTrend)
    setParetoOnly(s.paretoOnly)
    setMaxMonthlyCost(s.maxMonthlyCost)
    setSizeBy(s.sizeBy)
    setShowLabels(s.showLabels)
    setEstimateMissing(s.estimateMissing)
    setXMetric(s.xMetric)
    setBudget(s.budget)
  }

  const handleSavePreset = () => {
    const name = presetName.trim()
    if (!name) return
    const preset = savePreset(name, currentState)
    setPresets(listPresets())
    setPresetId(preset.id)
    setSavingPreset(false)
    setPresetName('')
  }

  const handleSelectPreset = (id: string) => {
    const preset = getPreset(id)
    if (!preset) return
    applyState(preset.state)
    setPresetId(preset.id)
  }

  const handleCopyLink = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    triggerCopied()
  }

  const resetFilters = () => {
    setMetric('intelligenceIndex')
    setCostView('input')
    setTaskInput(3000)
    setTaskOutput(1000)
    setLogScale(true)
    setIncludeEfforts(true)
    setMaxEffortOnly(false)
    setMinScore(0)
    setQuery('')
    setFamilies(new Set(ALL_FAMILIES))
    setSelectedId(null)
    setReasoningOnly(false)
    setOpenWeightsOnly(false)
    setMinPrice(0)
    setMaxPrice(1000)
    setCompareIds([])
    setMinContext(0)
    setReleasedFrom('')
    setShowSubscriptions(true)
    setUsageFactor(1)
    setSubscriptionOnly(false)
    setValueScoreBase('intelligenceIndex')
    setEfficiencyWeights({ value: 1, speed: 1, context: 1 })
    setShowTrend(false)
    setParetoOnly(false)
    setMaxMonthlyCost(0)
    setSizeBy('none')
    setShowLabels(true)
    setEstimateMissing(true)
    setXMetric(null)
    setBudget(DEFAULT_BUDGET)
    setPresetId(null)
  }

  const points: Point[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const lower = isLowerBetter(metric)
    return ALL_ITEMS.filter((m) => {
      if (m.isSubscription) {
        if (!showSubscriptions) return false
        if (maxMonthlyCost > 0 && (m.subscription?.priceMonthly ?? 0) > maxMonthlyCost) return false
      } else {
        if (subscriptionOnly) return false
      }
      if (!families.has(m.family)) return false
      if (reasoningOnly && !m.isReasoning) return false
      if (openWeightsOnly && !m.openWeights) return false
      const score = computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
      if (score == null) return false
      // For lower-is-better metrics the slider caps the maximum shown value.
      if (lower ? score > minScore : score < minScore) return false
      if (maxEffortOnly && m.effort != null && m.effort !== 'max') return false
      if (!includeEfforts && m.effort != null) return false
      if (q && !`${m.aaName} ${m.name} ${m.id}`.toLowerCase().includes(q)) return false
      const price = costOf(m, costView)
      if (price == null || price <= 0) return false
      if (price < minPrice || price > maxPrice) return false
      if (minContext > 0 && (m.contextTokens == null || m.contextTokens < minContext)) return false
      if (releasedFrom && (m.released == null || m.released < releasedFrom)) return false
      return true
    })
      .map((m): Point | null => {
        // X is either the selected cost view or an arbitrary metric.
        const x = xMetric != null ? computeMetric(m, xMetric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts) : costOf(m, costView)!
        if (x == null || x <= 0 || !Number.isFinite(x)) return null
        const isXEst = xMetric != null ? isEstimated(m, xMetric, valueScoreBase) : isCostEstimated(m, costView)
        const isScoreEst = isEstimated(m, metric, valueScoreBase)
        return {
          model: m,
          x,
          score: computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)!,
          scoreEstimated: isScoreEst,
          xEstimated: isXEst,
        }
      })
      .filter((p): p is Point => p != null)
      .sort((a, b) => a.x - b.x)
  }, [ALL_ITEMS, showSubscriptions, subscriptionOnly, maxMonthlyCost, families, metric, minScore, maxEffortOnly, includeEfforts, query, costView, taskInput, taskOutput, reasoningOnly, openWeightsOnly, minPrice, maxPrice, minContext, releasedFrom, valueScoreBase, efficiencyOpts, xMetric])

  // On the X axis "better" means cheaper for cost views, but for a metric it depends on the metric.
  const xLowerIsBetter = useMemo(() => (xMetric == null ? true : isLowerBetter(xMetric)), [xMetric])
  const frontier = useMemo(() => computeFrontier(points, isLowerBetter(metric), xLowerIsBetter), [points, metric, xLowerIsBetter])
  const frontierSlugs = useMemo(() => new Set(frontier.map((p) => p.model.slug)), [frontier])
  const frontierDeltas = useMemo(() => {
    const lower = isLowerBetter(metric)
    return new Map(points.map((p) => [p.model.slug, frontierDeltaOf(p, frontier, lower, xLowerIsBetter)]))
  }, [points, frontier, metric, xLowerIsBetter])

  // How many other filtered models each point Pareto-dominates on the current two axes.
  const dominatedCounts = useMemo(() => {
    const map = new Map<string, number>()
    const lower = isLowerBetter(metric)
    for (const p of points) {
      let n = 0
      for (const q of points) {
        if (p.model.slug === q.model.slug) continue
        if (dominates(p, q, lower, xLowerIsBetter)) n++
      }
      map.set(p.model.slug, n)
    }
    return map
  }, [points, metric, xLowerIsBetter])

  const selected = useMemo(() => (selectedId ? ALL_ITEMS.find((m) => m.slug === selectedId) ?? null : null), [selectedId, ALL_ITEMS])

  // For a model behind the frontier, the cheapest frontier model with a strictly better score
  // (and how much score that step buys per % of extra cost).
  // The actual Model objects currently in the compare set (used by the model-card hint).
  const comparedModels = useMemo(
    () => compareIds.map((id) => ALL_ITEMS.find((m) => m.slug === id)).filter((m): m is Model => m != null),
    [compareIds, ALL_ITEMS],
  )

  const frontierUpgrade = useMemo(() => {
    if (!selected || frontierSlugs.has(selected.slug)) return null
    const p = points.find((q) => q.model.slug === selected.slug)
    return p ? frontierUpgradeOf(p, frontier, isLowerBetter(metric)) : null
  }, [selected, frontierSlugs, points, frontier, metric])

  // Same upgrade cost, resolved per row so the table can sort/display it too.
  const frontierUpgradeBySlug = useMemo(() => {
    const map = new Map<string, FrontierUpgrade | null>()
    for (const p of points) {
      map.set(p.model.slug, frontierSlugs.has(p.model.slug) ? null : frontierUpgradeOf(p, frontier, isLowerBetter(metric)))
    }
    return map
  }, [points, frontier, frontierSlugs, metric])

  // Frontier math above always runs against the full filtered set, regardless of paretoOnly —
  // this only narrows what's actually displayed in the chart/table/CSV afterwards.
  const displayedPoints = useMemo(() => (paretoOnly ? points.filter((p) => frontierSlugs.has(p.model.slug)) : points), [points, paretoOnly, frontierSlugs])

  const visibleModels = useMemo(() => displayedPoints.map((p) => p.model), [displayedPoints])

  const buildFilterSummary = (): string => {
    const parts: string[] = [`metric=${metric}`, `cost=${costView}`]
    if (xMetric) parts.push(`xmetric=${xMetric}`)
    if (families.size !== ALL_FAMILIES.length) parts.push(`families=${[...families].join(',')}`)
    if (showSubscriptions) parts.push(`subscriptions=on (usage=${usageFactor * 100}%)`)
    if (subscriptionOnly) parts.push('subscriptionOnly')
    if (maxMonthlyCost > 0) parts.push(`maxMonthlyCost=$${maxMonthlyCost}`)
    if (paretoOnly) parts.push('paretoOnly')
    if (estimateMissing) parts.push('estimates=on')
    if (reasoningOnly) parts.push('reasoningOnly')
    if (openWeightsOnly) parts.push('openWeightsOnly')
    if (minPrice > 0) parts.push(`minPrice=${minPrice}`)
    if (maxPrice < 1000) parts.push(`maxPrice=${maxPrice}`)
    if (minContext > 0) parts.push(`minContext=${minContext}`)
    if (releasedFrom) parts.push(`releasedFrom=${releasedFrom}`)
    if (query.trim()) parts.push(`query=${query.trim()}`)
    if (minScore > 0) parts.push(`minScore=${minScore}`)
    if (maxEffortOnly) parts.push('maxEffortOnly')
    if (!includeEfforts) parts.push('noEfforts')
    return parts.join('; ')
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>{t.title}</h1>
          <p className="subtitle">{t.subtitle}</p>
        </div>
        <div className="header-toggles">
          <div className="seg" role="group" aria-label={t.language}>
            <button className={lang === 'it' ? 'on' : ''} onClick={() => setLang('it')}>IT</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
          <div className="seg" role="group" aria-label={t.theme}>
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>🌙</button>
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>☀️</button>
          </div>
        </div>
      </header>


      <section className="controls">
        <div className="control-row">
          <div className="control-group">
            <span className="control-label">{t.metric}</span>
            <div className="badges" role="group">
              {METRICS.map((m) => (
                <button key={m.key} className={`badge ${metric === m.key ? 'on' : ''}`} onClick={() => selectMetric(m.key)}>
                  {t[m.labelKey]}
                </button>
              ))}
            </div>
            {metric === 'valueScore' && (
              <div className="task-inputs">
                <span className="control-label">{t.valueScoreBase}</span>
                <select className="usage-select" value={valueScoreBase} onChange={(e) => setValueScoreBase(e.target.value as ValueScoreBase)}>
                  {VALUE_SCORE_BASES.map((b) => (
                    <option key={b.key} value={b.key}>{t[b.labelKey]}</option>
                  ))}
                </select>
              </div>
            )}
            {metric === 'efficiencyScore' && (
              <div className="task-inputs">
                <span className="control-label">{t.efficiencyWeights}</span>
                <label>
                  {t.weightValue} <b>{efficiencyWeights.value.toFixed(2)}</b>
                  <input type="range" min={0} max={2} step={0.25} value={efficiencyWeights.value} onChange={(e) => setEfficiencyWeights((w) => ({ ...w, value: Number(e.target.value) }))} />
                </label>
                <label>
                  {t.weightSpeed} <b>{efficiencyWeights.speed.toFixed(2)}</b>
                  <input type="range" min={0} max={2} step={0.25} value={efficiencyWeights.speed} onChange={(e) => setEfficiencyWeights((w) => ({ ...w, speed: Number(e.target.value) }))} />
                </label>
                <label>
                  {t.weightContext} <b>{efficiencyWeights.context.toFixed(2)}</b>
                  <input type="range" min={0} max={2} step={0.25} value={efficiencyWeights.context} onChange={(e) => setEfficiencyWeights((w) => ({ ...w, context: Number(e.target.value) }))} />
                </label>
              </div>
            )}
          </div>
          <div className="control-group">
            <span className="control-label">{t.xAxis}</span>
            <select
              className="usage-select"
              value={xMetric ? `metric:${xMetric}` : `cost:${costView}`}
              onChange={(e) => {
                const v = e.target.value
                if (v.startsWith('cost:')) {
                  const view = v.slice(5) as CostView
                  setXMetric(null)
                  if (metric === 'valueScore') setMinScore(0)
                  setCostView(view)
                } else {
                  setXMetric(v.slice(7) as MetricKey)
                }
              }}
            >
              <optgroup label={t.xAxisCost}>
                {COST_VIEWS.map((v) => (
                  <option key={v.key} value={`cost:${v.key}`}>{t[v.labelKey]}</option>
                ))}
              </optgroup>
              <optgroup label={t.xAxisMetrics}>
                {AXIS_METRICS.map((m) => (
                  <option key={m.key} value={`metric:${m.key}`}>{t[m.labelKey]}</option>
                ))}
              </optgroup>
            </select>
            {xMetric != null && (
              <span className="legend-muted" style={{ fontSize: 11 }}>
                {t.cost}: {costViewLabelOf(t, costView)}
              </span>
            )}
            {costView === 'task' && (
              <div className="task-inputs">
                <label>
                  {t.taskIn}
                  <input type="number" min={1} max={1000000} step={100} value={taskInput} onChange={(e) => setTaskInput(Math.max(1, Number(e.target.value)))} />
                </label>
                <label>
                  {t.taskOut}
                  <input type="number" min={1} max={1000000} step={100} value={taskOutput} onChange={(e) => setTaskOutput(Math.max(1, Number(e.target.value)))} />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="control-row wrap">
          <label className="check" title={xMetric ? t.logScaleOnlyCost : undefined}>
            <input type="checkbox" checked={logScale} disabled={xMetric != null} onChange={(e) => setLogScale(e.target.checked)} />
            {t.logScale}
          </label>
          <label className="check">
            <input type="checkbox" checked={includeEfforts} onChange={(e) => setIncludeEfforts(e.target.checked)} />
            {t.includeEfforts}
          </label>
          <label className="check">
            <input type="checkbox" checked={maxEffortOnly} onChange={(e) => setMaxEffortOnly(e.target.checked)} />
            {t.maxEffortOnly}
          </label>
          <label className="check">
            <input type="checkbox" checked={reasoningOnly} onChange={(e) => setReasoningOnly(e.target.checked)} />
            {t.reasoningOnly}
          </label>
          <label className="check">
            <input type="checkbox" checked={openWeightsOnly} onChange={(e) => setOpenWeightsOnly(e.target.checked)} />
            {t.openWeightsOnly}
          </label>
          <label className="check" title={t.estimatedHint}>
            <input type="checkbox" checked={estimateMissing} onChange={(e) => setEstimateMissing(e.target.checked)} />
            {t.estimateMissing}
          </label>
          <label className="check">
            <input type="checkbox" checked={paretoOnly} onChange={(e) => setParetoOnly(e.target.checked)} />
            {t.paretoOnly}
          </label>
          <label className="range">
            {isLowerBetter(metric) ? t.maxLatency : t.minScore}: <b>{minScore}</b>
            <input type="range" min={0} max={Math.max(METRIC_MAX[metric], 1)} step={1} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </label>
          <input className="search" type="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="control-row wrap">
          <label className="check">
            <input type="checkbox" checked={showSubscriptions} onChange={(e) => setShowSubscriptions(e.target.checked)} />
            <b>{t.showSubscriptions}</b>
          </label>
          <label className="check">
            <input type="checkbox" checked={subscriptionOnly} onChange={(e) => setSubscriptionOnly(e.target.checked)} />
            {t.subscriptionOnly}
          </label>
          <div className="control-group">
            <span className="control-label">{t.subscriptionUsage}</span>
            <select
              className="usage-select"
              value={usageFactor}
              onChange={(e) => setUsageFactor(Number(e.target.value))}
            >
              <option value={1.0}>{t.usageFull}</option>
              <option value={0.5}>{t.usageHeavy}</option>
              <option value={0.25}>{t.usageLight}</option>
            </select>
          </div>
          <label className="task-inputs">
            {t.maxMonthlyCost}
            <input
              type="number"
              min={0}
              step={5}
              value={maxMonthlyCost || ''}
              placeholder="∞"
              onChange={(e) => setMaxMonthlyCost(Math.max(0, Number(e.target.value)))}
              title={t.maxMonthlyCost}
            />
            {maxMonthlyCost > 0 && <button className="btn" onClick={() => setMaxMonthlyCost(0)}>✕</button>}
          </label>
        </div>

        <div className="control-row wrap">
          <label className="task-inputs">
            {t.priceRange}
            <input type="number" min={0} step={0.1} value={minPrice} onChange={(e) => setMinPrice(Math.max(0, Number(e.target.value)))} title={t.minPrice} />
            {' – '}
            <input type="number" min={0} step={0.1} value={maxPrice} onChange={(e) => setMaxPrice(Math.max(0, Number(e.target.value)))} title={t.maxPrice} />
          </label>
          <label className="task-inputs">
            {t.minContext}
            <input type="number" min={0} step={1000} value={minContext} onChange={(e) => setMinContext(Math.max(0, Number(e.target.value)))} />
          </label>
          <label className="task-inputs">
            {t.releasedFrom}
            <input type="date" value={releasedFrom} onChange={(e) => setReleasedFrom(e.target.value)} />
            {releasedFrom && <button className="btn" onClick={() => setReleasedFrom('')}>✕</button>}
          </label>
        </div>

        <div className="control-row wrap">
          <div className="control-group">
            <span className="control-label">{t.pointSize}</span>
            <div className="badges" role="group" aria-label={t.pointSize}>
              <button className={`badge ${sizeBy === 'none' ? 'on' : ''}`} onClick={() => setSizeBy('none')}>{t.sizeNone}</button>
              <button className={`badge ${sizeBy === 'context' ? 'on' : ''}`} onClick={() => setSizeBy('context')}>{t.sizeContext}</button>
              <button className={`badge ${sizeBy === 'speed' ? 'on' : ''}`} onClick={() => setSizeBy('speed')}>{t.sizeSpeed}</button>
              <button className={`badge ${sizeBy === 'downloads' ? 'on' : ''}`} onClick={() => setSizeBy('downloads')}>{t.sizeDownload}</button>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            {t.frontierLabels}
          </label>
        </div>


        <div className="control-row wrap family-row">
          <span className="control-label">{t.family}</span>
          {ALL_FAMILIES.map((f) => (
            <button key={f} className={`chip ${families.has(f) ? 'on' : ''}`} style={families.has(f) ? { borderColor: colorFor(f) } : undefined} onClick={() => toggleFamily(f)}>
              <span className="chip-dot" style={{ background: colorFor(f) }} />
              {f}
            </button>
          ))}
          <button className="chip subtle" onClick={() => setFamilies(new Set(ALL_FAMILIES))}>{t.all}</button>
          <button className="chip subtle" onClick={() => setFamilies(new Set())}>{t.none}</button>
        </div>

        <div className="control-row wrap preset-row">
          <span className="control-label">{t.presets}</span>
          <select
            className="preset-select"
            value={presetId ?? ''}
            onChange={(e) => (e.target.value ? handleSelectPreset(e.target.value) : setPresetId(null))}
          >
            <option value="">{t.noPreset}</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {savingPreset ? (
            <>
              <input
                className="preset-name"
                type="text"
                autoFocus
                placeholder={t.presetNamePlaceholder}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSavePreset()
                  if (e.key === 'Escape') setSavingPreset(false)
                }}
              />
              <button className="btn" onClick={handleSavePreset}>{t.confirm}</button>
              <button className="btn" onClick={() => setSavingPreset(false)}>{t.cancel}</button>
            </>
          ) : (
            <button className="btn" onClick={() => setSavingPreset(true)}>＋ {t.savePreset}</button>
          )}
          <button className="btn" onClick={handleCopyLink} title={window.location.href}>
            {copied ? `✓ ${t.copied}` : `🔗 ${t.copyLink}`}
          </button>
          <button className="btn" onClick={resetFilters} title={t.resetFilters}>
            ↺ {t.resetFilters}
          </button>
          {presetId && (
            <button className="btn btn-danger" onClick={() => { deletePreset(presetId); setPresets(listPresets()); setPresetId(null) }}>
              🗑 {t.deletePreset}
            </button>
          )}
        </div>
      </section>

      <section className="chart-section">
        {displayedPoints.length === 0 ? (
          <div className="empty-state">{t.noResults}</div>
        ) : (
          <ParetoChart
            points={displayedPoints}
            frontier={frontier}
            frontierSlugs={frontierSlugs}
            logScale={logScale}
            colorFor={colorFor}
            metricName={metricLabelOf(t, metric)}
            xName={xNameLabelOf(t, xMetric, costView, taskInput, taskOutput, kTokens)}
            xUnit={xMetric ? '' : costUnitLabel(costView)}
            xIsMetric={xMetric != null}
            formatScore={(v: number) => formatMetric(metric, v)}
            formatTick={(v: number) => formatAxisTick(metric, v)}
            t={t}
            onSelect={(id) => setSelectedId(id)}
            sizeBy={sizeBy}
            showLabels={showLabels}
            highlightedSlugs={new Set([...(selectedId ? [selectedId] : []), ...compareIds])}
            estimatedSlugs={new Set(displayedPoints.filter((p) => p.scoreEstimated || p.xEstimated).map((p) => p.model.slug))}
            estimatesActive={estimateMissing}
            onSvgReady={(svg) => { chartSvgRef.current = svg; setSvgReady(Boolean(svg)) }}
          />
        )}
        <div className="count-bar muted">
          {displayedPoints.length} {t.modelsShown} {t.ofTotal} {ALL_ITEMS.length} · {t.clickHint} · {t.zoomHint}
          <button className="btn" onClick={() => setShowTrend((v) => !v)} style={{ marginLeft: 12 }}>
            {showTrend ? `▲ ${t.hideTrend}` : `▼ ${t.showTrend}`}
          </button>
          <button
            className="btn"
            style={{ marginLeft: 8 }}
            disabled={!svgReady}
            title={t.downloadPng}
            onClick={async () => {
              if (!chartSvgRef.current) return
              await downloadChartPng(chartSvgRef.current, `ai-pareto-${metric}-${costView}-${new Date().toISOString().slice(0, 10)}.png`)
              triggerPngSaved()
            }}
          >
            {pngSaved ? `✓ ${t.pngSaved}` : `⬇ ${t.downloadPng}`}
          </button>
        </div>
        {showTrend && <TrendChart models={BASE_MODELS} metric={metric} metricName={metricLabelOf(t, metric)} costView={costView} taskInput={taskInput} taskOutput={taskOutput} valueScoreBase={valueScoreBase} efficiencyOpts={efficiencyOpts} t={t} />}
      </section>

      <TopValuePanel
        items={ALL_ITEMS}
        metric={metric}
        costView={costView}
        taskInput={taskInput}
        taskOutput={taskOutput}
        valueScoreBase={valueScoreBase}
        efficiencyOpts={efficiencyOpts}
        t={t}
        onSelect={setSelectedId}
        budget={budget}
        onBudgetChange={setBudget}
      />

      {selected && (
        <ModelCard
          model={selected}
          metric={metric}
          frontier={frontierSlugs.has(selected.slug)}
          frontierDelta={frontierDeltas.get(selected.slug) ?? null}
          dominatedCount={dominatedCounts.get(selected.slug) ?? 0}
          costView={costView}
          taskInput={taskInput}
          taskOutput={taskOutput}
          valueScoreBase={valueScoreBase}
          efficiencyOpts={efficiencyOpts}
          t={t}
          inCompare={compareIds.includes(selected.slug)}
          frontierUpgrade={frontierUpgrade}
          comparedModels={comparedModels}
          onToggleCompare={() => toggleCompare(selected.slug)}
        />
      )}

      <ComparePanel models={ALL_ITEMS} compareIds={compareIds} costView={costView} taskInput={taskInput} taskOutput={taskOutput} valueScoreBase={valueScoreBase} efficiencyOpts={efficiencyOpts} t={t} onRemove={toggleCompare} onClear={() => setCompareIds([])} onExport={() => exportModelsCsv(ALL_ITEMS.filter((m: Model) => compareIds.includes(m.slug)), costView, taskInput, taskOutput, t, buildFilterSummary(), '-compare')} />


      <section className="table-section">
        <div className="table-head">
          <h2>{t.table}</h2>
          <button className="csv-btn" style={{ marginRight: 8 }} onClick={() => exportModelsCsv(frontier.map((p) => p.model), costView, taskInput, taskOutput, t, buildFilterSummary(), '-frontier')} title={t.exportFrontierCsv}>
            ⬇ {t.exportFrontierCsv}
          </button>
          <button className="csv-btn" onClick={() => exportModelsCsv(visibleModels, costView, taskInput, taskOutput, t, buildFilterSummary())}>
            ⬇ {t.exportCsv}
          </button>
        </div>
        {visibleModels.length === 0 ? (
          <div className="empty-state">{t.noResults}</div>
        ) : (
          <ModelTable
            models={visibleModels}
            metric={metric}
            frontierIds={frontierSlugs}
            frontierDeltas={frontierDeltas}
            selectedId={selectedId}
            costView={costView}
            taskInput={taskInput}
            taskOutput={taskOutput}
            valueScoreBase={valueScoreBase}
            efficiencyOpts={efficiencyOpts}
            t={t}
            onSelect={setSelectedId}
            compareIds={compareIds}
            onToggleCompare={toggleCompare}
            dominatedCounts={dominatedCounts}
            frontierUpgradeBySlug={frontierUpgradeBySlug}
          />
        )}
      </section>

      <footer className="footer muted">
        {t.fetchedAt}: {new Date(META.fetchedAt).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB')} · © Artificial Analysis (Intelligence Index) · OpenRouter (pricing)
      </footer>
    </div>
  )
}

function kTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n)
}

function ModelCard({
  model,
  metric,
  frontier,
  frontierDelta,
  frontierUpgrade,
  dominatedCount,
  costView,
  taskInput,
  taskOutput,
  valueScoreBase,
  efficiencyOpts,
  t,
  inCompare,
  onToggleCompare,
  comparedModels,
}: {
  model: Model
  metric: MetricKey
  frontier: boolean
  frontierDelta: number | null
  frontierUpgrade: FrontierUpgrade | null
  dominatedCount: number
  costView: CostView
  taskInput: number
  taskOutput: number
  valueScoreBase: ValueScoreBase
  efficiencyOpts: EfficiencyOpts
  t: T
  inCompare: boolean
  onToggleCompare: () => void
  comparedModels: Model[]
}) {
  const score = computeMetric(model, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
  const scoreEstimated = isEstimated(model, metric, valueScoreBase)
  const blended = blendedCostOf(model)

  const estInput = isFieldEstimated(model, 'inputPerM')
  const estOutput = isFieldEstimated(model, 'outputPerM')
  const estCache = isFieldEstimated(model, 'cacheReadPerM')
  const estCacheWrite = isFieldEstimated(model, 'cacheWritePerM')
  const estBlended = isCostEstimated(model, 'blended')
  const estSpeed = isFieldEstimated(model, 'outputSpeed')
  const estLatency = isFieldEstimated(model, 'latencySeconds')
  const estContext = isFieldEstimated(model, 'contextTokens')
  const estParameters = isFieldEstimated(model, 'parameters')
  const estActiveParameters = isFieldEstimated(model, 'activeParameters')
  const hasAnyEstimate = (model as { estimatedMetrics?: Set<string> }).estimatedMetrics?.size ?? 0

  // Subscriptions are synthesized items (id = "sub:…") that don't exist on OpenRouter/AA —
  // link to the underlying plan's model instead.
  // Whether this model holds the best value for the current metric among the compared set
  // (reuses the same best-value-per-row logic as the compare panel).
  const isBestAmongCompared = useMemo(() => {
    if (comparedModels.length === 0) return false
    const value = (m: Model) => computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
    return bestSlugsFor(comparedModels, !isLowerBetter(metric), value).includes(model.slug)
  }, [comparedModels, metric, model.slug, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts])

  // How many benchmark/derived rows this model is the best at among the compared set.
  const comparedWins = useMemo(() => {
    if (comparedModels.length === 0) return null
    const derived = (k: MetricKey) => (m: Model) => computeMetric(m, k, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
    const rows: Array<{ higherIsBetter: boolean; value: (m: Model) => number | null }> = [
      { higherIsBetter: true, value: (m) => m.intelligenceIndex },
      { higherIsBetter: true, value: (m) => m.codingIndex },
      { higherIsBetter: true, value: (m) => m.agenticIndex },
      { higherIsBetter: true, value: (m) => m.tau2 },
      { higherIsBetter: true, value: (m) => m.hle },
      { higherIsBetter: true, value: (m) => m.omniscience },
      { higherIsBetter: false, value: (m) => m.latencySeconds },
      { higherIsBetter: true, value: derived('valueScore') },
      { higherIsBetter: true, value: derived('speedAdjustedScore') },
      { higherIsBetter: true, value: derived('contextValue') },
      { higherIsBetter: true, value: derived('efficiencyScore') },
      { higherIsBetter: true, value: (m) => m.hfMMLU },
      { higherIsBetter: true, value: (m) => m.arenaElo },
      { higherIsBetter: true, value: (m) => m.arenaCodeElo },
      { higherIsBetter: true, value: (m) => m.benchlmScore },
    ]
    return { wins: winCount(model, comparedModels, rows), total: rows.length }
  }, [model, comparedModels, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts])

  const orId = model.isSubscription ? model.subscription?.modelId : model.id
  const aaSlug = model.isSubscription ? model.subscription?.modelSlug : model.slug
  return (
    <section className="model-card">
      <div className="mc-head">
        <h2>{model.aaName}</h2>
        <div className="mc-tags">
          {frontier && <span className="tag tag-frontier">{t.frontier}</span>}
          {model.effort && <span className="tag">{model.effort}</span>}
          {model.isReasoning && <span className="tag">reasoning</span>}
          {model.openWeights && <span className="tag tag-open">open weights</span>}
          {isBestAmongCompared && <span className="tag tag-open" title={t.bestInCompareTitle}>★ {t.bestInCompare}: {metricLabelOf(t, metric)}</span>}
          {comparedWins && <span className="tag" title={t.bestInCompareTitle}>🏅 {comparedWins.wins}/{comparedWins.total} {t.winsAmong}</span>}
          {hasAnyEstimate > 0 && <span className="tag tag-est">≈ {t.estimated}</span>}
          <button className={`btn compare-toggle ${inCompare ? 'on' : ''}`} onClick={onToggleCompare}>
            {inCompare ? `✓ ${t.removeFromCompare}` : `+ ${t.addToCompare}`}
          </button>
        </div>
      </div>
      <div className="mc-grid">
        <StatCell label={t.family} value={model.family} />
        <StatCell label={metricLabelOf(t, metric)} estimated={scoreEstimated} title={t.estimated} value={formatMetric(metric, score)} />
        <div><span className="muted">{t.vsFrontier}</span><b className={frontierDelta != null && frontierDelta > 0.05 ? 'delta-behind' : 'delta-ok'}>{formatDelta(frontierDelta)}</b></div>
        {/* How much % the cost changes to reach the first frontier model with a strictly better score. */}
        <div>
          <span className="muted">{t.frontierCostGap}</span>
          <b title={frontierUpgrade ? `${frontierUpgrade.model.aaName} · +${formatMetric(metric, frontierUpgrade.scoreGain)} ${metricLabelOf(t, metric)}` : undefined}>
            {frontierUpgrade ? `${frontierUpgrade.costDeltaPct >= 0 ? '+' : '−'}${Math.round(Math.abs(frontierUpgrade.costDeltaPct))}% ${t.cost}` : '—'}
          </b>
        </div>
        <div><span className="muted">{t.dominates}</span><b title={t.dominatesHint}>{dominatedCount}</b></div>
        <StatCell label={t.input} estimated={estInput} title={t.estimated} value={<>{formatUsd(model.inputPerM)}/1M</>} />
        <StatCell label={t.output} estimated={estOutput} title={t.estimated} value={<>{formatUsd(model.outputPerM)}/1M</>} />
        <StatCell label={t.cache} estimated={estCache} title={t.estimated} value={<>{formatUsd(model.cacheReadPerM)}/1M</>} />
        <StatCell label={t.cacheWrite} estimated={estCacheWrite} title={t.estimated} value={<>{formatUsd(model.cacheWritePerM)}/1M</>} />
        <StatCell label={t.blended} estimated={estBlended} title={t.estimated} value={<>{formatUsd(blended)}/1M</>} />
        <StatCell label={t.outputSpeed} estimated={estSpeed} title={t.estimated} value={formatMetric('outputSpeed', model.outputSpeed)} />
        <StatCell label={t.latency} estimated={estLatency} title={t.estimated} value={formatMetric('latencySeconds', model.latencySeconds)} />
        <StatCell label={t.context} estimated={estContext} title={t.estimated} value={formatTokens(model.contextTokens)} />
        <StatCell label={t.parameters} estimated={estParameters} title={t.estimated} value={formatParams(model.parameters)} />
        <StatCell label={t.activeParameters} estimated={estActiveParameters} title={t.estimated} value={formatParams(model.activeParameters)} />
        <StatCell label={t.release} value={model.released ?? '—'} />
      </div>
      {frontierUpgrade && (
        <div className="mc-upgrade">
          <span className="tag tag-open">{t.frontierUpgrade}</span>{' '}
          {frontierUpgrade.model.aaName}{' '}
          <b>
            {isLowerBetter(metric) ? '−' : '+'}{formatMetric(metric, frontierUpgrade.scoreGain)} {metricLabelOf(t, metric)}
            · {Math.round(frontierUpgrade.costDeltaPct)}% {t.cost}
          </b>
        </div>
      )}
      {model.isSubscription && model.subscription && (
        <div className="mc-subscription">
          {model.paygoEquivalentMonthly != null && (
            <div className="mc-paygo">
              <span className="muted">{t.paygoEquivalent}:</span>{' '}
              <b>{formatUsd(model.paygoEquivalentMonthly)}/mo</b>{' '}
              {model.paygoEquivalentMonthly < model.subscription.priceMonthly ? (
                <span className="tag tag-open">{formatUsd(model.subscription.priceMonthly - model.paygoEquivalentMonthly)} {t.paygoCheaper}</span>
              ) : (
                <span className="tag">{formatUsd(model.paygoEquivalentMonthly - model.subscription.priceMonthly)} {t.paygoPricier}</span>
              )}
            </div>
          )}
          {model.subscription.methodology && (
            <div className="mc-methodology muted">
              <span className="muted">{t.methodology}:</span> {model.subscription.methodology}
            </div>
          )}
        </div>
      )}
      <div className="mc-links">
        <a href={`https://openrouter.ai/${orId}`} target="_blank" rel="noreferrer">{t.openRouterLink} ↗</a>
        <a href={`https://artificialanalysis.ai/models/${aaSlug}`} target="_blank" rel="noreferrer">{t.aaLink} ↗</a>
      </div>
    </section>
  )
}

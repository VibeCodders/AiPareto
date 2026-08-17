import { useEffect, useMemo, useState } from 'react'
import modelsData from './data/models.json'
import metaData from './data/meta.json'
import subscriptionsData from './data/subscriptions.json'
import type { CostView, EfficiencyWeights, MetricKey, Model, Point, SubscriptionPlan, ValueScoreBase } from './types'
import { computeFrontier, computeMetric, formatAxisTick, formatDelta, formatMetric, formatTokens, formatUsd, costOf, frontierDeltaOf, type EfficiencyOpts } from './pareto'
import { isLowerBetter } from './urlState'
import { STRINGS, type Lang, type T } from './i18n'
import { parseUrl, toSearch, type UrlState } from './urlState'
import { deletePreset, getPreset, listPresets, savePreset, type Preset } from './presets'
import { exportModelsCsv } from './csv'
import ParetoChart from './components/ParetoChart'
import ModelTable from './components/ModelTable'
import ComparePanel from './components/ComparePanel'
import TrendChart from './components/TrendChart'

const BASE_MODELS = modelsData as Model[]
const SUBSCRIPTIONS = subscriptionsData as SubscriptionPlan[]
const META = metaData as { fetchedAt: string }

const ALL_FAMILIES = [...new Set([...BASE_MODELS.map((m) => m.family), ...SUBSCRIPTIONS.map((s) => s.provider)])].sort()

const METRIC_DEFS = [
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
] as const

const VALUE_SCORE_BASES: Array<{ key: ValueScoreBase; labelKey: 'intel' | 'coding' | 'agentic' }> = [
  { key: 'intelligenceIndex', labelKey: 'intel' },
  { key: 'codingIndex', labelKey: 'coding' },
  { key: 'agenticIndex', labelKey: 'agentic' },
]

function computeMetricMax(models: Model[], costView: CostView, taskInput: number, taskOutput: number, valueScoreBase: ValueScoreBase = 'intelligenceIndex'): Record<MetricKey, number> {
  const base = Object.fromEntries(
    METRIC_DEFS.map(({ key }) => {
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

const PALETTE = [
  '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#fb7185',
  '#2dd4bf', '#c084fc', '#f97316', '#4ade80', '#38bdf8', '#e879f9',
  '#a3e635', '#facc15', '#22d3ee', '#fda4af', '#93c5fd', '#86efac',
]

function colorFor(family: string): string {
  let h = 0
  for (const ch of family) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const METRICS: Array<{
  key: MetricKey
  labelKey: 'intel' | 'coding' | 'agentic' | 'tau2' | 'hle' | 'omniscience' | 'outputSpeed' | 'latency' | 'context' | 'valueScore' | 'speedAdjustedScore' | 'contextValue' | 'efficiencyScore'
  higherIsBetter: boolean
}> = METRIC_DEFS.map((d) => ({ key: d.key, labelKey: d.labelKey as never, higherIsBetter: d.higherIsBetter }))

const COST_VIEWS: Array<{ key: CostView; labelKey: 'costViewInput' | 'costViewBlended' | 'costViewCache' | 'costViewOutput' | 'costViewTask' }> = [
  { key: 'input', labelKey: 'costViewInput' },
  { key: 'blended', labelKey: 'costViewBlended' },
  { key: 'cache', labelKey: 'costViewCache' },
  { key: 'output', labelKey: 'costViewOutput' },
  { key: 'task', labelKey: 'costViewTask' },
]

export default function App() {
  const [lang, setLang] = useState<Lang>(INITIAL.lang)
  const [theme, setTheme] = useState<'dark' | 'light'>(INITIAL.theme)
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
  const [copied, setCopied] = useState(false)
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

  const t = STRINGS[lang]

  // Synthesize combined Model items with subscriptions calculated dynamically based on usageFactor
  const ALL_ITEMS = useMemo(() => {
    const subModels: Model[] = SUBSCRIPTIONS.map((sub) => {
      const baseModel = BASE_MODELS.find((m) => m.slug === sub.modelSlug || m.id === sub.modelId) || BASE_MODELS[0]
      const actualTokensMonthly = sub.estimatedTokensMonthly * usageFactor
      const effectiveCostPerM = (sub.priceMonthly / actualTokensMonthly) * 1e6
      // What paying per-token for the underlying model would cost at the same estimated usage, for comparison.
      const paygoBlended = baseModel.inputPerM != null && baseModel.outputPerM != null ? 0.8 * baseModel.inputPerM + 0.2 * baseModel.outputPerM : null
      const paygoEquivalentMonthly = paygoBlended != null ? (paygoBlended * actualTokensMonthly) / 1e6 : null
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
        outputPerM: null,
        cacheReadPerM: null,
        cacheWritePerM: null,
      }
    })
    return [...BASE_MODELS, ...subModels]
  }, [usageFactor])

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
  }

  useEffect(() => {
    const url = new URL(window.location.href)
    url.search = toSearch(currentState, ALL_FAMILIES, METRIC_MAX, presetId)
    window.history.replaceState(null, '', url.toString())
  }, [lang, theme, metric, costView, taskInput, taskOutput, logScale, includeEfforts, maxEffortOnly, minScore, query, families, selectedId, presetId, reasoningOnly, openWeightsOnly, minPrice, maxPrice, compareIds, minContext, releasedFrom, showSubscriptions, usageFactor, subscriptionOnly, valueScoreBase, efficiencyWeights, showTrend, paretoOnly, maxMonthlyCost])

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selectCostView = (view: CostView) => {
    if (metric === 'valueScore') setMinScore(0)
    setCostView(view)
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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
      const cost = costOf(m, costView)
      if (cost == null || cost <= 0) return false
      if (cost < minPrice || cost > maxPrice) return false
      if (minContext > 0 && (m.contextTokens == null || m.contextTokens < minContext)) return false
      if (releasedFrom && (m.released == null || m.released < releasedFrom)) return false
      return true
    })
      .map((m) => ({
        model: m,
        cost: costOf(m, costView)!,
        score: computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)!,
      }))
      .sort((a, b) => a.cost - b.cost)
  }, [ALL_ITEMS, showSubscriptions, subscriptionOnly, maxMonthlyCost, families, metric, minScore, maxEffortOnly, includeEfforts, query, costView, taskInput, taskOutput, reasoningOnly, openWeightsOnly, minPrice, maxPrice, minContext, releasedFrom, valueScoreBase, efficiencyOpts])

  const frontier = useMemo(() => computeFrontier(points, isLowerBetter(metric)), [points, metric])
  const frontierSlugs = useMemo(() => new Set(frontier.map((p) => p.model.slug)), [frontier])
  const frontierDeltas = useMemo(() => {
    const lower = isLowerBetter(metric)
    return new Map(points.map((p) => [p.model.slug, frontierDeltaOf(p, frontier, lower)]))
  }, [points, frontier, metric])

  const selected = useMemo(() => (selectedId ? ALL_ITEMS.find((m) => m.slug === selectedId) ?? null : null), [selectedId, ALL_ITEMS])

  // Frontier math above always runs against the full filtered set, regardless of paretoOnly —
  // this only narrows what's actually displayed in the chart/table/CSV afterwards.
  const displayedPoints = useMemo(() => (paretoOnly ? points.filter((p) => frontierSlugs.has(p.model.slug)) : points), [points, paretoOnly, frontierSlugs])

  const visibleModels = useMemo(() => displayedPoints.map((p) => p.model), [displayedPoints])

  const buildFilterSummary = (): string => {
    const parts: string[] = [`metric=${metric}`, `cost=${costView}`]
    if (families.size !== ALL_FAMILIES.length) parts.push(`families=${[...families].join(',')}`)
    if (showSubscriptions) parts.push(`subscriptions=on (usage=${usageFactor * 100}%)`)
    if (subscriptionOnly) parts.push('subscriptionOnly')
    if (maxMonthlyCost > 0) parts.push(`maxMonthlyCost=$${maxMonthlyCost}`)
    if (paretoOnly) parts.push('paretoOnly')
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
            <span className="control-label">{t.cost}</span>
            <div className="badges" role="group">
              {COST_VIEWS.map((v) => (
                <button key={v.key} className={`badge ${costView === v.key ? 'on' : ''}`} onClick={() => selectCostView(v.key)}>
                  {t[v.labelKey]}
                </button>
              ))}
            </div>
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
          <label className="check">
            <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
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
          {presetId && (
            <button className="btn btn-danger" onClick={() => { deletePreset(presetId); setPresets(listPresets()); setPresetId(null) }}>
              🗑 {t.deletePreset}
            </button>
          )}
        </div>
      </section>

      <section className="chart-section">
        <ParetoChart
          points={displayedPoints}
          frontier={frontier}
          frontierSlugs={frontierSlugs}
          logScale={logScale}
          colorFor={colorFor}
          metricName={t[METRICS.find((m) => m.key === metric)!.labelKey]}
          costName={costView === 'task' ? `${t.costViewTask} (${kTokens(taskInput)} → ${kTokens(taskOutput)})` : t[COST_VIEWS.find((v) => v.key === costView)!.labelKey]}
          costUnit={costView === 'task' ? '/task' : '/1M'}
          formatScore={(v: number) => formatMetric(metric, v)}
          formatTick={(v: number) => formatAxisTick(metric, v)}
          t={t}
          onSelect={(id) => setSelectedId(id)}
        />
        <div className="count-bar muted">
          {displayedPoints.length} {t.modelsShown} {t.ofTotal} {ALL_ITEMS.length} · {t.clickHint}
          <button className="btn" onClick={() => setShowTrend((v) => !v)} style={{ marginLeft: 12 }}>
            {showTrend ? `▲ ${t.hideTrend}` : `▼ ${t.showTrend}`}
          </button>
        </div>
        {showTrend && <TrendChart models={BASE_MODELS} costView={costView} taskInput={taskInput} taskOutput={taskOutput} valueScoreBase={valueScoreBase} t={t} />}
      </section>

      {selected && (
        <ModelCard
          model={selected}
          metric={metric}
          frontier={frontierSlugs.has(selected.slug)}
          frontierDelta={frontierDeltas.get(selected.slug) ?? null}
          costView={costView}
          taskInput={taskInput}
          taskOutput={taskOutput}
          valueScoreBase={valueScoreBase}
          efficiencyOpts={efficiencyOpts}
          t={t}
          inCompare={compareIds.includes(selected.slug)}
          onToggleCompare={() => toggleCompare(selected.slug)}
        />
      )}

      <ComparePanel models={ALL_ITEMS} compareIds={compareIds} costView={costView} taskInput={taskInput} taskOutput={taskOutput} valueScoreBase={valueScoreBase} efficiencyOpts={efficiencyOpts} t={t} onRemove={toggleCompare} onClear={() => setCompareIds([])} onExport={() => exportModelsCsv(ALL_ITEMS.filter((m: Model) => compareIds.includes(m.slug)), costView, taskInput, taskOutput, t, buildFilterSummary(), '-compare')} />


      <section className="table-section">
        <div className="table-head">
          <h2>{t.table}</h2>
          <button className="csv-btn" onClick={() => exportModelsCsv(visibleModels, costView, taskInput, taskOutput, t, buildFilterSummary())}>
            ⬇ {t.exportCsv}
          </button>
        </div>
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
        />
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
  costView,
  taskInput,
  taskOutput,
  valueScoreBase,
  efficiencyOpts,
  t,
  inCompare,
  onToggleCompare,
}: {
  model: Model
  metric: MetricKey
  frontier: boolean
  frontierDelta: number | null
  costView: CostView
  taskInput: number
  taskOutput: number
  valueScoreBase: ValueScoreBase
  efficiencyOpts: EfficiencyOpts
  t: T
  inCompare: boolean
  onToggleCompare: () => void
}) {
  const score = computeMetric(model, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
  const blended =
    model.inputPerM != null && model.outputPerM != null ? 0.8 * model.inputPerM + 0.2 * model.outputPerM : null
  return (
    <section className="model-card">
      <div className="mc-head">
        <h2>{model.aaName}</h2>
        <div className="mc-tags">
          {frontier && <span className="tag tag-frontier">{t.frontier}</span>}
          {model.effort && <span className="tag">{model.effort}</span>}
          {model.isReasoning && <span className="tag">reasoning</span>}
          {model.openWeights && <span className="tag tag-open">open weights</span>}
          <button className={`btn compare-toggle ${inCompare ? 'on' : ''}`} onClick={onToggleCompare}>
            {inCompare ? `✓ ${t.removeFromCompare}` : `+ ${t.addToCompare}`}
          </button>
        </div>
      </div>
      <div className="mc-grid">
        <div><span className="muted">{t.family}</span><b>{model.family}</b></div>
        <div><span className="muted">{t[METRICS.find((m) => m.key === metric)!.labelKey]}</span><b>{formatMetric(metric, score)}</b></div>
        <div><span className="muted">{t.vsFrontier}</span><b className={frontierDelta != null && frontierDelta > 0.05 ? 'delta-behind' : 'delta-ok'}>{formatDelta(frontierDelta)}</b></div>
        <div><span className="muted">{t.input}</span><b>{formatUsd(model.inputPerM)}/1M</b></div>
        <div><span className="muted">{t.output}</span><b>{formatUsd(model.outputPerM)}/1M</b></div>
        <div><span className="muted">{t.cache}</span><b>{formatUsd(model.cacheReadPerM)}/1M</b></div>
        <div><span className="muted">{t.blended}</span><b>{formatUsd(blended)}/1M</b></div>
        <div><span className="muted">{t.outputSpeed}</span><b>{formatMetric('outputSpeed', model.outputSpeed)}</b></div>
        <div><span className="muted">{t.latency}</span><b>{formatMetric('latencySeconds', model.latencySeconds)}</b></div>
        <div><span className="muted">{t.context}</span><b>{formatTokens(model.contextTokens)}</b></div>
        <div><span className="muted">{t.release}</span><b>{model.released ?? '—'}</b></div>
      </div>
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
        <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">{t.openRouterLink} ↗</a>
        <a href={`https://artificialanalysis.ai/models/${model.slug}`} target="_blank" rel="noreferrer">{t.aaLink} ↗</a>
      </div>
    </section>
  )
}


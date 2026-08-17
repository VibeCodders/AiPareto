import { useEffect, useMemo, useState } from 'react'
import modelsData from './data/models.json'
import metaData from './data/meta.json'
import type { CostView, MetricKey, Model, Point } from './types'
import { computeFrontier, computeMetric, formatAxisTick, formatMetric, formatTokens, formatUsd, costOf } from './pareto'
import { isLowerBetter } from './urlState'
import { STRINGS, type Lang, type T } from './i18n'
import { parseUrl, toSearch, type UrlState } from './urlState'
import { deletePreset, getPreset, listPresets, savePreset, type Preset } from './presets'
import { exportModelsCsv } from './csv'
import ParetoChart from './components/ParetoChart'
import ModelTable from './components/ModelTable'
import ComparePanel from './components/ComparePanel'

const MODELS = modelsData as Model[]
const META = metaData as { fetchedAt: string }

const ALL_FAMILIES = [...new Set(MODELS.map((m) => m.family))].sort()

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
] as const

/**
 * Per-metric upper bound for the range slider. Most metrics are plain model
 * fields and don't depend on cost view, but valueScore (score/cost) does —
 * e.g. cost-per-task is ~1000x smaller than cost-per-1M-tokens, so its
 * value-score max is ~1000x larger. Must be recomputed whenever costView or
 * the task token counts change, or the slider range goes stale.
 */
function computeMetricMax(costView: CostView, taskInput: number, taskOutput: number): Record<MetricKey, number> {
  return Object.fromEntries(
    METRIC_DEFS.map(({ key }) => {
      const vals = MODELS.map((m) => computeMetric(m, key, costView, taskInput, taskOutput)).filter((v): v is number => v != null)
      return [key, vals.length ? Math.ceil(Math.max(...vals)) : 1]
    }),
  ) as Record<MetricKey, number>
}

// Only used to clamp minScore while parsing the initial URL, before costView is known from state.
const STATIC_METRIC_MAX = computeMetricMax('blended', 3000, 1000)
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
  labelKey: 'intel' | 'coding' | 'agentic' | 'tau2' | 'hle' | 'omniscience' | 'outputSpeed' | 'latency' | 'context' | 'valueScore' | 'speedAdjustedScore' | 'contextValue'
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
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    INITIAL.selectedId && MODELS.some((m) => m.slug === INITIAL.selectedId) ? INITIAL.selectedId : null,
  )
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

  const t = STRINGS[lang]

  // Reactive to costView/taskInput/taskOutput since valueScore's scale depends on the chosen cost basis.
  const METRIC_MAX = useMemo(() => computeMetricMax(costView, taskInput, taskOutput), [costView, taskInput, taskOutput])

  // Keep the slider's value in range if the scale shrinks (e.g. task token counts change
  // while metric is valueScore), so the range input never holds a now-impossible value.
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
  }

  useEffect(() => {
    const url = new URL(window.location.href)
    url.search = toSearch(currentState, ALL_FAMILIES, METRIC_MAX, presetId)
    window.history.replaceState(null, '', url.toString())
  }, [lang, theme, metric, costView, taskInput, taskOutput, logScale, includeEfforts, maxEffortOnly, minScore, query, families, selectedId, presetId, reasoningOnly, openWeightsOnly, minPrice, maxPrice, compareIds, minContext, releasedFrom])

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const buildFilterSummary = (): string => {
    const parts: string[] = [`metric=${metric}`, `cost=${costView}`]
    if (families.size !== ALL_FAMILIES.length) parts.push(`families=${[...families].join(',')}`)
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

  const selectCostView = (view: CostView) => {
    // valueScore = score/cost, so its scale shifts drastically between cost bases
    // (e.g. per-task cost is ~1000x smaller than per-1M-token cost). Reset the
    // slider so it doesn't keep an old threshold that's now meaningless.
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
    // Keep the slider meaningful when switching between higher/lower-is-better metrics.
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
    setSelectedId(s.selectedId && MODELS.some((m) => m.slug === s.selectedId) ? s.selectedId : null)
    setReasoningOnly(s.reasoningOnly)
    setOpenWeightsOnly(s.openWeightsOnly)
    setMinPrice(s.minPrice)
    setMaxPrice(s.maxPrice)
    setCompareIds(s.compareIds.filter((id) => MODELS.some((m) => m.slug === id)))
    setMinContext(s.minContext)
    setReleasedFrom(s.releasedFrom)
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
    return MODELS.filter((m) => {
      if (!families.has(m.family)) return false
      if (reasoningOnly && !m.isReasoning) return false
      if (openWeightsOnly && !m.openWeights) return false
      const score = computeMetric(m, metric, costView, taskInput, taskOutput)
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
        score: computeMetric(m, metric, costView, taskInput, taskOutput)!,
      }))
      .sort((a, b) => a.cost - b.cost)
  }, [families, metric, minScore, maxEffortOnly, includeEfforts, query, costView, taskInput, taskOutput, reasoningOnly, openWeightsOnly, minPrice, maxPrice, minContext, releasedFrom])

  const frontier = useMemo(() => computeFrontier(points, isLowerBetter(metric)), [points, metric])
  const frontierSlugs = useMemo(() => new Set(frontier.map((p) => p.model.slug)), [frontier])

  const selected = useMemo(() => (selectedId ? MODELS.find((m) => m.slug === selectedId) ?? null : null), [selectedId])

  const visibleModels = useMemo(() => points.map((p) => p.model), [points])

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
          <label className="range">
            {isLowerBetter(metric) ? t.maxLatency : t.minScore}: <b>{minScore}</b>
            <input type="range" min={0} max={Math.max(METRIC_MAX[metric], 1)} step={1} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </label>
          <input className="search" type="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
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
          points={points}
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
          {points.length} {t.modelsShown} {t.ofTotal} {MODELS.length} · {t.clickHint}
        </div>
      </section>

      {selected && (
        <ModelCard
          model={selected}
          metric={metric}
          frontier={frontierSlugs.has(selected.slug)}
          costView={costView}
          taskInput={taskInput}
          taskOutput={taskOutput}
          t={t}
          inCompare={compareIds.includes(selected.slug)}
          onToggleCompare={() => toggleCompare(selected.slug)}
        />
      )}

      <ComparePanel models={MODELS} compareIds={compareIds} costView={costView} taskInput={taskInput} taskOutput={taskOutput} t={t} onRemove={toggleCompare} onClear={() => setCompareIds([])} onExport={() => exportModelsCsv(MODELS.filter((m) => compareIds.includes(m.slug)), costView, taskInput, taskOutput, t, buildFilterSummary(), '-compare')} />

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
          selectedId={selectedId}
          costView={costView}
          taskInput={taskInput}
          taskOutput={taskOutput}
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
  costView,
  taskInput,
  taskOutput,
  t,
  inCompare,
  onToggleCompare,
}: {
  model: Model
  metric: MetricKey
  frontier: boolean
  costView: CostView
  taskInput: number
  taskOutput: number
  t: T
  inCompare: boolean
  onToggleCompare: () => void
}) {
  const score = computeMetric(model, metric, costView, taskInput, taskOutput)
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
        <div><span className="muted">{t.input}</span><b>{formatUsd(model.inputPerM)}/1M</b></div>
        <div><span className="muted">{t.output}</span><b>{formatUsd(model.outputPerM)}/1M</b></div>
        <div><span className="muted">{t.cache}</span><b>{formatUsd(model.cacheReadPerM)}/1M</b></div>
        <div><span className="muted">{t.blended}</span><b>{formatUsd(blended)}/1M</b></div>
        <div><span className="muted">{t.outputSpeed}</span><b>{formatMetric('outputSpeed', model.outputSpeed)}</b></div>
        <div><span className="muted">{t.latency}</span><b>{formatMetric('latencySeconds', model.latencySeconds)}</b></div>
        <div><span className="muted">{t.context}</span><b>{formatTokens(model.contextTokens)}</b></div>
        <div><span className="muted">{t.release}</span><b>{model.released ?? '—'}</b></div>
      </div>
      <div className="mc-links">
        <a href={`https://openrouter.ai/${model.id}`} target="_blank" rel="noreferrer">{t.openRouterLink} ↗</a>
        <a href={`https://artificialanalysis.ai/models/${model.slug}`} target="_blank" rel="noreferrer">{t.aaLink} ↗</a>
      </div>
    </section>
  )
}


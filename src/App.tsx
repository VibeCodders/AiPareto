import { useEffect, useMemo, useState } from 'react'
import modelsData from './data/models.json'
import metaData from './data/meta.json'
import type { CostView, MetricKey, Model, Point } from './types'
import { computeFrontier, formatTokens, formatUsd } from './pareto'
import { STRINGS, type Lang, type T } from './i18n'
import ParetoChart from './components/ParetoChart'
import ModelTable from './components/ModelTable'

const MODELS = modelsData as Model[]
const META = metaData as { fetchedAt: string }

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

const METRICS: Array<{ key: MetricKey; labelKey: 'intel' | 'agentic' | 'omniscience' }> = [
  { key: 'intelligenceIndex', labelKey: 'intel' },
  { key: 'agenticIndex', labelKey: 'agentic' },
  { key: 'omniscience', labelKey: 'omniscience' },
]

const COST_VIEWS: Array<{ key: CostView; labelKey: 'costViewInput' | 'costViewBlended' | 'costViewCache' | 'costViewOutput' }> = [
  { key: 'input', labelKey: 'costViewInput' },
  { key: 'blended', labelKey: 'costViewBlended' },
  { key: 'cache', labelKey: 'costViewCache' },
  { key: 'output', labelKey: 'costViewOutput' },
]

function costOf(model: Model, view: CostView): number | null {
  switch (view) {
    case 'input':
      return model.inputPerM
    case 'output':
      return model.outputPerM
    case 'cache':
      return model.cacheReadPerM ?? model.inputPerM
    case 'blended': {
      const i = model.inputPerM
      const o = model.outputPerM
      if (i == null || o == null) return null
      return 0.8 * i + 0.2 * o
    }
  }
}

export default function App() {
  const [lang, setLang] = useState<Lang>('it')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [metric, setMetric] = useState<MetricKey>('intelligenceIndex')
  const [costView, setCostView] = useState<CostView>('input')
  const [logScale, setLogScale] = useState(true)
  const [families, setFamilies] = useState<Set<string>>(() => new Set([...new Set(MODELS.map((m) => m.family))]))
  const [query, setQuery] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [includeEfforts, setIncludeEfforts] = useState(true)
  const [maxEffortOnly, setMaxEffortOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const t = STRINGS[lang]

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = lang
  }, [theme, lang])

  const allFamilies = useMemo(() => [...new Set(MODELS.map((m) => m.family))].sort(), [])
  const maxII = useMemo(() => Math.max(...MODELS.map((m) => m.intelligenceIndex ?? 0)), [])

  const toggleFamily = (f: string) => {
    setFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  const points: Point[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    return MODELS.filter((m) => {
      if (!families.has(m.family)) return false
      const score = m[metric]
      if (score == null || score < minScore) return false
      if (maxEffortOnly && m.effort != null && m.effort !== 'max') return false
      if (!includeEfforts && m.effort != null) return false
      if (q && !`${m.aaName} ${m.name} ${m.id}`.toLowerCase().includes(q)) return false
      const cost = costOf(m, costView)
      if (cost == null || cost <= 0) return false
      return true
    })
      .map((m) => ({ model: m, cost: costOf(m, costView)!, score: m[metric]! }))
      .sort((a, b) => a.cost - b.cost)
  }, [families, metric, minScore, maxEffortOnly, includeEfforts, query, costView])

  const frontier = useMemo(() => computeFrontier(points), [points])
  const frontierSlugs = useMemo(() => new Set(frontier.map((p) => p.model.slug)), [frontier])

  const selected = useMemo(() => (selectedId ? MODELS.find((m) => m.id === selectedId) ?? null : null), [selectedId])

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
                <button key={m.key} className={`badge ${metric === m.key ? 'on' : ''}`} onClick={() => setMetric(m.key)}>
                  {t[m.labelKey]}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <span className="control-label">{t.cost}</span>
            <div className="badges" role="group">
              {COST_VIEWS.map((v) => (
                <button key={v.key} className={`badge ${costView === v.key ? 'on' : ''}`} onClick={() => setCostView(v.key)}>
                  {t[v.labelKey]}
                </button>
              ))}
            </div>
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
          <label className="range">
            {t.minScore}: <b>{minScore}</b>
            <input type="range" min={0} max={maxII} step={1} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </label>
          <input className="search" type="search" placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="control-row wrap family-row">
          <span className="control-label">{t.family}</span>
          {allFamilies.map((f) => (
            <button key={f} className={`chip ${families.has(f) ? 'on' : ''}`} style={families.has(f) ? { borderColor: colorFor(f) } : undefined} onClick={() => toggleFamily(f)}>
              <span className="chip-dot" style={{ background: colorFor(f) }} />
              {f}
            </button>
          ))}
          <button className="chip subtle" onClick={() => setFamilies(new Set(allFamilies))}>{t.all}</button>
          <button className="chip subtle" onClick={() => setFamilies(new Set())}>{t.none}</button>
        </div>
      </section>

      <section className="chart-section">
        <ParetoChart
          points={points}
          frontier={frontier}
          logScale={logScale}
          colorFor={colorFor}
          metricName={t[METRICS.find((m) => m.key === metric)!.labelKey]}
          costName={t[COST_VIEWS.find((v) => v.key === costView)!.labelKey]}
          t={t}
          onSelect={(id) => setSelectedId(id)}
        />
        <div className="count-bar muted">
          {points.length} {t.modelsShown} {t.ofTotal} {MODELS.length} · {t.clickHint}
        </div>
      </section>

      {selected && <ModelCard model={selected} metric={metric} frontier={frontierSlugs.has(selected.slug)} t={t} />}

      <section className="table-section">
        <h2>{t.table}</h2>
        <ModelTable
          models={MODELS.filter((m) => points.some((p) => p.model.id === m.id))}
          metric={metric}
          frontierIds={frontierSlugs}
          selectedId={selectedId}
          t={t}
          onSelect={setSelectedId}
        />
      </section>

      <footer className="footer muted">
        {t.fetchedAt}: {new Date(META.fetchedAt).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB')} · © Artificial Analysis (Intelligence Index) · OpenRouter (pricing)
      </footer>
    </div>
  )
}

function ModelCard({ model, metric, frontier, t }: { model: Model; metric: MetricKey; frontier: boolean; t: T }) {
  const score = model[metric]
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
        </div>
      </div>
      <div className="mc-grid">
        <div><span className="muted">{t.family}</span><b>{model.family}</b></div>
        <div><span className="muted">{t[METRICS.find((m) => m.key === metric)!.labelKey]}</span><b>{score?.toFixed(1) ?? '—'}</b></div>
        <div><span className="muted">{t.input}</span><b>{formatUsd(model.inputPerM)}/1M</b></div>
        <div><span className="muted">{t.output}</span><b>{formatUsd(model.outputPerM)}/1M</b></div>
        <div><span className="muted">{t.cache}</span><b>{formatUsd(model.cacheReadPerM)}/1M</b></div>
        <div><span className="muted">{t.blended}</span><b>{formatUsd(blended)}/1M</b></div>
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


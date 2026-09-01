import { useEffect, useState } from 'react'
import type { CostView, Model, MetricKey, ValueScoreBase } from '../types'
import { blendedCostOf, computeMetric, formatCostChangePct, formatDelta, formatMetric, formatParams, formatTokens, formatUsd, type EfficiencyOpts, type FrontierUpgrade } from '../pareto'
import { isCostEstimated, isEstimated, isFieldEstimated } from '../estimation'
import type { T } from '../i18n'

type SortKey =
  | 'name'
  | 'family'
  | 'score'
  | 'inputPerM'
  | 'outputPerM'
  | 'cacheReadPerM'
  | 'cacheWritePerM'
  | 'blended'
  | 'contextTokens'
  | 'maxCompletionTokens'
  | 'released'
  | 'outputSpeed'
  | 'latencySeconds'
  | 'parameters'
  | 'activeParameters'
  | 'codingIndex'
  | 'agenticIndex'
  | 'subscription'
  | 'frontierDelta'
  | 'frontierCostGap'
  | 'dominates'
  | 'arenaElo'
  | 'arenaCodeElo'
  | 'benchlmScore'
  | 'hfDownloads'

type OptionalCol = 'outputSpeed' | 'latencySeconds' | 'codingIndex' | 'agenticIndex' | 'subscription' | 'frontierDelta' | 'frontierCostGap' | 'cacheWritePerM' | 'dominates' | 'maxCompletionTokens' | 'arenaElo' | 'arenaCodeElo' | 'benchlmScore' | 'hfDownloads'

const OPTIONAL_COLS: Array<{ key: OptionalCol; labelKey: 'outputSpeed' | 'latency' | 'coding' | 'agentic' | 'subscriptions' | 'vsFrontier' | 'frontierCostGap' | 'cacheWrite' | 'dominates' | 'maxOutputTokens' | 'arenaElo' | 'arenaCodeElo' | 'benchlmScore' | 'hfDownloads' }> = [
  { key: 'subscription', labelKey: 'subscriptions' },
  { key: 'cacheWritePerM', labelKey: 'cacheWrite' },
  { key: 'codingIndex', labelKey: 'coding' },
  { key: 'agenticIndex', labelKey: 'agentic' },
  { key: 'outputSpeed', labelKey: 'outputSpeed' },
  { key: 'latencySeconds', labelKey: 'latency' },
  { key: 'frontierDelta', labelKey: 'vsFrontier' },
  { key: 'frontierCostGap', labelKey: 'frontierCostGap' },
  { key: 'dominates', labelKey: 'dominates' },
  { key: 'maxCompletionTokens', labelKey: 'maxOutputTokens' },
  { key: 'arenaElo', labelKey: 'arenaElo' },
  { key: 'arenaCodeElo', labelKey: 'arenaCodeElo' },
  { key: 'benchlmScore', labelKey: 'benchlmScore' },
  { key: 'hfDownloads', labelKey: 'hfDownloads' },
]

interface Props {
  models: Model[]
  metric: MetricKey
  frontierIds: Set<string>
  frontierDeltas: Map<string, number | null>
  selectedId: string | null
  costView: CostView
  taskInput: number
  taskOutput: number
  valueScoreBase: ValueScoreBase
  efficiencyOpts: EfficiencyOpts
  t: T
  onSelect: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
  dominatedCounts: Map<string, number>
  frontierUpgradeBySlug: Map<string, FrontierUpgrade | null>
  /** Sort column (controlled from the URL; validated against the columns here). */
  sortKey: string
  /** Sort direction (true = descending). */
  sortDesc: boolean
  onSortChange: (key: string, desc: boolean) => void
}

const SORT_KEYS: SortKey[] = [
  'name', 'family', 'score', 'inputPerM', 'outputPerM', 'cacheReadPerM', 'cacheWritePerM', 'blended',
  'contextTokens', 'maxCompletionTokens', 'released', 'outputSpeed', 'latencySeconds', 'parameters',
  'activeParameters', 'codingIndex', 'agenticIndex', 'subscription', 'frontierDelta', 'frontierCostGap',
  'dominates', 'arenaElo', 'arenaCodeElo', 'benchlmScore', 'hfDownloads',
]

const LS_COLS = 'ai-pareto-table-cols'
const DEFAULT_COLS: OptionalCol[] = ['subscription']

/** Restore the user's previously chosen columns, falling back to the defaults. */
function loadVisibleCols(): Set<OptionalCol> {
  try {
    const raw = localStorage.getItem(LS_COLS)
    const arr: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(arr)) {
      const valid = arr.filter((k): k is OptionalCol => OPTIONAL_COLS.some((c) => c.key === k))
      if (valid.length > 0) return new Set(valid)
    }
  } catch {
    /* ignore malformed storage */
  }
  return new Set(DEFAULT_COLS)
}

export default function ModelTable({ models, metric, frontierIds, frontierDeltas, selectedId, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts, t, onSelect, compareIds, onToggleCompare, dominatedCounts, frontierUpgradeBySlug, sortKey: sortKeyRaw, sortDesc, onSortChange }: Props) {
  // Sort is controlled from the URL; a key outside the valid column set falls back to the table default.
  const sortKey: SortKey = SORT_KEYS.includes(sortKeyRaw as SortKey) ? (sortKeyRaw as SortKey) : 'score'
  const desc = sortDesc
  const [visibleCols, setVisibleCols] = useState<Set<OptionalCol>>(loadVisibleCols)

  // The user's column picks survive reloads, mirroring how lang/theme are persisted elsewhere.
  useEffect(() => {
    try {
      localStorage.setItem(LS_COLS, JSON.stringify([...visibleCols]))
    } catch {
      /* ignore storage-unavailable errors */
    }
  }, [visibleCols])

  const toggleCol = (k: OptionalCol) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const cols: Array<{ key: SortKey; label: string; num?: boolean }> = [
    { key: 'name', label: t.model },
    { key: 'family', label: t.family },
    { key: 'parameters', label: t.parameters, num: true },
    { key: 'activeParameters', label: t.activeParameters, num: true },
    ...(visibleCols.has('subscription') ? [{ key: 'subscription' as SortKey, label: t.subscriptions, num: false }] : []),
    { key: 'score', label: t.score, num: true },
    { key: 'inputPerM', label: t.input, num: true },
    { key: 'outputPerM', label: t.output, num: true },
    { key: 'cacheReadPerM', label: t.cache, num: true },
    ...(visibleCols.has('cacheWritePerM') ? [{ key: 'cacheWritePerM' as SortKey, label: t.cacheWrite, num: true }] : []),
    { key: 'blended', label: t.blended, num: true },
    ...OPTIONAL_COLS.filter((c) => c.key !== 'subscription' && c.key !== 'cacheWritePerM' && visibleCols.has(c.key)).map((c) => ({ key: c.key, label: t[c.labelKey], num: true })),
    { key: 'contextTokens', label: t.context, num: true },
    { key: 'released', label: t.release, num: true },
  ]

  const valueOf = (m: Model): number | string | null => {
    if (sortKey === 'score') return computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
    if (sortKey === 'blended') return blendedCostOf(m)
    if (sortKey === 'name') return m.isSubscription ? m.name : m.aaName
    if (sortKey === 'family') return m.family
    if (sortKey === 'subscription') return m.subscription?.priceMonthly ?? (m.isSubscription ? 0 : 9999)
    if (sortKey === 'frontierDelta') return frontierDeltas.get(m.slug) ?? null
    if (sortKey === 'dominates') return dominatedCounts.get(m.slug) ?? 0
    if (sortKey === 'frontierCostGap') return frontierUpgradeBySlug.get(m.slug)?.costDeltaPct ?? null
    if (sortKey === 'parameters') return m.parameters
    if (sortKey === 'activeParameters') return m.activeParameters
    return (m as unknown as Record<string, number | string | null>)[sortKey]
  }

  const sorted = [...models].sort((a, b) => {
    const va = valueOf(a)
    const vb = valueOf(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return desc ? -cmp : cmp
  })

  const toggle = (k: SortKey) => {
    if (k === sortKey) onSortChange(k, !desc)
    else {
      // Text columns read more naturally ascending on first click; numeric columns descend.
      onSortChange(k, k !== 'name' && k !== 'family')
    }
  }

  // Rows are keyboard-focusable; Enter/Space selects. Ignore keystrokes originating from
  // nested controls (the compare checkbox) so they keep their own behavior.
  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, slug: string) => {
    const target = e.target as HTMLElement
    if (target.closest('input, button, a, select, textarea')) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(slug)
    }
  }

  return (
    <div>
      <div className="col-toggles">
        <span className="control-label">{t.columns}</span>
        {OPTIONAL_COLS.map((c) => (
          <label key={c.key} className="check">
            <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)} />
            {t[c.labelKey]}
          </label>
        ))}
      </div>
      <div className="table-wrap">
        <table className="model-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              {cols.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} onClick={() => toggle(c.key)}>
                  <span className="th-in">
                    {c.label}
                    {sortKey === c.key && <span className="sort-arrow">{desc ? ' ↓' : ' ↑'}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const isFrontier = frontierIds.has(m.slug)
              const isSel = selectedId === m.slug
              const isComparing = compareIds.includes(m.slug)
              const score = computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
              const blended = blendedCostOf(m)
              const delta = frontierDeltas.get(m.slug) ?? null
              const dominated = dominatedCounts.get(m.slug) ?? 0
              const upgrade = frontierUpgradeBySlug.get(m.slug) ?? null

              const estScore = isEstimated(m, metric, valueScoreBase)
              const estInput = isFieldEstimated(m, 'inputPerM')
              const estOutput = isFieldEstimated(m, 'outputPerM')
              const estCache = isFieldEstimated(m, 'cacheReadPerM')
              const estCacheWrite = isFieldEstimated(m, 'cacheWritePerM')
              const estBlended = isCostEstimated(m, 'blended')
              const estCoding = isFieldEstimated(m, 'codingIndex')
              const estAgentic = isFieldEstimated(m, 'agenticIndex')
              const estSpeed = isFieldEstimated(m, 'outputSpeed')
              const estLatency = isFieldEstimated(m, 'latencySeconds')
              const estContext = isFieldEstimated(m, 'contextTokens')
              const estParameters = isFieldEstimated(m, 'parameters')
              const estActiveParameters = isFieldEstimated(m, 'activeParameters')
              const estMaxOut = isFieldEstimated(m, 'maxCompletionTokens')
              const estArenaElo = isFieldEstimated(m, 'arenaElo')
              const estArenaCodeElo = isFieldEstimated(m, 'arenaCodeElo')
              const estBenchlm = isFieldEstimated(m, 'benchlmScore')
              const estDownloads = isFieldEstimated(m, 'hfDownloads')

              return (
                <tr
                  key={m.slug}
                  tabIndex={0}
                  aria-selected={isSel}
                  onKeyDown={(e) => handleRowKeyDown(e, m.slug)}
                  className={`${isFrontier ? 'row-frontier' : ''} ${isSel ? 'row-sel' : ''} ${m.isSubscription ? 'row-sub' : ''}`}
                >
                  <td className="center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isComparing}
                      onChange={() => onToggleCompare(m.slug)}
                      title={isComparing ? t.removeFromCompare : t.addToCompare}
                    />
                  </td>
                  <td className="bold" onClick={() => onSelect(m.slug)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.isSubscription && <span className="sub-badge" title={m.subscription?.rateLimitDesc}>★ PLAN</span>}
                      <span>{m.isSubscription ? m.name : m.aaName}</span>
                    </div>
                  </td>
                  <td className="muted" onClick={() => onSelect(m.slug)}>
                    {m.family}
                  </td>
                  <td className={`num ${estParameters ? 'est' : ''}`} title={estParameters ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {estParameters ? '≈ ' : ''}{formatParams(m.parameters)}
                  </td>
                  <td className={`num ${estActiveParameters ? 'est' : ''}`} title={estActiveParameters ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {estActiveParameters ? '≈ ' : ''}{formatParams(m.activeParameters)}
                  </td>
                  {visibleCols.has('subscription') && (
                    <td onClick={() => onSelect(m.slug)}>
                      {m.subscription ? (
                        <div className="sub-plan-cell">
                          <span className="sub-price">${m.subscription.priceMonthly}/mo</span>
                          <span className="sub-tokens">~{(m.subscription.estimatedTokensMonthly / 1e6).toFixed(1)}M tok</span>
                        </div>
                      ) : (
                        <span className="muted">Pay-as-you-go</span>
                      )}
                    </td>
                  )}
                  <td className={`num bold ${estScore ? 'est' : ''}`} title={estScore ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {estScore ? '≈ ' : ''}{formatMetric(metric, score)}
                  </td>
                  <td className={`num ${estInput ? 'est' : ''}`} title={estInput ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {estInput ? '≈ ' : ''}{formatUsd(m.isSubscription ? (m.inputPerM ?? m.effectiveCostPerM) : m.inputPerM)}
                  </td>
                  <td className={`num ${estOutput ? 'est' : ''}`} title={estOutput ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {m.outputPerM != null ? `${estOutput ? '≈ ' : ''}${formatUsd(m.outputPerM)}` : '—'}
                  </td>
                  <td className={`num ${estCache ? 'est' : ''}`} title={estCache ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {m.cacheReadPerM != null ? `${estCache ? '≈ ' : ''}${formatUsd(m.cacheReadPerM)}` : '—'}
                  </td>
                  {visibleCols.has('cacheWritePerM') && (
                    <td className={`num ${estCacheWrite ? 'est' : ''}`} title={estCacheWrite ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {m.cacheWritePerM != null ? `${estCacheWrite ? '≈ ' : ''}${formatUsd(m.cacheWritePerM)}` : '—'}
                    </td>
                  )}
                  <td className={`num bold ${estBlended ? 'est' : ''}`} title={estBlended ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {blended != null ? `${estBlended ? '≈ ' : ''}${formatUsd(blended)}` : '—'}
                  </td>
                  {visibleCols.has('codingIndex') && (
                    <td className={`num ${estCoding ? 'est' : ''}`} title={estCoding ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {m.codingIndex != null ? `${estCoding ? '≈ ' : ''}${m.codingIndex.toFixed(1)}` : '—'}
                    </td>
                  )}
                  {visibleCols.has('agenticIndex') && (
                    <td className={`num ${estAgentic ? 'est' : ''}`} title={estAgentic ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {m.agenticIndex != null ? `${estAgentic ? '≈ ' : ''}${m.agenticIndex.toFixed(1)}` : '—'}
                    </td>
                  )}
                  {visibleCols.has('outputSpeed') && (
                    <td className={`num ${estSpeed ? 'est' : ''}`} title={estSpeed ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {m.outputSpeed != null ? `${estSpeed ? '≈ ' : ''}${Math.round(m.outputSpeed)} tok/s` : '—'}
                    </td>
                  )}
                  {visibleCols.has('latencySeconds') && (
                    <td className={`num ${estLatency ? 'est' : ''}`} title={estLatency ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {m.latencySeconds != null ? `${estLatency ? '≈ ' : ''}${m.latencySeconds.toFixed(1)}s` : '—'}
                    </td>
                  )}
                  {visibleCols.has('frontierDelta') && (
                    <td className={`num ${delta != null && delta > 0.05 ? 'delta-behind' : 'delta-ok'}`} onClick={() => onSelect(m.slug)}>
                      {formatDelta(delta)}
                    </td>
                  )}
                  {visibleCols.has('frontierCostGap') && (
                    <td className="num" title={upgrade ? upgrade.model.aaName : undefined} onClick={() => onSelect(m.slug)}>
                      {formatCostChangePct(upgrade?.costDeltaPct)}
                    </td>
                  )}
                  {visibleCols.has('dominates') && (
                    <td className="num" title={t.dominatesHint} onClick={() => onSelect(m.slug)}>
                      {dominated}
                    </td>
                  )}
                  {visibleCols.has('maxCompletionTokens') && (
                    <td className={`num ${estMaxOut ? 'est' : ''}`} title={estMaxOut ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {estMaxOut ? '≈ ' : ''}{formatTokens(m.maxCompletionTokens)}
                    </td>
                  )}
                  {visibleCols.has('arenaElo') && (
                    <td className={`num ${estArenaElo ? 'est' : ''}`} title={estArenaElo ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {estArenaElo ? '≈ ' : ''}{m.arenaElo != null ? Math.round(m.arenaElo) : '—'}
                    </td>
                  )}
                  {visibleCols.has('arenaCodeElo') && (
                    <td className={`num ${estArenaCodeElo ? 'est' : ''}`} title={estArenaCodeElo ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {estArenaCodeElo ? '≈ ' : ''}{m.arenaCodeElo != null ? Math.round(m.arenaCodeElo) : '—'}
                    </td>
                  )}
                  {visibleCols.has('benchlmScore') && (
                    <td className={`num ${estBenchlm ? 'est' : ''}`} title={estBenchlm ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {estBenchlm ? '≈ ' : ''}{m.benchlmScore != null ? m.benchlmScore.toFixed(1) : '—'}
                    </td>
                  )}
                  {visibleCols.has('hfDownloads') && (
                    <td className={`num ${estDownloads ? 'est' : ''}`} title={estDownloads ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                      {estDownloads ? '≈ ' : ''}{formatTokens(m.hfDownloads)}
                    </td>
                  )}
                  <td className={`num ${estContext ? 'est' : ''}`} title={estContext ? t.estimated : undefined} onClick={() => onSelect(m.slug)}>
                    {estContext ? '≈ ' : ''}{formatTokens(m.contextTokens)}
                  </td>
                  <td className="num muted" onClick={() => onSelect(m.slug)}>
                    {m.released ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

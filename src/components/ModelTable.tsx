import { useEffect, useState } from 'react'
import type { CostView, Model, MetricKey, ValueScoreBase } from '../types'
import { computeMetric, formatDelta, formatMetric, formatTokens, formatUsd, costOf, type EfficiencyOpts } from '../pareto'
import { isLowerBetter } from '../urlState'
import type { T } from '../i18n'

type SortKey =
  | 'name'
  | 'family'
  | 'score'
  | 'inputPerM'
  | 'outputPerM'
  | 'cacheReadPerM'
  | 'blended'
  | 'contextTokens'
  | 'released'
  | 'outputSpeed'
  | 'latencySeconds'
  | 'codingIndex'
  | 'agenticIndex'
  | 'subscription'
  | 'frontierDelta'

type OptionalCol = 'outputSpeed' | 'latencySeconds' | 'codingIndex' | 'agenticIndex' | 'subscription' | 'frontierDelta'

const OPTIONAL_COLS: Array<{ key: OptionalCol; labelKey: 'outputSpeed' | 'latency' | 'coding' | 'agentic' | 'subscriptions' | 'vsFrontier' }> = [
  { key: 'subscription', labelKey: 'subscriptions' },
  { key: 'codingIndex', labelKey: 'coding' },
  { key: 'agenticIndex', labelKey: 'agentic' },
  { key: 'outputSpeed', labelKey: 'outputSpeed' },
  { key: 'latencySeconds', labelKey: 'latency' },
  { key: 'frontierDelta', labelKey: 'vsFrontier' },
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
}

export default function ModelTable({ models, metric, frontierIds, frontierDeltas, selectedId, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts, t, onSelect, compareIds, onToggleCompare }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [desc, setDesc] = useState(() => !isLowerBetter(metric))
  const [visibleCols, setVisibleCols] = useState<Set<OptionalCol>>(new Set(['subscription']))

  // Reset to the metric-appropriate default direction when the metric changes.
  useEffect(() => {
    setSortKey('score')
    setDesc(!isLowerBetter(metric))
  }, [metric])

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
    ...(visibleCols.has('subscription') ? [{ key: 'subscription' as SortKey, label: t.subscriptions, num: false }] : []),
    { key: 'score', label: t.score, num: true },
    { key: 'inputPerM', label: t.input, num: true },
    { key: 'outputPerM', label: t.output, num: true },
    { key: 'cacheReadPerM', label: t.cache, num: true },
    { key: 'blended', label: t.blended, num: true },
    ...OPTIONAL_COLS.filter((c) => c.key !== 'subscription' && visibleCols.has(c.key)).map((c) => ({ key: c.key, label: t[c.labelKey], num: true })),
    { key: 'contextTokens', label: t.context, num: true },
    { key: 'released', label: t.release, num: true },
  ]

  const valueOf = (m: Model): number | string | null => {
    if (sortKey === 'score') return computeMetric(m, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts)
    if (sortKey === 'blended') return costOf(m, costView)
    if (sortKey === 'name') return m.isSubscription ? m.name : m.aaName
    if (sortKey === 'family') return m.family
    if (sortKey === 'subscription') return m.subscription?.priceMonthly ?? (m.isSubscription ? 0 : 9999)
    if (sortKey === 'frontierDelta') return frontierDeltas.get(m.slug) ?? null
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
    if (k === sortKey) setDesc(!desc)
    else {
      setSortKey(k)
      setDesc(true)
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
        <table className="tbl">
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
              const blended = costOf(m, costView)
              const delta = frontierDeltas.get(m.slug) ?? null
              return (
                <tr key={m.slug} className={`${isFrontier ? 'row-frontier' : ''} ${isSel ? 'row-sel' : ''} ${m.isSubscription ? 'row-sub' : ''}`}>
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
                  <td className="num bold" onClick={() => onSelect(m.slug)}>
                    {formatMetric(metric, score)}
                  </td>
                  <td className="num" onClick={() => onSelect(m.slug)}>
                    {m.isSubscription ? formatUsd(m.effectiveCostPerM) : formatUsd(m.inputPerM)}
                  </td>
                  <td className="num" onClick={() => onSelect(m.slug)}>
                    {m.isSubscription ? '—' : formatUsd(m.outputPerM)}
                  </td>
                  <td className="num" onClick={() => onSelect(m.slug)}>
                    {m.isSubscription ? '—' : formatUsd(m.cacheReadPerM)}
                  </td>
                  <td className="num bold" onClick={() => onSelect(m.slug)}>
                    {formatUsd(blended)}
                  </td>
                  {visibleCols.has('codingIndex') && (
                    <td className="num" onClick={() => onSelect(m.slug)}>
                      {m.codingIndex != null ? m.codingIndex.toFixed(1) : '—'}
                    </td>
                  )}
                  {visibleCols.has('agenticIndex') && (
                    <td className="num" onClick={() => onSelect(m.slug)}>
                      {m.agenticIndex != null ? m.agenticIndex.toFixed(1) : '—'}
                    </td>
                  )}
                  {visibleCols.has('outputSpeed') && (
                    <td className="num" onClick={() => onSelect(m.slug)}>
                      {m.outputSpeed != null ? `${Math.round(m.outputSpeed)} tok/s` : '—'}
                    </td>
                  )}
                  {visibleCols.has('latencySeconds') && (
                    <td className="num" onClick={() => onSelect(m.slug)}>
                      {m.latencySeconds != null ? `${m.latencySeconds.toFixed(1)}s` : '—'}
                    </td>
                  )}
                  {visibleCols.has('frontierDelta') && (
                    <td className={`num ${delta != null && delta > 0.05 ? 'delta-behind' : 'delta-ok'}`} onClick={() => onSelect(m.slug)}>
                      {formatDelta(delta)}
                    </td>
                  )}
                  <td className="num" onClick={() => onSelect(m.slug)}>
                    {formatTokens(m.contextTokens)}
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

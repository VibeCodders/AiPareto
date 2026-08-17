import { useEffect, useState } from 'react'
import type { CostView, Model, MetricKey } from '../types'
import { computeMetric, formatMetric, formatTokens, formatUsd, costOf } from '../pareto'
import { isLowerBetter } from '../urlState'
import type { T } from '../i18n'

type SortKey = 'name' | 'family' | 'score' | 'inputPerM' | 'outputPerM' | 'cacheReadPerM' | 'blended' | 'contextTokens' | 'released' | 'outputSpeed' | 'latencySeconds' | 'codingIndex' | 'agenticIndex'

type OptionalCol = 'outputSpeed' | 'latencySeconds' | 'codingIndex' | 'agenticIndex'

const OPTIONAL_COLS: Array<{ key: OptionalCol; labelKey: 'outputSpeed' | 'latency' | 'coding' | 'agentic' }> = [
  { key: 'codingIndex', labelKey: 'coding' },
  { key: 'agenticIndex', labelKey: 'agentic' },
  { key: 'outputSpeed', labelKey: 'outputSpeed' },
  { key: 'latencySeconds', labelKey: 'latency' },
]

interface Props {
  models: Model[]
  metric: MetricKey
  frontierIds: Set<string>
  selectedId: string | null
  costView: CostView
  taskInput: number
  taskOutput: number
  t: T
  onSelect: (id: string) => void
  compareIds: string[]
  onToggleCompare: (id: string) => void
}

export default function ModelTable({ models, metric, frontierIds, selectedId, costView, taskInput, taskOutput, t, onSelect, compareIds, onToggleCompare }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [desc, setDesc] = useState(() => !isLowerBetter(metric))
  const [visibleCols, setVisibleCols] = useState<Set<OptionalCol>>(new Set())

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
    { key: 'score', label: t.score, num: true },
    { key: 'inputPerM', label: t.input, num: true },
    { key: 'outputPerM', label: t.output, num: true },
    { key: 'cacheReadPerM', label: t.cache, num: true },
    { key: 'blended', label: t.blended, num: true },
    ...OPTIONAL_COLS.filter((c) => visibleCols.has(c.key)).map((c) => ({ key: c.key, label: t[c.labelKey], num: true })),
    { key: 'contextTokens', label: t.context, num: true },
    { key: 'released', label: t.release, num: true },
  ]

  const valueOf = (m: Model): number | string | null => {
    if (sortKey === 'score') return computeMetric(m, metric, costView, taskInput, taskOutput)
    if (sortKey === 'blended') return costOf(m, costView)
    if (sortKey === 'name') return m.aaName
    if (sortKey === 'family') return m.family
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
        <table className="model-table">
          <thead>
            <tr>
              <th className="compare-col"></th>
              {cols.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} onClick={() => toggle(c.key)}>
                  {c.label}
                  {sortKey === c.key ? (desc ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr
                key={m.slug}
                className={`${frontierIds.has(m.slug) ? 'frontier-row' : ''} ${selectedId === m.slug ? 'selected' : ''}`}
              >
                <td className="compare-col">
                  <input
                    type="checkbox"
                    checked={compareIds.includes(m.slug)}
                    title={compareIds.includes(m.slug) ? t.removeFromCompare : t.addToCompare}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleCompare(m.slug)}
                  />
                </td>
                <td onClick={() => onSelect(m.slug)}>
                  <span className="model-name">{m.aaName}</span>
                  {m.effort && <span className="tag">{m.effort}</span>}
                  {m.openWeights && <span className="tag tag-open">open</span>}
                </td>
                <td className="muted" onClick={() => onSelect(m.slug)}>{m.family}</td>
                <td className="num" onClick={() => onSelect(m.slug)}>{formatMetric(metric, computeMetric(m, metric, costView, taskInput, taskOutput))}</td>
                <td className="num" onClick={() => onSelect(m.slug)}>{formatUsd(m.inputPerM)}</td>
                <td className="num" onClick={() => onSelect(m.slug)}>{formatUsd(m.outputPerM)}</td>
                <td className="num" onClick={() => onSelect(m.slug)}>{formatUsd(m.cacheReadPerM)}</td>
                <td className="num" onClick={() => onSelect(m.slug)}>{formatUsd(costOf(m, costView))}</td>
                {OPTIONAL_COLS.filter((c) => visibleCols.has(c.key)).map((c) => (
                  <td key={c.key} className="num muted" onClick={() => onSelect(m.slug)}>
                    {formatMetric(c.key as MetricKey, m[c.key])}
                  </td>
                ))}
                <td className="num muted" onClick={() => onSelect(m.slug)}>{formatTokens(m.contextTokens)}</td>
                <td className="num muted" onClick={() => onSelect(m.slug)}>{m.released ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

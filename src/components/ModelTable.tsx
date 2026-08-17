import { useEffect, useState } from 'react'
import type { CostView, Model, MetricKey } from '../types'
import { formatMetric, formatTokens, formatUsd, costOf, valueScoreOf } from '../pareto'
import { isLowerBetter } from '../urlState'
import type { T } from '../i18n'

type SortKey = 'name' | 'family' | 'score' | 'inputPerM' | 'outputPerM' | 'cacheReadPerM' | 'blended' | 'contextTokens' | 'released'

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
}

export default function ModelTable({ models, metric, frontierIds, selectedId, costView, taskInput, taskOutput, t, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [desc, setDesc] = useState(() => !isLowerBetter(metric))

  // Reset to the metric-appropriate default direction when the metric changes.
  useEffect(() => {
    setSortKey('score')
    setDesc(!isLowerBetter(metric))
  }, [metric])

  const cols: Array<{ key: SortKey; label: string; num?: boolean }> = [
    { key: 'name', label: t.model },
    { key: 'family', label: t.family },
    { key: 'score', label: t.score, num: true },
    { key: 'inputPerM', label: t.input, num: true },
    { key: 'outputPerM', label: t.output, num: true },
    { key: 'cacheReadPerM', label: t.cache, num: true },
    { key: 'blended', label: t.blended, num: true },
    { key: 'contextTokens', label: t.context, num: true },
    { key: 'released', label: t.release, num: true },
  ]

  const valueOf = (m: Model): number | string | null => {
    if (sortKey === 'score') {
      if (metric === 'valueScore') return valueScoreOf(m, costView, taskInput, taskOutput)
      return m[metric]
    }
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
    <div className="table-wrap">
      <table className="model-table">
        <thead>
          <tr>
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
              key={`${m.id}-${m.slug}`}
              className={`${frontierIds.has(m.slug) ? 'frontier-row' : ''} ${selectedId === m.id ? 'selected' : ''}`}
              onClick={() => onSelect(m.id)}
            >
              <td>
                <span className="model-name">{m.aaName}</span>
                {m.effort && <span className="tag">{m.effort}</span>}
                {m.openWeights && <span className="tag tag-open">open</span>}
              </td>
              <td className="muted">{m.family}</td>
              <td className="num">{metric === 'valueScore' ? formatMetric('valueScore', valueScoreOf(m, costView, taskInput, taskOutput)) : formatMetric(metric, m[metric])}</td>
              <td className="num">{formatUsd(m.inputPerM)}</td>
              <td className="num">{formatUsd(m.outputPerM)}</td>
              <td className="num">{formatUsd(m.cacheReadPerM)}</td>
              <td className="num">{formatUsd(costOf(m, costView))}</td>
              <td className="num muted">{formatTokens(m.contextTokens)}</td>
              <td className="num muted">{m.released ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

import { useState } from 'react'
import type { Model, MetricKey } from '../types'
import { formatTokens, formatUsd } from '../pareto'
import type { T } from '../i18n'

type SortKey = 'name' | 'family' | 'score' | 'inputPerM' | 'outputPerM' | 'cacheReadPerM' | 'blended' | 'contextTokens' | 'released'

interface Props {
  models: Model[]
  metric: MetricKey
  frontierIds: Set<string>
  selectedId: string | null
  t: T
  onSelect: (id: string) => void
}

function costOf(m: Model): number | null {
  const i = m.inputPerM
  const o = m.outputPerM
  if (i == null || o == null) return null
  return 0.8 * i + 0.2 * o
}

export default function ModelTable({ models, metric, frontierIds, selectedId, t, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [desc, setDesc] = useState(true)

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
    if (sortKey === 'score') return m[metric]
    if (sortKey === 'blended') return costOf(m)
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
              <td className="num">{m[metric]?.toFixed(1) ?? '—'}</td>
              <td className="num">{formatUsd(m.inputPerM)}</td>
              <td className="num">{formatUsd(m.outputPerM)}</td>
              <td className="num">{formatUsd(m.cacheReadPerM)}</td>
              <td className="num">{formatUsd(costOf(m))}</td>
              <td className="num muted">{formatTokens(m.contextTokens)}</td>
              <td className="num muted">{m.released?.slice(0, 4) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

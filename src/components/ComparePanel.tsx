import type { CostView, MetricKey, Model, ValueScoreBase } from '../types'
import { computeMetric, formatMetric, formatParams, formatTokens, formatUsd, costOf, type EfficiencyOpts } from '../pareto'
import { isCostEstimated, isEstimated, isFieldEstimated } from '../estimation'
import type { T } from '../i18n'

interface Row {
  labelKey: keyof T
  higherIsBetter: boolean
  value: (m: Model) => number | null
  format: (v: number | null) => string
  /** Metric key or field key used to check whether the shown value is an estimate. */
  estField?: string
  estMetric?: MetricKey
  costView?: CostView
}

const BENCHMARK_ROWS: Row[] = [
  { labelKey: 'intel', higherIsBetter: true, value: (m) => m.intelligenceIndex, format: (v) => formatMetric('intelligenceIndex', v), estMetric: 'intelligenceIndex' },
  { labelKey: 'coding', higherIsBetter: true, value: (m) => m.codingIndex, format: (v) => formatMetric('codingIndex', v), estMetric: 'codingIndex' },
  { labelKey: 'agentic', higherIsBetter: true, value: (m) => m.agenticIndex, format: (v) => formatMetric('agenticIndex', v), estMetric: 'agenticIndex' },
  { labelKey: 'tau2', higherIsBetter: true, value: (m) => m.tau2, format: (v) => formatMetric('tau2', v), estMetric: 'tau2' },
  { labelKey: 'hle', higherIsBetter: true, value: (m) => m.hle, format: (v) => formatMetric('hle', v), estMetric: 'hle' },
  { labelKey: 'omniscience', higherIsBetter: true, value: (m) => m.omniscience, format: (v) => formatMetric('omniscience', v), estMetric: 'omniscience' },
  { labelKey: 'outputSpeed', higherIsBetter: true, value: (m) => m.outputSpeed, format: (v) => formatMetric('outputSpeed', v), estMetric: 'outputSpeed' },
  { labelKey: 'latency', higherIsBetter: false, value: (m) => m.latencySeconds, format: (v) => formatMetric('latencySeconds', v), estMetric: 'latencySeconds' },
  { labelKey: 'context', higherIsBetter: true, value: (m) => m.contextTokens, format: (v) => formatTokens(v), estMetric: 'contextTokens' },
  { labelKey: 'maxOutputTokens', higherIsBetter: true, value: (m) => m.maxCompletionTokens, format: (v) => formatTokens(v), estField: 'maxCompletionTokens' },
  { labelKey: 'parameters', higherIsBetter: true, value: (m) => m.parameters, format: (v) => formatParams(v), estField: 'parameters' },
  { labelKey: 'activeParameters', higherIsBetter: true, value: (m) => m.activeParameters, format: (v) => formatParams(v), estField: 'activeParameters' },
]

interface Props {
  models: Model[]
  compareIds: string[]
  costView: CostView
  taskInput: number
  taskOutput: number
  valueScoreBase: ValueScoreBase
  efficiencyOpts: EfficiencyOpts
  t: T
  onRemove: (id: string) => void
  onClear: () => void
  onExport: () => void
}

export default function ComparePanel({ models, compareIds, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts, t, onRemove, onClear, onExport }: Props) {
  const compared = compareIds.map((slug) => models.find((m) => m.slug === slug)).filter((m): m is Model => m != null)

  // A value shown in a comparison row counts as an estimate when any of the fields or
  // derived metrics backing it were imputed. Shared by the benchmark and cost rows.
  const isRowEstimated = (row: Row, m: Model): boolean =>
    (row.estField ? isFieldEstimated(m, row.estField) : false) ||
    (row.estMetric ? isEstimated(m, row.estMetric, valueScoreBase) : false) ||
    (row.costView ? isCostEstimated(m, row.costView) : false)

  const bestSlug = (row: Row): string | null => {
    let best: { slug: string; v: number } | null = null
    for (const m of compared) {
      const v = row.value(m)
      if (v == null) continue
      if (!best || (row.higherIsBetter ? v > best.v : v < best.v)) best = { slug: m.slug, v }
    }
    return best?.slug ?? null
  }

  const costRows: Row[] = [
    { labelKey: 'input', higherIsBetter: false, value: (m) => m.inputPerM, format: (v) => formatUsd(v), estField: 'inputPerM' },
    { labelKey: 'output', higherIsBetter: false, value: (m) => m.outputPerM, format: (v) => formatUsd(v), estField: 'outputPerM' },
    { labelKey: 'cache', higherIsBetter: false, value: (m) => m.cacheReadPerM, format: (v) => formatUsd(v), estField: 'cacheReadPerM' },
    { labelKey: 'blended', higherIsBetter: false, value: (m) => costOf(m, costView, taskInput, taskOutput), format: (v) => formatUsd(v), costView },
    { labelKey: 'valueScore', higherIsBetter: true, value: (m) => computeMetric(m, 'valueScore', costView, taskInput, taskOutput, valueScoreBase), format: (v) => formatMetric('valueScore', v), estMetric: 'valueScore' },
    { labelKey: 'speedAdjustedScore', higherIsBetter: true, value: (m) => computeMetric(m, 'speedAdjustedScore', costView, taskInput, taskOutput), format: (v) => formatMetric('speedAdjustedScore', v), estMetric: 'speedAdjustedScore' },
    { labelKey: 'contextValue', higherIsBetter: true, value: (m) => computeMetric(m, 'contextValue', costView, taskInput, taskOutput), format: (v) => formatMetric('contextValue', v), estMetric: 'contextValue' },
    { labelKey: 'efficiencyScore', higherIsBetter: true, value: (m) => computeMetric(m, 'efficiencyScore', costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts), format: (v) => formatMetric('efficiencyScore', v), estMetric: 'efficiencyScore' },
  ]

  return (
    <section className="compare-panel">
      <div className="table-head">
        <h2>{t.compareTitle} {compared.length > 0 && `(${compared.length})`}</h2>
        <div className="compare-actions">
          <button className="btn" onClick={onExport} disabled={compared.length === 0}>⬇ {t.exportCompare}</button>
          <button className="btn btn-danger" onClick={onClear} disabled={compared.length === 0}>🗑 {t.clearCompare}</button>
        </div>
      </div>
      {compared.length === 0 ? (
        <p className="muted">{t.noComparison}</p>
      ) : (
        <div className="table-wrap">
          <table className="model-table compare-table">
            <thead>
              <tr>
                <th></th>
                {compared.map((m) => (
                  <th key={m.slug}>
                    {m.aaName}
                    <button className="btn compare-remove" title={t.removeFromCompare} onClick={() => onRemove(m.slug)}>✕</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="muted">{t.family}</td>
                {compared.map((m) => <td key={m.slug}>{m.family}</td>)}
              </tr>
              <tr>
                <td className="muted">{t.release}</td>
                {compared.map((m) => <td key={m.slug}>{m.released ?? '—'}</td>)}
              </tr>
              <tr>
                <td className="muted">{t.reasoning}</td>
                {compared.map((m) => <td key={m.slug}>{m.isReasoning ? t.reasoning : t.notReasoning}</td>)}
              </tr>
              <tr>
                <td className="muted">{t.openWeights}</td>
                {compared.map((m) => <td key={m.slug}>{m.openWeights ? t.openWeights : t.closedWeights}</td>)}
              </tr>
              <tr className="compare-section"><td colSpan={compared.length + 1}>{t.benchmark}</td></tr>
              {BENCHMARK_ROWS.map((row) => {
                const winner = bestSlug(row)
                return (
                  <tr key={String(row.labelKey)}>
                    <td className="muted">{t[row.labelKey] as string}</td>
                    {compared.map((m) => {
                      const est = isRowEstimated(row, m)
                      return (
                        <td key={m.slug} className={`${winner === m.slug ? 'compare-best' : ''} ${est ? 'est' : ''}`} title={winner === m.slug ? t.rank : est ? t.estimated : undefined}>
                          {est ? '≈ ' : ''}{row.format(row.value(m))}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr className="compare-section"><td colSpan={compared.length + 1}>{t.costEfficiency}</td></tr>
              {costRows.map((row) => {
                const winner = bestSlug(row)
                return (
                  <tr key={String(row.labelKey)}>
                    <td className="muted">{t[row.labelKey] as string}</td>
                    {compared.map((m) => {
                      const est = isRowEstimated(row, m)
                      return (
                        <td key={m.slug} className={`${winner === m.slug ? 'compare-best' : ''} ${est ? 'est' : ''}`} title={winner === m.slug ? t.rank : est ? t.estimated : undefined}>
                          {est ? '≈ ' : ''}{row.format(row.value(m))}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

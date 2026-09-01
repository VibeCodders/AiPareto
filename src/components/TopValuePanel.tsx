import { useMemo, useState } from 'react'
import type { CostView, MetricKey, Model, ValueScoreBase } from '../types'
import { budgetedPareto, costUnitLabel, formatMetric, formatUsd, topValueByBudget, type EfficiencyOpts } from '../pareto'
import { isCostEstimated, isEstimated } from '../estimation'
import { exportModelsCsv } from '../csv'
import type { T } from '../i18n'

interface Props {
  items: Model[]
  metric: MetricKey
  costView: CostView
  taskInput: number
  taskOutput: number
  valueScoreBase: ValueScoreBase
  efficiencyOpts: EfficiencyOpts
  t: T
  /** Opens the model card for a pick. */
  onSelect: (id: string) => void
  /** Per-unit cost cap (controlled from the URL so it's shareable). */
  budget: number
  onBudgetChange: (n: number) => void
  /** Adds the given model slugs to the compare set. */
  onCompare: (ids: string[]) => void
}

const MAX_ROWS = 8

/**
 * "Best value per budget": within a per-unit cost cap (on the selected cost view), list
 * the models/subscriptions with the best valueScore, reusing the shared Pareto engine to
 * mark which picks are not dominated inside the budget.
 */
export default function TopValuePanel({ items, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts, t, onSelect, budget, onBudgetChange, onCompare }: Props) {
  const [sortBy, setSortBy] = useState<'value' | 'score'>('value')

  const unit = costUnitLabel(costView)

  const rows = useMemo(
    () => topValueByBudget(items, costView, taskInput, taskOutput, metric, valueScoreBase, efficiencyOpts, budget, MAX_ROWS, sortBy),
    [items, costView, taskInput, taskOutput, metric, valueScoreBase, efficiencyOpts, budget, sortBy],
  )

  const { frontierSlugs, costToNext } = useMemo(
    () => budgetedPareto(items, costView, taskInput, taskOutput, budget, valueScoreBase),
    [items, costView, taskInput, taskOutput, budget, valueScoreBase],
  )

  return (
    <section className="top-value-panel">
      <div className="table-head">
        <h2>{t.topValueTitle}</h2>
        <div className="compare-actions">
          <label className="task-inputs">
            {t.topValueBudget} ({unit})
            <input
              type="number"
              min={0}
              step={5}
              value={budget}
              onChange={(e) => onBudgetChange(Math.max(0, Number(e.target.value)))}
            />
          </label>
          <button className="btn" disabled={rows.length === 0} onClick={() => onCompare(rows.map((r) => r.model.slug))}>
            ＋ {t.topValueCompare}
          </button>
          <button
            className="btn"
            disabled={rows.length === 0}
            onClick={() =>
              exportModelsCsv(rows.map((r) => r.model), costView, taskInput, taskOutput, t, `budget=${budget}${unit}`, '-top')
            }
          >
            ⬇ {t.exportCsv}
          </button>
          <div className="seg" role="group" aria-label={t.topValueSort}>
            <button className={sortBy === 'value' ? 'on' : ''} onClick={() => setSortBy('value')}>{t.topValueByValue}</button>
            <button className={sortBy === 'score' ? 'on' : ''} onClick={() => setSortBy('score')}>{t.topValueByScore}</button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted">{t.topValueEmpty}</p>
      ) : (
        <div className="table-wrap">
          <table className="model-table top-value-table">
            <thead>
              <tr>
                <th className="num">{t.rank}</th>
                <th>{t.model}</th>
                <th>{t.family}</th>
                <th className="num">{t.cost}</th>
                <th className="num">{t.frontierCostGap}</th>
                <th className="num">{t.score}</th>
                <th className="num">{t.valueScore}</th>
                <th className="num">{t.efficiencyScore}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const estCost = isCostEstimated(r.model, costView)
                const est = estCost || isEstimated(r.model, metric, valueScoreBase)
                return (
                  <tr
                    key={r.model.slug}
                    className={frontierSlugs.has(r.model.slug) ? 'row-frontier' : ''}
                    title={t.details}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelect(r.model.slug)}
                  >
                    <td className="num">{i + 1}</td>
                    <td className="bold">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {frontierSlugs.has(r.model.slug) && <span className="sub-badge" title={t.frontier}>★</span>}
                        {r.model.isSubscription && <span className="sub-badge" title={r.model.subscription?.rateLimitDesc}>PLAN</span>}
                        <span>{r.model.isSubscription ? r.model.name : r.model.aaName}</span>
                      </div>
                    </td>
                    <td className="num muted">{r.model.family}</td>
                    <td className={`num ${estCost ? 'est' : ''}`} title={estCost ? t.estimated : undefined}>
                      {estCost ? '≈ ' : ''}{formatUsd(r.cost)}{unit}
                    </td>
                    <td className="num" title={(() => {
                      const step = costToNext.get(r.model.slug)
                      if (step == null) return t.frontierCostGap
                      return `${t.frontierCostGap}: ${step.target.aaName}`
                    })()}>
                      {(() => {
                        const step = costToNext.get(r.model.slug)
                        if (step == null) return '—'
                        return `${step.pct >= 0 ? '+' : '−'}${Math.round(Math.abs(step.pct))}%`
                      })()}
                    </td>
                    <td className={`num ${est ? 'est' : ''}`} title={est ? t.estimated : undefined}>
                      {est ? '≈ ' : ''}{formatMetric(metric, r.score)}
                    </td>
                    <td className={`num bold ${est ? 'est' : ''}`} title={est ? t.estimated : undefined}>
                      {est ? '≈ ' : ''}{formatMetric('valueScore', r.value)}
                    </td>
                    <td className={`num ${est ? 'est' : ''}`} title={est ? t.estimated : undefined}>
                      {r.efficiency != null ? `${est ? '≈ ' : ''}${formatMetric('efficiencyScore', r.efficiency)}` : '—'}
                    </td>
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
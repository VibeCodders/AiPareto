import { useMemo, useState } from 'react'
import type { CostView, MetricKey, Model, ValueScoreBase } from '../types'
import { formatMetric, formatUsd, frontierSlugsWithinBudget, topValueByBudget, type EfficiencyOpts } from '../pareto'
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
}

const DEFAULT_BUDGET = 40
const MAX_ROWS = 8

/**
 * "Best value per budget": within a per-unit cost cap (on the selected cost view), list
 * the models/subscriptions with the best valueScore, reusing the shared Pareto engine to
 * mark which picks are not dominated inside the budget.
 */
export default function TopValuePanel({ items, metric, costView, taskInput, taskOutput, valueScoreBase, efficiencyOpts, t }: Props) {
  const [budget, setBudget] = useState(DEFAULT_BUDGET)
  const [sortBy, setSortBy] = useState<'value' | 'score'>('value')

  const unit = costView === 'task' ? '/task' : '/1M'

  const rows = useMemo(() => {
    const picks = topValueByBudget(items, costView, taskInput, taskOutput, metric, valueScoreBase, efficiencyOpts, budget, MAX_ROWS)
    if (sortBy === 'score') picks.sort((a, b) => b.score - a.score)
    return picks
  }, [items, costView, taskInput, taskOutput, metric, valueScoreBase, efficiencyOpts, budget, sortBy])

  const frontierSlugs = useMemo(
    () => frontierSlugsWithinBudget(items, costView, taskInput, taskOutput, budget, valueScoreBase),
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
              onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
            />
          </label>
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
                <th className="num">{t.score}</th>
                <th className="num">{t.valueScore}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.model.slug} className={frontierSlugs.has(r.model.slug) ? 'row-frontier' : ''}>
                  <td className="num">{i + 1}</td>
                  <td className="bold">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {frontierSlugs.has(r.model.slug) && <span className="sub-badge" title={t.frontier}>★</span>}
                      {r.model.isSubscription && <span className="sub-badge" title={r.model.subscription?.rateLimitDesc}>PLAN</span>}
                      <span>{r.model.isSubscription ? r.model.name : r.model.aaName}</span>
                    </div>
                  </td>
                  <td className="num muted">{r.model.family}</td>
                  <td className="num">{formatUsd(r.cost)}{unit}</td>
                  <td className="num">{formatMetric(metric, r.score)}</td>
                  <td className="num bold">{formatMetric('valueScore', r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
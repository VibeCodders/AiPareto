import { useMemo } from 'react'
import type { Point } from '../types'
import { computeFrontier, formatUsd } from '../pareto'
import { FRONTIER_COLOR } from './ParetoChart'
import { bestValuePoint, budgetFrontierScale, frontierStepPath } from '../budgetFrontier'
import { displayNameOf } from '../modelMeta'
import type { T } from '../i18n'

interface Props {
  /** All in-budget cost×valueScore points (from budgetedPareto). */
  points: Point[]
  /** The per-unit budget cap (drawn as a vertical line). */
  budget: number
  /** Unit suffix for the cost axis (e.g. '/1M'). */
  unit: string
  t: T
  /** Opens the model card for a point. */
  onSelect: (slug: string) => void
}

const W = 320
const H = 96

/**
 * Miniature of the main Pareto chart scoped to the top-value budget: X = per-unit
 * cost (log), Y = valueScore, with the in-budget value frontier stepped in amber,
 * a dashed line for the budget cap, and the best-value pick ringed. Points are
 * clickable and open the model card, and native <title> tooltips show name/cost/value.
 */
export default function BudgetSparkline({ points, budget, unit, t, onSelect }: Props) {
  const frontier = useMemo(() => computeFrontier(points, false, true), [points])
  const frontierSlugs = useMemo(() => new Set(frontier.map((p) => p.model.slug)), [frontier])
  const scale = useMemo(() => budgetFrontierScale(points, budget, W, H), [points, budget])
  const best = useMemo(() => bestValuePoint(points), [points])
  const path = frontierStepPath(frontier, scale)

  if (points.length === 0) return null

  return (
    <div className="budget-sparkline">
      <div className="chart-legend">
        {t.budgetFrontierTitle}
        <span className="legend-muted">— {t.budgetFrontierHint}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={t.budgetFrontierTitle}>
        {/* Baseline and plot frame */}
        <line x1={0} y1={H - 1} x2={W} y2={H - 1} stroke="var(--grid)" strokeWidth={1} />
        {scale.budgetX != null && (
          <g>
            <line x1={scale.budgetX} y1={0} x2={scale.budgetX} y2={H} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={Math.min(scale.budgetX + 4, W - 2)} y={11} fontSize={9} fill="var(--accent)">
              {t.topValueBudget}
            </text>
          </g>
        )}
        {/* Value frontier step line */}
        {path && <path d={path} fill="none" stroke={FRONTIER_COLOR} strokeWidth={1.6} strokeLinejoin="round" />}
        {/* In-budget points: amber diamonds for frontier picks, muted dots otherwise; squares for subscriptions */}
        {points.map((p) => {
          const cx = scale.x(p.x)
          const cy = scale.y(p.score)
          const isFrontier = frontierSlugs.has(p.model.slug)
          const isBest = best?.model.slug === p.model.slug
          const r = isFrontier ? 3.4 : 2.1
          const label = `${displayNameOf(p.model)} · ${formatUsd(p.x)}${unit} · ${t.valueScore} ${p.score.toFixed(1)}`
          return (
            <g key={p.model.slug} onClick={() => onSelect(p.model.slug)} style={{ cursor: 'pointer' }}>
              <title>{label}</title>
              {isBest && <circle cx={cx} cy={cy} r={r + 3.4} fill="none" stroke="var(--accent)" strokeWidth={1.3} />}
              {p.model.isSubscription ? (
                <rect
                  x={cx - r}
                  y={cy - r}
                  width={r * 2}
                  height={r * 2}
                  fill={isFrontier ? FRONTIER_COLOR : 'var(--text-muted)'}
                  opacity={isFrontier ? 1 : 0.75}
                />
              ) : (
                <circle cx={cx} cy={cy} r={r} fill={isFrontier ? FRONTIER_COLOR : 'var(--text-muted)'} opacity={isFrontier ? 1 : 0.75} />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

import type { Point } from './types'

/**
 * Pure geometry for the "value frontier within budget" sparkline shown under the
 * top-value panel. All math lives here (no React, no SVG) so it is unit-testable:
 * a log-X / linear-Y scale that always keeps the budget cap visible, the frontier
 * step path, and the best-value pick detection.
 */

export interface BudgetFrontierScale {
  /** Maps a per-unit cost to an X pixel inside the plot area. */
  x: (cost: number) => number
  /** Maps a valueScore to a Y pixel (larger value = higher on screen). */
  y: (value: number) => number
  /** X pixel of the budget cap line (null when the budget is 0/uncapped). */
  budgetX: number | null
  /** Data-space bounds actually used, exposed for tests/debugging. */
  domain: { minCost: number; maxCost: number; maxValue: number }
}

/**
 * Logarithmic-X / linear-Y scale for the sparkline. The X domain always includes
 * the budget cap (so the cap line stays visible even when few points are inside),
 * and falls back to a small default domain when there is nothing to plot.
 */
export function budgetFrontierScale(points: Point[], budget: number, width: number, height: number, padX = 12, padY = 10): BudgetFrontierScale {
  const costs = points.map((p) => p.x).filter((c): c is number => Number.isFinite(c) && c > 0)
  const values = points.map((p) => p.score).filter((v): v is number => Number.isFinite(v) && v > 0)
  const fallbackMax = budget > 0 ? budget : 10
  let minCost = costs.length > 0 ? Math.min(...costs) : budget > 0 ? budget : 1
  let maxCost = costs.length > 0 ? Math.max(...costs) : fallbackMax
  maxCost = Math.max(maxCost, budget)
  if (maxCost <= minCost) maxCost = minCost * 10
  const maxValue = values.length > 0 ? Math.max(...values) : 1
  const plotW = Math.max(1, width - 2 * padX)
  const plotH = Math.max(1, height - 2 * padY)
  const logMin = Math.log10(minCost)
  const logSpan = Math.log10(maxCost) - logMin || 1
  const x = (cost: number) => padX + ((Math.log10(Math.max(cost, minCost)) - logMin) / logSpan) * plotW
  const y = (value: number) => padY + (1 - value / maxValue) * plotH
  return {
    x,
    y,
    budgetX: budget > 0 ? x(budget) : null,
    domain: { minCost, maxCost, maxValue },
  }
}

/**
 * SVG path for the value frontier as a step line (horizontal to the next point's
 * X, then vertical to its value — the same "step after" shape as the main chart).
 * Frontier points must be cost×valueScore pairs; they are sorted by cost here.
 */
export function frontierStepPath(frontier: Point[], s: BudgetFrontierScale): string {
  const sorted = [...frontier].sort((a, b) => a.x - b.x)
  if (sorted.length === 0) return ''
  let d = `M ${s.x(sorted[0].x).toFixed(2)} ${s.y(sorted[0].score).toFixed(2)}`
  for (let i = 1; i < sorted.length; i++) {
    d += ` L ${s.x(sorted[i].x).toFixed(2)} ${s.y(sorted[i - 1].score).toFixed(2)} L ${s.x(sorted[i].x).toFixed(2)} ${s.y(sorted[i].score).toFixed(2)}`
  }
  return d
}

/** The in-budget point with the highest valueScore (the best value pick), or null. */
export function bestValuePoint(points: Point[]): Point | null {
  let best: Point | null = null
  for (const p of points) {
    if (best == null || p.score > best.score) best = p
  }
  return best
}

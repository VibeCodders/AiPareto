import type { CostView, EfficiencyWeights, MetricKey, Model, Point, ValueScoreBase } from './types'

export function costOf(m: Model, view: CostView, taskInput = 3000, taskOutput = 1000): number | null {
  if (m.isSubscription && m.effectiveCostPerM != null) {
    if (view === 'task') {
      return ((taskInput + taskOutput) / 1e6) * m.effectiveCostPerM
    }
    return m.effectiveCostPerM
  }

  switch (view) {
    case 'input':
      return m.inputPerM
    case 'output':
      return m.outputPerM
    case 'cache':
      return m.cacheReadPerM ?? m.inputPerM
    case 'blended': {
      const i = m.inputPerM
      const o = m.outputPerM
      if (i != null && o != null) return 0.8 * i + 0.2 * o
      if (i != null) return i
      if (o != null) return o
      return null
    }
    case 'task': {
      const i = m.inputPerM
      const o = m.outputPerM
      if (i != null && o != null) return (taskInput / 1e6) * i + (taskOutput / 1e6) * o
      if (i != null) return (taskInput / 1e6) * i
      if (o != null) return (taskOutput / 1e6) * o
      return null
    }
  }
}

/**
 * Blended 80/20 input/output cost (USD per 1M tokens) from a model's own raw prices.
 * Unlike costOf(m, 'blended') this ignores the subscription shortcut and always uses
 * the model's input/output fields — so it stays identical whether pricing is pay-as-you-go
 * or derived for a subscription. Returns null when either price is missing.
 */
export function blendedCostOf(m: Model): number | null {
  const i = m.inputPerM
  const o = m.outputPerM
  if (i != null && o != null) return 0.8 * i + 0.2 * o
  return null
}


/** Benchmark score per dollar. Defaults to Intelligence Index; pass another benchmark to get e.g. coding-per-$ or agentic-per-$. */
export function valueScoreOf(
  m: Model,
  costView: CostView,
  taskInput = 3000,
  taskOutput = 1000,
  baseMetric: 'intelligenceIndex' | 'codingIndex' | 'agenticIndex' = 'intelligenceIndex',
): number | null {
  const cost = costOf(m, costView, taskInput, taskOutput)
  if (cost == null || cost <= 0) return null
  const score = m[baseMetric]
  if (score == null) return null
  return score / cost
}

/** Intelligence per second of latency — rewards models that are both smart and responsive. */
export function speedAdjustedScoreOf(m: Model): number | null {
  const score = m.intelligenceIndex
  const latency = m.latencySeconds
  if (score == null || latency == null || latency <= 0) return null
  return score / latency
}

/** Context tokens available per dollar of input price — rewards cheap, large context windows. */
export function contextValueOf(m: Model): number | null {
  const ctx = m.contextTokens
  const price = m.inputPerM
  if (ctx == null || price == null || price <= 0) return null
  return ctx / price
}

/** Normalization reference (the max each component can reach across the current dataset), used by efficiencyScoreOf. */
export interface EfficiencyNorm {
  value: number
  speed: number
  context: number
}

export interface EfficiencyOpts {
  weights: EfficiencyWeights
  norm: EfficiencyNorm
}

/**
 * Blends value/$, speed-adjusted intelligence, and context/$ into a single 0-100 score.
 * Each component is normalized against the best value reached in the current dataset (norm),
 * then combined as a weighted average — components a model has no data for are simply excluded.
 */
export function efficiencyScoreOf(m: Model, costView: CostView, taskInput: number, taskOutput: number, opts: EfficiencyOpts): number | null {
  const { weights, norm } = opts
  const value = valueScoreOf(m, costView, taskInput, taskOutput)
  const speed = speedAdjustedScoreOf(m)
  const context = contextValueOf(m)
  const parts: Array<[number, number]> = []
  if (value != null && norm.value > 0 && weights.value > 0) parts.push([(value / norm.value) * 100, weights.value])
  if (speed != null && norm.speed > 0 && weights.speed > 0) parts.push([(speed / norm.speed) * 100, weights.speed])
  if (context != null && norm.context > 0 && weights.context > 0) parts.push([(context / norm.context) * 100, weights.context])
  if (parts.length === 0) return null
  const totalWeight = parts.reduce((s, [, w]) => s + w, 0)
  if (totalWeight <= 0) return null
  return parts.reduce((s, [v, w]) => s + v * w, 0) / totalWeight
}

/** Resolves any MetricKey to a number for a model, computing derived metrics on the fly. */
export function computeMetric(
  m: Model,
  metric: MetricKey,
  costView: CostView,
  taskInput = 3000,
  taskOutput = 1000,
  valueScoreBase: ValueScoreBase = 'intelligenceIndex',
  efficiencyOpts?: EfficiencyOpts,
): number | null {
  switch (metric) {
    case 'valueScore':
      return valueScoreOf(m, costView, taskInput, taskOutput, valueScoreBase)
    case 'speedAdjustedScore':
      return speedAdjustedScoreOf(m)
    case 'contextValue':
      return contextValueOf(m)
    case 'efficiencyScore':
      return efficiencyOpts ? efficiencyScoreOf(m, costView, taskInput, taskOutput, efficiencyOpts) : null
    default:
      return m[metric]
  }
}

/**
 * How far a point sits behind the Pareto frontier at an equal-or-better X value, as a percentage
 * of the frontier's score. 0% means the point is on the frontier; higher means further behind.
 * Returns null if no frontier point at an equal-or-better X exists (point is better than the whole frontier).
 */
export function frontierDeltaOf(point: Point, frontierSortedByX: Point[], lowerIsBetter: boolean, xLowerIsBetter = true): number | null {
  let ref: Point | undefined
  // The frontier is always sorted by ascending X. "Equal-or-better X" depends on the axis
  // direction: for costs (cheaper is better) it's the frontier point with the largest X not
  // exceeding the point's own; for a higher-is-better metric it's the smallest X at least the point's own.
  if (xLowerIsBetter) {
    for (const f of frontierSortedByX) {
      if (f.x <= point.x) ref = f
      else break
    }
  } else {
    for (const f of frontierSortedByX) {
      if (f.x >= point.x) {
        ref = f
        break
      }
    }
  }
  if (!ref || ref.score === 0) return null
  if (ref.model.slug === point.model.slug) return 0
  return lowerIsBetter ? ((point.score - ref.score) / ref.score) * 100 : ((ref.score - point.score) / ref.score) * 100
}

/** Whether point `a` Pareto-dominates `b` on the current X (cost or metric) and Y axes. */
export function dominates(a: Point, b: Point, lowerIsBetter: boolean, xLowerIsBetter: boolean): boolean {
  const xAtLeast = xLowerIsBetter ? a.x <= b.x : a.x >= b.x
  const yAtLeast = lowerIsBetter ? a.score <= b.score : a.score >= b.score
  const xBetter = xLowerIsBetter ? a.x < b.x : a.x > b.x
  const yBetter = lowerIsBetter ? a.score < b.score : a.score > b.score
  return xAtLeast && yAtLeast && (xBetter || yBetter)
}

export function formatDelta(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v <= 0.05) return '★ 0%'
  return `-${v.toFixed(0)}%`
}

/**
 * Pareto-optimal points: a point is on the frontier if no other point has
 * an X value at least as good AND a better score (>= for higher-is-better metrics,
 * <= for lower-is-better ones like latency), with at least one strict.
 * `xLowerIsBetter` is true when the X axis is a cost (cheaper is better); for metrics
 * like context where more is better it is false.
 * Returns the frontier sorted by ascending X.
 */
export function computeFrontier(points: Point[], lowerIsBetter = false, xLowerIsBetter = true): Point[] {
  // Drop exact duplicates (same X and score)
  const seen = new Set<string>()
  const unique: Point[] = []
  for (const p of points) {
    const key = `${p.x}|${p.score}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(p)
  }
  // Scan from the best X end so the running "best score so far" is always admissible;
  // reverse at the end so the returned frontier is ascending in X regardless.
  unique.sort((a, b) => (xLowerIsBetter ? a.x - b.x : b.x - a.x) || (lowerIsBetter ? a.score - b.score : b.score - a.score))
  const frontier: Point[] = []
  let best = lowerIsBetter ? Infinity : -Infinity
  for (const p of unique) {
    const better = lowerIsBetter ? p.score < best : p.score > best
    if (better) {
      frontier.push(p)
      best = p.score
    }
  }
  return xLowerIsBetter ? frontier : frontier.reverse()
}

/** Round up to a "nice" axis max (1/2/2.5/5/7.5 × 10^n) so ticks look clean. */
export function niceCeil(v: number): number {
  if (v <= 1) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const m = v / base
  if (m <= 1) return base
  if (m <= 2) return 2 * base
  if (m <= 2.5) return 2.5 * base
  if (m <= 5) return 5 * base
  if (m <= 7.5) return 7.5 * base
  return 10 * base
}

/** Format a metric value depending on its kind (units / decimals). */
export function formatMetric(metric: MetricKey, v: number | null | undefined): string {
  if (v == null) return '—'
  switch (metric) {
    case 'contextTokens':
      return formatTokens(v)
    case 'outputSpeed':
      return `${Math.round(v)} tok/s`
    case 'latencySeconds':
      return `${v.toFixed(1)}s`
    case 'contextValue':
      return `${formatTokens(v)}/$`
    case 'efficiencyScore':
      return v.toFixed(0)
    case 'arenaElo':
      return String(Math.round(v))
    default:
      return v.toFixed(1)
  }
}

/** Compact formatter for Y-axis ticks (no units, few decimals). */
export function formatAxisTick(metric: MetricKey, v: number): string {
  switch (metric) {
    case 'contextTokens':
      return formatTokens(v)
    case 'outputSpeed':
      return String(Math.round(v))
    case 'latencySeconds':
      return v.toFixed(1)
    case 'contextValue':
      return formatTokens(v)
    default:
      return String(Math.round(v))
  }
}

export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value == null) return '—'
  if (value >= 100) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (value >= 10) return `$${value.toFixed(1)}`
  if (value >= 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(digits)}`
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

export function formatParams(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1e12) return `${(n / 1e12).toFixed(n >= 10e12 ? 0 : 1)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 10e9 ? 0 : 1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

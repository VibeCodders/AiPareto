import type { CostView, MetricKey, Model, Point } from './types'

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
      if (i == null || o == null) return null
      return 0.8 * i + 0.2 * o
    }
    case 'task': {
      const i = m.inputPerM
      const o = m.outputPerM
      if (i == null || o == null) return null
      return (taskInput / 1e6) * i + (taskOutput / 1e6) * o
    }
  }
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

/** Resolves any MetricKey to a number for a model, computing derived metrics on the fly. */
export function computeMetric(m: Model, metric: MetricKey, costView: CostView, taskInput = 3000, taskOutput = 1000): number | null {
  switch (metric) {
    case 'valueScore':
      return valueScoreOf(m, costView, taskInput, taskOutput)
    case 'speedAdjustedScore':
      return speedAdjustedScoreOf(m)
    case 'contextValue':
      return contextValueOf(m)
    default:
      return m[metric]
  }
}

/**
 * Pareto-optimal points: a point is on the frontier if no other point has
 * cost <= its cost AND a better score (>= for higher-is-better metrics,
 * <= for lower-is-better ones like latency), with at least one strict.
 * Returns the frontier sorted by ascending cost.
 */
export function computeFrontier(points: Point[], lowerIsBetter = false): Point[] {
  // Drop exact duplicates (same cost and score)
  const seen = new Set<string>()
  const unique: Point[] = []
  for (const p of points) {
    const key = `${p.cost}|${p.score}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(p)
  }
  unique.sort((a, b) => a.cost - b.cost || (lowerIsBetter ? a.score - b.score : b.score - a.score))
  const frontier: Point[] = []
  let best = lowerIsBetter ? Infinity : -Infinity
  for (const p of unique) {
    const better = lowerIsBetter ? p.score < best : p.score > best
    if (better) {
      frontier.push(p)
      best = p.score
    }
  }
  return frontier
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

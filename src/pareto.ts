import type { MetricKey, Point } from './types'

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
  unique.sort((a, b) => a.cost - b.cost || b.score - a.score)
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

/** Round up to a "nice" axis max (1/2/5 × 10^n) so ticks look clean. */
export function niceCeil(v: number): number {
  if (v <= 1) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const m = v / base
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * base
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
    default:
      return v.toFixed(1)
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

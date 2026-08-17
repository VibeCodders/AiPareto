import type { Point } from './types'

/**
 * Pareto-optimal points: a point is on the frontier if no other point has
 * cost <= its cost AND score >= its score (with at least one strict).
 * Returns the frontier sorted by ascending cost (ascending score).
 */
export function computeFrontier(points: Point[]): Point[] {
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
  let bestScore = -Infinity
  for (const p of unique) {
    if (p.score > bestScore) {
      frontier.push(p)
      bestScore = p.score
    }
  }
  return frontier
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

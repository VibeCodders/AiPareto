import type { Model } from './types'

/**
 * Display helpers shared by the table, compare panel, top-value panel and chart:
 * name resolution and stable per-family colors. Keeps the naming/color rules in
 * one place so every surface shows the same label and the same color for a family.
 */

/** The name shown in tables and panels: the plan name for subscriptions, the full AA name otherwise. */
export function displayNameOf(m: Model): string {
  return m.isSubscription ? m.name : m.aaName
}

/** Short label used next to chart points: plan name for subscriptions, short model name otherwise. */
export function shortNameOf(m: Model): string {
  return m.isSubscription ? m.subscription?.name ?? m.name : m.name
}

const PALETTE = [
  '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#fb7185',
  '#2dd4bf', '#c084fc', '#f97316', '#4ade80', '#38bdf8', '#e879f9',
  '#a3e635', '#facc15', '#22d3ee', '#fda4af', '#93c5fd', '#86efac',
]

/** Stable per-family color derived from the family name (same color across the whole app). */
export function colorFor(family: string): string {
  let h = 0
  for (const ch of family) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

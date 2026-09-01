import type { Model } from './types'

/**
 * Shared "best value per row" logic used by the compare panel (winner highlighting) and
 * the model card (best-among-compared hint). A row is just a value extractor plus a
 * direction; this keeps the winner logic in one place so every consumer agrees on ties.
 */

/** The slugs holding the best value for a row across `models` (returns ALL tied winners). */
export function bestSlugsFor(
  models: Model[],
  higherIsBetter: boolean,
  value: (m: Model) => number | null,
): string[] {
  let best: number | null = null
  const slugs: string[] = []
  for (const m of models) {
    const v = value(m)
    if (v == null) continue
    if (best == null || (higherIsBetter ? v > best : v < best)) {
      best = v
      slugs.length = 0
      slugs.push(m.slug)
    } else if (v === best) {
      slugs.push(m.slug)
    }
  }
  return slugs
}

/** The single best slug for a row (first winner when tied). */
export function bestSlug(
  models: Model[],
  higherIsBetter: boolean,
  value: (m: Model) => number | null,
): string | null {
  return bestSlugsFor(models, higherIsBetter, value)[0] ?? null
}

/** Count of the given rows where `model` is the best among `models`. */
export function winCount(
  model: Model,
  models: Model[],
  rows: Array<{ higherIsBetter: boolean; value: (m: Model) => number | null }>,
): number {
  let wins = 0
  for (const row of rows) {
    if (bestSlugsFor(models, row.higherIsBetter, row.value).includes(model.slug)) wins++
  }
  return wins
}
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

/**
 * Static benchmark/community value rows (Artificial Analysis + HF/Arena) shared by the
 * compare panel's winner logic and the model card's win-count, so both agree on what
 * counts as a "metric" and on the better direction.
 */
export const BENCHMARK_VALUE_ROWS: Array<{ higherIsBetter: boolean; value: (m: Model) => number | null }> = [
  { higherIsBetter: true, value: (m) => m.intelligenceIndex },
  { higherIsBetter: true, value: (m) => m.codingIndex },
  { higherIsBetter: true, value: (m) => m.agenticIndex },
  { higherIsBetter: true, value: (m) => m.tau2 },
  { higherIsBetter: true, value: (m) => m.hle },
  { higherIsBetter: true, value: (m) => m.omniscience },
  { higherIsBetter: false, value: (m) => m.latencySeconds },
  { higherIsBetter: true, value: (m) => m.hfMMLU },
  { higherIsBetter: true, value: (m) => m.arenaElo },
  { higherIsBetter: true, value: (m) => m.arenaCodeElo },
  { higherIsBetter: true, value: (m) => m.benchlmScore },
]

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
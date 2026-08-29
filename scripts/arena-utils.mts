/**
 * Helpers for fetching and matching data from:
 *  - LMSYS Chatbot Arena (via api.wulong.dev) — ELO scores from human-preference battles.
 *  - BenchLM.ai — aggregated benchmark scores across categories.
 *
 * Both sources use model names that don't perfectly match AA slugs or OpenRouter ids,
 * so this module provides normalisation and fuzzy matching.
 */
import { norm } from './shared.mts'

// ---------------------------------------------------------------------------
// Arena (LMSYS Chatbot Arena) types and fetchers
// ---------------------------------------------------------------------------

export interface ArenaModel {
  rank: number
  model: string
  vendor: string | null
  license: string | null
  score: number | null
  ci: number | null
  votes: number | null
}

export interface ArenaLeaderboard {
  meta: {
    leaderboard: string
    source_url: string
    fetched_at: string
    last_updated: string
    model_count: number
  }
  models: ArenaModel[]
}

export interface ArenaData {
  text: ArenaLeaderboard | null
  code: ArenaLeaderboard | null
}

// ---------------------------------------------------------------------------
// BenchLM types and fetchers
// ---------------------------------------------------------------------------

export interface BenchLMModel {
  rank: number
  model: string
  creator: string
  sourceType: string
  overallScore: number | null
  categoryScores: Record<string, number | null>
  inputPrice: number | null
  outputPrice: number | null
}

export interface BenchLMLeaderboard {
  lastUpdated: string
  models: BenchLMModel[]
}

// ---------------------------------------------------------------------------
// Arena model-name normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise an Arena model name to a form comparable with AA slugs and OR ids.
 *
 * Arena names use dots for version numbers (e.g. "gemini-3.7-flash-high") and
 * parenthetical notes (e.g. "gpt-5.6-sol-xhigh (codex-harness)"), and sometimes
 * vendor-prefixed forms that need stripping.
 *
 * Examples:
 *   "claude-opus-5-high"         → "claude-opus-5-high"
 *   "gemini-3.7-flash-high"      → "gemini-3-7-flash-high"
 *   "gpt-5.6-sol-xhigh (codex-harness)" → "gpt-5-6-sol-xhigh"
 *   "qwen3.8-max"                → "qwen3-8-max"
 *   "deepseek-v4-pro-high-20260813" → "deepseek-v4-pro-high"
 */
export function normaliseArenaName(name: string): string {
  // Strip parenthetical notes
  let n = name.replace(/\s*\(.*?\)\s*/g, '').trim()
  // Lowercase
  n = n.toLowerCase()
  // Replace dots with dashes for version numbers (gemini-3.7 → gemini-3-7)
  n = n.replace(/(\d)\.(\d)/g, '$1-$2')
  // Remove trailing date suffixes (e.g. -20260813)
  n = n.replace(/-\d{8}$/, '')
  // Normalise via shared helper (lowercase, non-alphanum → dash)
  return norm(n)
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup from normalised Arena model name → ArenaModel for a leaderboard.
 */
export function buildArenaLookup(leaderboard: ArenaLeaderboard | null): Map<string, ArenaModel> {
  const map = new Map<string, ArenaModel>()
  if (!leaderboard) return map
  for (const m of leaderboard.models) {
    const key = normaliseArenaName(m.model)
    if (key && !map.has(key)) map.set(key, m)
  }
  return map
}

/**
 * Build a lookup from normalised model name → BenchLMModel.
 * BenchLM model names are display names (e.g. "Claude Opus 5", "GPT-5.6 Sol").
 */
export function buildBenchLMLookup(leaderboard: BenchLMLeaderboard | null): Map<string, BenchLMModel> {
  const map = new Map<string, BenchLMModel>()
  if (!leaderboard) return map
  for (const m of leaderboard.models) {
    // Use the display name directly normalised
    const key = norm(m.model)
    if (key && !map.has(key)) map.set(key, m)
  }
  return map
}

/**
 * Try to match a row's slug/name/id against an Arena lookup.
 * Tries multiple normalisation strategies:
 *   1. Direct slug match
 *   2. Match with effort suffix stripped (e.g. "claude-opus-5-high" → "claude-opus-5")
 *   3. Fuzzy substring match
 */
export function matchArenaModel(
  slug: string,
  aaName: string | undefined,
  orId: string | undefined,
  lookup: Map<string, ArenaModel>,
): ArenaModel | null {
  const candidates = [slug, aaName ?? '', orId?.split('/').slice(1).join('/') ?? ''].filter(Boolean)

  for (const c of candidates) {
    const n = normaliseArenaName(c)
    // 1. Exact match
    const exact = lookup.get(n)
    if (exact) return exact

    // 2. Strip effort suffix and retry
    const stripped = n.replace(/-(high|low|medium|xhigh|max|minimal|non-reasoning)$/, '')
    if (stripped !== n) {
      const strippedMatch = lookup.get(stripped)
      if (strippedMatch) return strippedMatch
    }
  }

  // 3. Fuzzy: find the best containment match
  const slugNorm = norm(slug)
  let bestMatch: ArenaModel | null = null
  let bestScore = 0
  for (const [key, model] of lookup) {
    // Check if slug contains key or key contains slug
    if (slugNorm.includes(key) || key.includes(slugNorm)) {
      const score = Math.min(slugNorm.length, key.length) / Math.max(slugNorm.length, key.length)
      if (score > bestScore) {
        bestScore = score
        bestMatch = model
      }
    }
  }
  if (bestMatch && bestScore >= 0.6) return bestMatch

  return null
}

/**
 * Try to match a row against a BenchLM lookup.
 * BenchLM uses display names like "Claude Opus 5" which need different matching
 * than slug-based lookups.
 */
export function matchBenchLMModel(
  slug: string,
  name: string | undefined,
  orId: string | undefined,
  lookup: Map<string, BenchLMModel>,
): BenchLMModel | null {
  // Try the display name first (most likely to match BenchLM)
  const nameNorm = name ? norm(name) : ''
  if (nameNorm) {
    const exact = lookup.get(nameNorm)
    if (exact) return exact

    // Try without parenthetical effort notes like "(Adaptive Reasoning, Max Effort)"
    const shortName = name!.replace(/\s*\(.*?\)\s*/g, '').trim()
    const shortNorm = norm(shortName)
    if (shortNorm !== nameNorm) {
      const shortMatch = lookup.get(shortNorm)
      if (shortMatch) return shortMatch
    }
  }

  // Try slug-based matching
  const slugNorm = norm(slug)
  const slugMatch = lookup.get(slugNorm)
  if (slugMatch) return slugMatch

  // Try OR id
  if (orId) {
    const orSlug = orId.split('/').slice(1).join('/')
    const orNorm = norm(orSlug)
    const orMatch = lookup.get(orNorm)
    if (orMatch) return orMatch
  }

  // Fuzzy: check containment
  for (const [key, model] of lookup) {
    if (slugNorm.includes(key) || key.includes(slugNorm)) {
      const score = Math.min(slugNorm.length, key.length) / Math.max(slugNorm.length, key.length)
      if (score >= 0.7) return model
    }
  }

  return null
}

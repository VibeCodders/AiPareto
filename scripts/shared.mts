export const UA = 'Mozilla/5.0 (compatible; ai-pareto-data-fetcher/0.1)'

export const CREATOR_WHITELIST = [
  'OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek', 'SpaceXAI', 'Alibaba',
  'Mistral', 'Amazon', 'NVIDIA', 'Z AI', 'MiniMax', 'StepFun', 'Tencent',
  'Baidu', 'ByteDance Seed', 'Cohere', 'AI21 Labs', 'Perplexity', 'Microsoft',
  'Naver', 'Xiaomi', 'Moonshot', 'Kimi', 'InclusionAI', 'Moonshot AI',
]

export const DEFAULT_TIMEOUT = 30_000
export const DEFAULT_RETRIES = 3
export const DEFAULT_RETRY_DELAY = 1_000
export const DEFAULT_LEADERBOARD_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const DEFAULT_DETAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

// ---------------------------------------------------------------------------
// Auto-matching helpers
// These let the data pipeline accept new models that aren't yet in the curated
// scripts/model-map.ts mapping. Missing benchmark/spec values are later filled
// by the similarity-based estimation in src/estimation.ts, so it is safe to
// ingest a model even when some fields are absent.
// ---------------------------------------------------------------------------

/** Provider-prefix → human-readable family name, used for OpenRouter-only models. */
export const OR_PROVIDER_FAMILY: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  'meta-llama': 'Meta',
  deepseek: 'DeepSeek',
  'x-ai': 'xAI',
  qwen: 'Alibaba',
  mistralai: 'Mistral',
  amazon: 'Amazon',
  nvidia: 'NVIDIA',
  'z-ai': 'Z AI',
  moonshotai: 'Moonshot',
  minimax: 'MiniMax',
  stepfun: 'StepFun',
  tencent: 'Tencent',
  cohere: 'Cohere',
  ai21: 'AI21 Labs',
  xiaomi: 'Xiaomi',
  inclusionai: 'InclusionAI',
  thinkingmachines: 'Thinking Machines',
}

/** Derive a family name from an OpenRouter model id (e.g. "anthropic/claude-opus-5" → "Anthropic"). */
export function familyFromORId(id: string): string | null {
  const parts = id.split('/')
  if (parts.length < 2) return null
  const provider = parts[0].toLowerCase()
  return OR_PROVIDER_FAMILY[provider] ?? (provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : null)
}

/** Normalise a slug/id for fuzzy comparison (lowercase, non-alphanumerics → single dash). */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Try to auto-match an Artificial Analysis slug to an OpenRouter model id
 * by normalised name similarity. Returns the best match or null.
 *
 * Strategy:
 *  1. Exact normalised match (e.g. `claude-opus-5` ↔ `anthropic/claude-opus-5`).
 *  2. One-direction substring match (the shorter slug is a substring of the longer).
 */
export function autoMatchSlug(slug: string, orIds: string[]): string | null {
  const n = norm(slug)

  // 1. Exact normalised match
  for (const id of orIds) {
    const orSlug = id.split('/').slice(1).join('/')
    if (norm(orSlug) === n) return id
  }

  // 2. Contains-based match (one direction contains the other).
  //    Collect all candidates then prefer the shortest id (most specific match).
  const candidates: string[] = []
  for (const id of orIds) {
    const orSlug = id.split('/').slice(1).join('/')
    const nn = norm(orSlug)
    if (nn.includes(n) || n.includes(nn)) {
      candidates.push(id)
    }
  }
  if (candidates.length === 0) return null

  // Prefer the candidate whose slug has the smallest length difference to the query.
  candidates.sort((a, b) => {
    const an = norm(a.split('/').slice(1).join(''))
    const bn = norm(b.split('/').slice(1).join(''))
    return Math.abs(an.length - n.length) - Math.abs(bn.length - n.length)
  })
  return candidates[0]
}

/**
 * Reverse auto-match: try to find an AA slug for a given OpenRouter id.
 * Returns the slug if a match is found, null otherwise.
 */
export function autoMatchORId(orId: string, aaSlugs: string[]): string | null {
  const orSlug = orId.split('/').slice(1).join('/')
  const n = norm(orSlug)

  for (const slug of aaSlugs) {
    if (norm(slug) === n) return slug
  }

  const candidates = aaSlugs.filter((s) => {
    const sn = norm(s)
    return sn.includes(n) || n.includes(sn)
  })
  if (candidates.length === 0) return null

  candidates.sort((a, b) => Math.abs(norm(a).length - n.length) - Math.abs(norm(b).length - n.length))
  return candidates[0]
}

/** True for providers whose models are broadly known to be open-weights. */
const OPEN_WEIGHTS_PROVIDERS = new Set([
  'meta-llama', 'deepseek', 'qwen', 'mistralai', 'google',
])

/** Best-effort open-weights classification for an OpenRouter model id. */
export function openWeightsFromORId(id: string): boolean {
  const provider = id.split('/')[0].toLowerCase()
  return OPEN_WEIGHTS_PROVIDERS.has(provider)
}

/** Best-effort isReasoning classification for an OpenRouter model id, based on name heuristics. */
export function isReasoningFromORName(name: string, id: string): boolean {
  const text = `${name} ${id}`.toLowerCase()
  return /reason|think|o1|o3|o4|gpt-5-6/.test(text)
}


export async function get(
  url: string,
  opts: { headers?: Record<string, string>; timeout?: number; retries?: number; retryDelay?: number } = {},
): Promise<string> {
  const { headers = {}, timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, retryDelay = DEFAULT_RETRY_DELAY } = opts
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...headers },
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const err = new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
        // Retry only on rate-limits / server errors. 4xx (except 429) are
        // permanent, so fail fast instead of burning the remaining attempts.
        if (isRetryable(res.status) && attempt < retries) {
          await backoff(attempt, retryDelay)
          continue
        }
        throw err
      }
      return await res.text()
    } catch (e) {
      lastError = e as Error
      // Network/DNS/timeout/abort errors are transient: retry them all.
      if (attempt < retries) await backoff(attempt, retryDelay)
    }
  }
  throw lastError ?? new Error(`GET ${url} failed after ${retries} attempts`)
}

async function backoff(attempt: number, retryDelay: number): Promise<void> {
  const base = retryDelay * Math.pow(2, attempt - 1)
  const jitter = Math.random() * base * 0.5
  await new Promise((r) => setTimeout(r, base + jitter))
}

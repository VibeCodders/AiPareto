import fs from 'node:fs'
import path from 'node:path'
import { get } from './shared.mts'

export interface LiteLLMModel {
  id: string
  provider: string
  inputPerM: number | null
  outputPerM: number | null
  maxInputTokens: number | null
  maxOutputTokens: number | null
  maxTokens: number | null
  mode: string
}

const LITELLM_JSON_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

function isChatModelWithPricing(v: Record<string, unknown>): boolean {
  return v.mode === 'chat' && typeof v.input_cost_per_token === 'number'
}

function parseLiteLLMEntry(id: string, raw: Record<string, unknown>): LiteLLMModel {
  const input = typeof raw.input_cost_per_token === 'number' ? Math.round(raw.input_cost_per_token * 1e6 * 10000) / 10000 : null
  const output = typeof raw.output_cost_per_token === 'number' ? Math.round(raw.output_cost_per_token * 1e6 * 10000) / 10000 : null
  const maxIn = typeof raw.max_input_tokens === 'number' ? raw.max_input_tokens : null
  const maxOut = typeof raw.max_output_tokens === 'number' ? raw.max_output_tokens : null
  const maxTok = typeof raw.max_tokens === 'number' ? raw.max_tokens : null
  return {
    id,
    provider: (raw.litellm_provider as string) ?? 'unknown',
    inputPerM: input,
    outputPerM: output,
    maxInputTokens: maxIn,
    maxOutputTokens: maxOut,
    maxTokens: maxTok,
    mode: (raw.mode as string) ?? 'unknown',
  }
}

export async function fetchLiteLLMModels(
  cacheFile: string,
  noCache: boolean,
  force: boolean,
  timeout: number,
  retries: number,
  leaderboardMaxAgeMs: number,
): Promise<LiteLLMModel[]> {
  const now = Date.now()
  const useCache = !noCache && !force && fs.existsSync(cacheFile) && (now - fs.statSync(cacheFile).mtimeMs) < leaderboardMaxAgeMs
  let raw: string
  if (useCache) {
    console.log(`  using cached LiteLLM data (${cacheFile})`)
    raw = fs.readFileSync(cacheFile, 'utf8')
  } else {
    raw = await get(LITELLM_JSON_URL, { timeout, retries, headers: { Accept: 'application/json' } })
    if (!noCache) {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
      fs.writeFileSync(cacheFile, raw)
    }
  }
  const json = JSON.parse(raw) as Record<string, unknown>
  const models: LiteLLMModel[] = []
  for (const [id, rawModel] of Object.entries(json)) {
    if (id === 'sample_spec' || typeof rawModel !== 'object' || rawModel === null) continue
    const m = rawModel as Record<string, unknown>
    if (isChatModelWithPricing(m)) {
      models.push(parseLiteLLMEntry(id, m))
    }
  }
  return models
}

export function buildLiteLLMLookup(models: LiteLLMModel[]): Map<string, LiteLLMModel> {
  const map = new Map<string, LiteLLMModel>()
  for (const m of models) {
    const n = normalizeLiteLLMId(m.id)
    if (!map.has(n)) map.set(n, m)
    const short = shortLiteLLMId(m.id)
    if (short && !map.has(short)) map.set(short, m)
  }
  return map
}

export function normalizeLiteLLMId(id: string): string {
  let n = id.toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/^-+|-+$/g, '')
  n = n.replace(/^[a-z]+-/, '')
  return n
}

function shortLiteLLMId(id: string): string {
  const slash = id.lastIndexOf('/')
  if (slash !== -1) return id.slice(slash + 1).toLowerCase()
  const dot = id.lastIndexOf('.')
  if (dot !== -1) return id.slice(dot + 1).toLowerCase()
  return id.toLowerCase()
}

export function matchLiteLLMModel(
  slug: string,
  name: string | undefined,
  orId: string | undefined,
  lookup: Map<string, LiteLLMModel>,
): LiteLLMModel | null {
  const candidates = [
    slug,
    name ?? '',
    orId?.split('/').slice(1).join('/') ?? '',
    orId ?? '',
  ].filter(Boolean)

  for (const c of candidates) {
    const n = normalizeLiteLLMId(c)
    const exact = lookup.get(n)
    if (exact) return exact
    const short = shortLiteLLMId(c)
    if (short) {
      const shortMatch = lookup.get(short)
      if (shortMatch) return shortMatch
    }
  }

  const checkStrs = candidates.map((c) => normalizeLiteLLMId(c))
  const best: { entry: LiteLLMModel; score: number }[] = []
  for (const [key, entry] of lookup) {
    for (const cs of checkStrs) {
      if (cs && (key.includes(cs) || cs.includes(key))) {
        const score = Math.min(cs.length, key.length) / Math.max(cs.length, key.length)
        best.push({ entry, score })
      }
    }
  }
  if (best.length > 0) {
    best.sort((a, b) => b.score - a.score)
    if (best[0].score >= 0.6) return best[0].entry
  }
  return null
}

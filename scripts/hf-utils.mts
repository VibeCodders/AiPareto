/**
 * Helpers for fetching data from Hugging Face Hub:
 *  - Model metadata (download counts, tags, pipeline tags).
 *  - Parameter count estimation from safetensors file sizes.
 *
 * We focus on the public Hub model-info API, which is freely accessible and
 * provides download counts and file-size-based parameter estimates.
 *
 * OpenRouter exposes `hugging_face_id` on ~44% of its catalog (167/381
 * models), which we use for direct matching. For the rest, fuzzy name
 * matching against known HF ids is attempted.
 */

import path from 'node:path'
import fs from 'node:fs'
import { get } from './shared.mts'

export interface HfModelInfo {
  id: string
  downloads: number | null
  tags: string[]
  pipeline_tag: string | null
  safetensorsTotal: number | null
  estimatedParams: number | null
}

interface FetchOptions {
  noCache: boolean
  force: boolean
  timeout: number
  retries: number
  leaderboardMaxAgeMs: number
  verbose?: boolean
}

const HF_HUB_API = 'https://huggingface.co/api/models'

function normalizeHfModelKey(s: string): string {
  let n = s.toLowerCase().trim()
  n = n.replace(/[-_\s]+/g, '-')
  n = n.replace(/[()]/g, '')
  n = n.replace(/[^a-z0-9-]/g, '')
  return n
}

/**
 * Estimate parameter count from safetensors file size metadata.
 *
 * The HF API returns `safetensors: { parameters: { BF16: num, ... }, total: num }`
 * where `total` is the total file size in bytes across all parameter tensors.
 * We divide by the bytes-per-parameter for the detected quantization format:
 *   - BF16 / FP16: 2 bytes per param
 *   - FP32: 4 bytes per param
 *   - INT8: 1 byte per param
 *   - INT4: 0.5 bytes per param
 *   - INT2: 0.25 bytes per param
 * Falls back to assuming BF16 (most common for full-precision open models).
 */
function estimateParamsFromSafetensors(safetensors: unknown): number | null {
  if (!safetensors || typeof safetensors !== 'object') return null
  const s = safetensors as Record<string, unknown>
  const total = s.total
  if (typeof total !== 'number' || total <= 0) return null

  const params = s.parameters as Record<string, number> | undefined
  if (params) {
    if (params.BF16 != null) return Math.round(total / 2)
    if (params.FP16 != null) return Math.round(total / 2)
    if (params.fp16 != null) return Math.round(total / 2)
    if (params.INT8 != null) return Math.round(total)
    if (params.INT4 != null) return Math.round(total * 2)
    if (params.INT2 != null) return Math.round(total * 4)
    if (params.FP32 != null) return Math.round(total / 4)
    if (params.fp32 != null) return Math.round(total / 4)
  }

  return Math.round(total / 2)
}

export async function fetchHfModelInfo(
  hfId: string,
  cacheDir: string,
  opts: FetchOptions,
): Promise<HfModelInfo | null> {
  const cacheFile = path.join(cacheDir, `${normalizeHfModelKey(hfId)}.json`)

  if (!opts.noCache && !opts.force) {
    try {
      if (fs.existsSync(cacheFile)) {
        const stat = fs.statSync(cacheFile)
        if (Date.now() - stat.mtimeMs < opts.leaderboardMaxAgeMs) {
          if (opts.verbose) console.log(`  using cached HF model info for ${hfId}`)
          return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as HfModelInfo
        }
      }
    } catch {
      // fall through to fresh fetch
    }
  }

  try {
    const text = await get(`${HF_HUB_API}/${encodeURIComponent(hfId)}`, {
      timeout: opts.timeout,
      retries: opts.retries,
      headers: { Accept: 'application/json' },
    })
    const data = JSON.parse(text) as Record<string, unknown>
    const info: HfModelInfo = {
      id: data.id as string,
      downloads: typeof data.downloads === 'number' ? data.downloads : null,
      tags: Array.isArray(data.tags) ? data.tags.map((t) => String(t)) : [],
      pipeline_tag: (data.pipeline_tag as string) ?? null,
      safetensorsTotal: extractSafetensorsTotal(data.safetensors),
      estimatedParams: estimateParamsFromSafetensors(data.safetensors),
    }

    if (!opts.noCache) {
      fs.mkdirSync(cacheDir, { recursive: true })
      fs.writeFileSync(cacheFile, JSON.stringify(info, null, 2))
    }

    return info
  } catch (e) {
    if (opts.verbose) console.warn(`  ⚠ failed to fetch HF model info for ${hfId}: ${e}`)
    return null
  }
}

function extractSafetensorsTotal(safetensors: unknown): number | null {
  if (!safetensors || typeof safetensors !== 'object') return null
  const s = safetensors as Record<string, unknown>
  const total = s.total
  return typeof total === 'number' && total > 0 ? total : null
}

/**
 * Build a lookup from normalized HF model ID → HfModelInfo.
 * Also adds lookups by organization-stripped slug and version-normalized form.
 */
export function buildHfModelInfoLookup(infos: HfModelInfo[]): Map<string, HfModelInfo> {
  const map = new Map<string, HfModelInfo>()
  for (const info of infos) {
    if (!info.id) continue
    const key = normalizeHfModelKey(info.id)
    if (!map.has(key)) map.set(key, info)

    const parts = info.id.split('/')
    if (parts.length > 1) {
      const short = normalizeHfModelKey(parts[1])
      if (!map.has(short)) map.set(short, info)

      const noDots = normalizeHfModelKey(parts[1].replace(/\.(\d)/g, '-$1'))
      if (!map.has(noDots)) map.set(noDots, info)
    }
  }
  return map
}

/**
 * Match a model row to HF Hub metadata.
 * Tries:
 *  1. Direct match by hugging_face_id (most reliable).
 *  2. Match by OR id (strip provider prefix).
 *  3. Match by AA slug.
 *  4. Fuzzy containment match (≥ 0.6 ratio).
 */
export function matchHfModel(
  hfId: string | null | undefined,
  slug: string | undefined,
  name: string | undefined,
  orId: string | undefined,
  lookup: Map<string, HfModelInfo>,
): HfModelInfo | null {
  // 1. Direct HF ID match
  if (hfId) {
    const direct = lookup.get(normalizeHfModelKey(hfId))
    if (direct) return direct
  }

  // 2. OR id (strip provider prefix)
  if (orId) {
    const orSlug = orId.split('/').slice(1).join('/')
    const match = lookup.get(normalizeHfModelKey(orSlug))
    if (match) return match
  }

  // 3. AA slug
  if (slug) {
    const match = lookup.get(normalizeHfModelKey(slug))
    if (match) return match
  }

  // 4. Display name (strip provider prefix)
  if (name) {
    const nameKey = normalizeHfModelKey(name.replace(/^[^:]+:\s*/, ''))
    const match = lookup.get(nameKey)
    if (match) return match
  }

  // 5. Fuzzy containment match
  const candidates: Array<{ entry: HfModelInfo; score: number }> = []
  const checkStrs: string[] = []
  if (slug) checkStrs.push(normalizeHfModelKey(slug))
  if (name) checkStrs.push(normalizeHfModelKey(name.replace(/^[^:]+:\s*/, '')))
  if (orId) checkStrs.push(normalizeHfModelKey(orId.split('/').slice(1).join('/')))
  if (hfId) checkStrs.push(normalizeHfModelKey(hfId))

  for (const [key, entry] of lookup) {
    for (const cs of checkStrs) {
      if (cs && (key.includes(cs) || cs.includes(key))) {
        const score = Math.min(cs.length, key.length) / Math.max(cs.length, key.length)
        candidates.push({ entry, score })
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score)
    if (candidates[0].score >= 0.6) return candidates[0].entry
  }

  return null
}

/**
 * Fetch HF Hub model info for a list of HF IDs (with caching and rate limiting).
 * Returns a map from HF ID → HfModelInfo.
 */
export async function fetchHfModelInfos(
  cacheDir: string,
  hfIds: string[],
  opts: FetchOptions,
): Promise<Map<string, HfModelInfo>> {
  const result = new Map<string, HfModelInfo>()
  if (hfIds.length === 0) return result

  fs.mkdirSync(cacheDir, { recursive: true })

  const toFetch = opts.force
    ? hfIds
    : hfIds.filter((id) => {
        const cacheFile = path.join(cacheDir, `${normalizeHfModelKey(id)}.json`)
        if (opts.noCache) return true
        if (!fs.existsSync(cacheFile)) return true
        const stat = fs.statSync(cacheFile)
        return Date.now() - stat.mtimeMs >= opts.leaderboardMaxAgeMs
      })

  if (opts.verbose) console.log(`  fetching HF model info for ${toFetch.length}/${hfIds.length} models`)

  let done = 0
  for (const hfId of toFetch) {
    const info = await fetchHfModelInfo(hfId, cacheDir, opts)
    if (info) result.set(hfId, info)
    done++
    if (done % 20 === 0 && done < toFetch.length) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  return result
}

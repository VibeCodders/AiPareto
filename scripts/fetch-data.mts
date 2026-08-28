/**
 * One-shot data fetcher (npm run fetch-data).
 *
 * Sources:
 *  - OpenRouter public API (https://openrouter.ai/api/v1/models) — token prices.
 *  - Artificial Analysis https://artificialanalysis.ai/models — model registry +
 *    per-model detail pages for Intelligence Index / Agentic Index / Omniscience.
 *
 * Output: src/data/models.json (rows merged by curated mapping), src/data/meta.json.
 * Detail pages are cached in .tmp/aa_pages so re-runs are cheap.
 *
 * Flags:
 *   --force           Bypass all caches (download everything fresh).
 *   --no-cache        Do not read or write cache files (.tmp/).
 *   --concurrency N   Parallel workers for detail page crawling (default 4).
 *   --delay MS        Delay between requests per worker (default 400).
 *   --timeout MS      HTTP request timeout (default 30000).
 *   --retries N       HTTP retry attempts (default 3).
 *   --older-than HOURS  Only refresh leaderboards cache if older than this (default 24).
 *   --detail-max-age HOURS Only refresh detail page cache if older than this (default 24).
 *   --refresh         Incremental refresh: only re-crawl models with missing or stale scores.
 *   --verbose         Print extra diagnostics.
 *   --dry-run         Run the full pipeline but skip writing files.
 */
import fs from 'node:fs'
import path from 'node:path'
import { extractFlightChunks, extractModelObjects, extractObjectsContaining, extractPerfFromDetail, parseModelRegistry, type AAModelData, type AAModelMeta } from './aa-utils.mts'
import { AA_TO_OR } from './model-map.ts'
import { CREATOR_WHITELIST, DEFAULT_LEADERBOARD_MAX_AGE_MS, DEFAULT_RETRIES, DEFAULT_TIMEOUT, DEFAULT_DETAIL_MAX_AGE_MS, get } from './shared.mts'

const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = path.join(ROOT, '.tmp')
const PAGES_DIR = path.join(TMP, 'aa_pages')
const OUT_DIR = path.join(ROOT, 'src', 'data')
const OR_CACHE = path.join(TMP, 'openrouter.json')
const AA_MODELS_CACHE = path.join(TMP, 'aa_models.html')

interface Flags {
  force: boolean
  noCache: boolean
  concurrency: number
  delayMs: number
  timeout: number
  retries: number
  leaderboardMaxAgeMs: number
  detailMaxAgeMs: number
  refresh: boolean
  verbose: boolean
  dryRun: boolean
  skipPerf: boolean
}

export function parseFlags(): Flags {
  const args = process.argv.slice(2)
  const flags: Flags = {
    force: false,
    noCache: false,
    concurrency: 4,
    delayMs: 400,
    timeout: DEFAULT_TIMEOUT,
    retries: DEFAULT_RETRIES,
    leaderboardMaxAgeMs: DEFAULT_LEADERBOARD_MAX_AGE_MS,
    detailMaxAgeMs: DEFAULT_DETAIL_MAX_AGE_MS,
    refresh: false,
    verbose: false,
    dryRun: false,
    skipPerf: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--force') flags.force = true
    else if (a === '--no-cache') flags.noCache = true
    else if (a === '--concurrency' && args[i + 1]) flags.concurrency = Math.max(1, parseInt(args[++i], 10) || 4)
    else if (a === '--delay' && args[i + 1]) flags.delayMs = Math.max(0, parseInt(args[++i], 10) || 400)
    else if (a === '--timeout' && args[i + 1]) flags.timeout = Math.max(1000, parseInt(args[++i], 10) || DEFAULT_TIMEOUT)
    else if (a === '--retries' && args[i + 1]) flags.retries = Math.max(0, parseInt(args[++i], 10) || DEFAULT_RETRIES)
    else if (a === '--older-than' && args[i + 1]) {
      const v = parseInt(args[++i], 10)
      flags.leaderboardMaxAgeMs = Number.isNaN(v) ? DEFAULT_LEADERBOARD_MAX_AGE_MS : Math.max(1, v) * 60 * 60 * 1000
    }
    else if (a === '--detail-max-age' && args[i + 1]) {
      const v = parseInt(args[++i], 10)
      flags.detailMaxAgeMs = Number.isNaN(v) ? DEFAULT_DETAIL_MAX_AGE_MS : Math.max(1, v) * 60 * 60 * 1000
    }
    else if (a === '--refresh') flags.refresh = true
    else if (a === '--verbose') flags.verbose = true
    else if (a === '--dry-run') flags.dryRun = true
    else if (a === '--skip-perf') flags.skipPerf = true
    else if (a === '--help' || a === '-h') {
      console.log(`
Usage: npm run fetch-data [flags]

Flags:
  --force            Bypass all caches (download everything fresh).
  --no-cache         Do not read or write cache files (.tmp/).
  --concurrency N    Parallel workers for detail page crawling (default 4).
  --delay MS         Delay between requests per worker (default 400).
  --timeout MS       HTTP request timeout (default 30000).
  --retries N        HTTP retry attempts (default 3).
  --older-than HOURS Only refresh leaderboards cache if older than this (default 24).
  --detail-max-age HOURS Only refresh detail page cache if older than this (default 24).
  --refresh          Incremental refresh: only re-crawl models with missing or stale scores.
  --skip-perf        Skip performance extraction (faster incremental updates).
  --verbose          Print extra diagnostics.
  --dry-run          Run the full pipeline but skip writing files.
  --help, -h         Show this help message.
`)
      process.exit(0)
    }
  }
  if (flags.concurrency > 10) {
    console.warn(`⚠ concurrency=${flags.concurrency} is high; consider lowering to avoid rate limits`)
  }
  return flags
}

interface ORModel {
  id: string
  name: string
  context: number | null
  top_provider: { max_completion_tokens: number | null } | null
  pricing: {
    prompt: number | null
    completion: number | null
    request: number | null
    image: number | null
    web_search: number | null
    internal_reasoning: number | null
    input_cache_read: number | null
    input_cache_write: number | null
  }
}

async function fetchOpenRouter(flags: Flags): Promise<ORModel[]> {
  const now = Date.now()
  const useCache = !flags.noCache && !flags.force && fs.existsSync(OR_CACHE) && (now - fs.statSync(OR_CACHE).mtimeMs) < flags.leaderboardMaxAgeMs
  if (useCache) {
    console.log(`  using cached OpenRouter data (${OR_CACHE})`)
    return JSON.parse(fs.readFileSync(OR_CACHE, 'utf8')) as ORModel[]
  }
  const json = JSON.parse(await get('https://openrouter.ai/api/v1/models', {
    headers: { 'Accept': 'application/json' },
    timeout: flags.timeout,
    retries: flags.retries,
  })) as { data: ORModel[] }
  if (!flags.noCache) fs.writeFileSync(OR_CACHE, JSON.stringify(json.data, null, 2))
  return json.data
}

async function fetchAAModelsPage(flags: Flags): Promise<{ registry: AAModelMeta[]; scored: AAModelData[] }> {
  const now = Date.now()
  const useCache = !flags.noCache && !flags.force && fs.existsSync(AA_MODELS_CACHE) && (now - fs.statSync(AA_MODELS_CACHE).mtimeMs) < flags.leaderboardMaxAgeMs
  let html: string
  if (useCache) {
    console.log(`  using cached AA models page (${AA_MODELS_CACHE})`)
    html = fs.readFileSync(AA_MODELS_CACHE, 'utf8')
  } else {
    html = await get('https://artificialanalysis.ai/models', { timeout: flags.timeout, retries: flags.retries })
    if (!flags.noCache) fs.writeFileSync(AA_MODELS_CACHE, html)
  }
  const raw = extractFlightChunks(html).join('')
  const registry = parseModelRegistry(raw)
  const scored = extractModelObjects(raw)
  return { registry, scored }
}

async function fetchAALeaderboards(flags: Flags): Promise<AAModelData[]> {
  const file = path.join(TMP, 'aa_leaderboards.html')
  const now = Date.now()
  const useCache = !flags.force && fs.existsSync(file) && (now - fs.statSync(file).mtimeMs) < flags.leaderboardMaxAgeMs
  let html: string
  if (useCache) {
    html = fs.readFileSync(file, 'utf8')
  } else {
    html = await get('https://artificialanalysis.ai/leaderboards/models', { timeout: flags.timeout, retries: flags.retries })
    if (!flags.noCache) fs.writeFileSync(file, html)
  }
  return extractObjectsContaining(extractFlightChunks(html).join(''), '"codingIndex"')
}

function slugToFile(slug: string): string {
  return path.join(PAGES_DIR, `${slug.replace(/[\\/:*?"<>|]/g, '_')}.html`)
}

async function getDetailHtml(slug: string, flags: Flags): Promise<string> {
  const file = slugToFile(slug)
  const now = Date.now()
  const useCache = !flags.noCache && !flags.force && fs.existsSync(file) && (now - fs.statSync(file).mtimeMs) < flags.detailMaxAgeMs
  if (useCache) return fs.readFileSync(file, 'utf8')
  const html = await get(`https://artificialanalysis.ai/models/${slug}`, { timeout: flags.timeout, retries: flags.retries })
  if (!flags.noCache) fs.writeFileSync(file, html)
  return html
}

interface DetailResult {
  data: AAModelData | null
  html: string
}

async function fetchAADetail(slug: string, flags: Flags): Promise<DetailResult> {
  const html = await getDetailHtml(slug, flags)
  const raw = extractFlightChunks(html).join('')
  const objs = extractModelObjects(raw)
  const data = objs.find((o) => o.release?.slug === slug) ?? objs[0] ?? null
  return { data, html }
}

async function crawlDetails(slugs: string[], flags: Flags): Promise<Map<string, DetailResult>> {
  const results = new Map<string, DetailResult>()
  const queue = [...slugs]
  let next = 0
  let done = 0
  const worker = async () => {
    while (true) {
      const i = next++
      const slug = queue[i]
      if (!slug) return
      let attempts = 0
      let result: DetailResult | undefined
      while (attempts < flags.retries && !result) {
        try {
          result = await fetchAADetail(slug, flags)
        } catch (e) {
          attempts++
          if (attempts < 3) {
            const backoff = flags.delayMs * Math.pow(2, attempts - 1)
            const jitter = Math.random() * backoff * 0.5
            await new Promise((r) => setTimeout(r, backoff + jitter))
          }
        }
      }
      if (result) {
        results.set(slug, result)
        console.log(`  [${++done}/${queue.length}] ${slug} ${result.data?.intelligenceIndex != null ? `II=${result.data.intelligenceIndex.toFixed(1)}` : '(no score)'}${attempts > 0 ? ' (retry)' : ''}`)
      } else {
        console.warn(`  [${++done}/${queue.length}] ${slug} FAILED after ${attempts} attempts`)
      }
      const nextDelay = flags.delayMs * (1 + Math.random() * 0.5)
      await new Promise((r) => setTimeout(r, nextDelay))
    }
  }
  await Promise.all(Array.from({ length: Math.min(flags.concurrency, Math.max(1, queue.length)) }, worker))
  return results
}

function parseEffort(name: string): string | null {
  const n = name.toLowerCase()
  if (n.includes('non-reasoning')) return 'non-reasoning'
  if (n.includes('xhigh')) return 'xhigh'
  if (n.includes('max effort') || n.includes('(max)')) return 'max'
  if (n.includes('high')) return 'high'
  if (n.includes('medium')) return 'medium'
  if (n.includes('low')) return 'low'
  if (n.includes('minimal')) return 'minimal'
  return null
}

function parseParamValue(numStr: string, unit: string): number | null {
  const n = parseFloat(numStr)
  if (!Number.isFinite(n) || n <= 0) return null
  const u = unit.trim().toLowerCase()
  if (u === 't') return Math.round(n * 1e12)
  if (u === 'b') return Math.round(n * 1e9)
  if (u === 'm') return Math.round(n * 1e6)
  return null
}

const KNOWN_PARAMS: Record<string, { parameters: number; activeParameters?: number }> = {
  'llama-4-maverick': { parameters: 400e9, activeParameters: 17e9 },
  'llama-4-scout': { parameters: 109e9, activeParameters: 17e9 },
  'gemma-4-26b-a4b': { parameters: 26e9, activeParameters: 4e9 },
  'gemma-4-31b': { parameters: 31e9 },
  'gemma-3-270m': { parameters: 270e6 },
  'gemma-3-4b': { parameters: 4e9 },
  'gemma-3-12b': { parameters: 12e9 },
  'gemma-3-27b': { parameters: 27e9 },
  'gemma-2-27b': { parameters: 27e9 },
  'gemma-3n-e4b': { parameters: 4e9 },
  'gemma-4-e2b': { parameters: 2e9 },
  'gemma-4-e4b': { parameters: 4e9 },
  'gemma-4-12b': { parameters: 12e9 },
  'ministral-14b': { parameters: 14e9 },
  'ministral-3b': { parameters: 3e9 },
  'ministral-8b': { parameters: 8e9 },
  'mistral-small-3': { parameters: 24e9 },
  'mistral-small-3.1-24b': { parameters: 24e9 },
  'mistral-small-4': { parameters: 24e9 },
  'mistral-medium-3': { parameters: 70e9 },
  'mistral-large-3': { parameters: 675e9, activeParameters: 41e9 },
  'gpt-oss-120b': { parameters: 120e9, activeParameters: 5.1e9 },
  'gpt-oss-20b': { parameters: 20e9, activeParameters: 3.6e9 },
  'ring-2.6-1t': { parameters: 1e12, activeParameters: 63e9 },
  'muse-glimmer-30b': { parameters: 30e9 },
  'muse-spark-1.2': { parameters: 1.2e9 },
  'qwen3.5-122b-a10b': { parameters: 122e9, activeParameters: 10e9 },
  'qwen3.5-35b-a3b': { parameters: 35e9, activeParameters: 3e9 },
  'qwen3.5-397b-a17b': { parameters: 397e9, activeParameters: 17e9 },
  'qwen3.6-35b-a3b': { parameters: 35e9, activeParameters: 3e9 },
  'qwen3.8-27b': { parameters: 27e9 },
  'qwen3.8-2.4t-a95b': { parameters: 2400e9, activeParameters: 95e9 },
  'qwen3-next-80b-a3b': { parameters: 80e9, activeParameters: 3e9 },
  'qwen3-coder-next': { parameters: 235e9 },
  'deepseek-v3-0324': { parameters: 671e9, activeParameters: 37e9 },
  'deepseek-r1-distill-llama-70b': { parameters: 70e9 },
  'llama-3.3-70b': { parameters: 70e9 },
  'llama-3.1-70b': { parameters: 70e9 },
  'llama-3.1-8b': { parameters: 8e9 },
  'llama-3.2-1b': { parameters: 1e9 },
  'llama-3.2-3b': { parameters: 3e9 },
  'llama-guard-4-12b': { parameters: 12e9 },
  'phi-4': { parameters: 14e9 },
  'llama-3.3-70b-instruct': { parameters: 70e9 },
  'nemotron-3-nano-30b-a3b': { parameters: 30e9, activeParameters: 3e9 },
  'nemotron-3-super-120b-a12b': { parameters: 120e9, activeParameters: 12e9 },
  'nemotron-3-ultra-550b-a55b': { parameters: 550e9, activeParameters: 55e9 },
  'nemotron-3.5-lightning': { parameters: 340e9 },
  'nemotron-3-nano-4b': { parameters: 4e9 },
  'nemotron-nano-9b-v2': { parameters: 9e9 },
  'nemotron-nano-12b-v2-vl': { parameters: 12e9 },
  'nemotron-cascade-2-30b-a3b': { parameters: 30e9, activeParameters: 3e9 },
  'kimi-linear-48b-a3b-instruct': { parameters: 48e9, activeParameters: 3e9 },
  'step-3-vl-10b': { parameters: 10e9 },
  'ernie-4-5-300b-a47b': { parameters: 300e9, activeParameters: 47e9 },
  'jamba-1-7-mini': { parameters: 8e9 },
  'jamba-1-7-large': { parameters: 52e9, activeParameters: 12e9 },
  'jamba-reasoning-3b': { parameters: 3e9 },
  'command-a': { parameters: 111e9 },
  'kimi-k2-7-code': { parameters: 1e12, activeParameters: 32e9 },
  'kimi-k3': { parameters: 2800e9, activeParameters: 104e9 },
  'qwen3.8-max': { parameters: 20e9 },
  'qwen3.7-plus': { parameters: 17e9 },
  'minimax-m3': { parameters: 428e9, activeParameters: 23e9 },
  'ling-3-0-flash': { parameters: 124e9, activeParameters: 5.1e9 },
  'ling-3-0-tiny': { parameters: 7.9e9, activeParameters: 1.3e9 },
  'hy3': { parameters: 299e9, activeParameters: 21e9 },
  'mimo-v2-5-pro': { parameters: 1023e9, activeParameters: 42e9 },
}

function matchKnownParams(text: string): { parameters: number | null; activeParameters: number | null } | null {
  const lower = text.toLowerCase().replace(/[–—\s]+/g, '-')
  for (const [key, val] of Object.entries(KNOWN_PARAMS)) {
    if (lower.includes(key)) {
      return { parameters: val.parameters, activeParameters: val.activeParameters ?? null }
    }
  }
  return null
}

function parseNameParams(text: string): { parameters: number | null; activeParameters: number | null } {
  const t = text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')

  const nxm = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
  if (nxm) {
    const experts = parseFloat(nxm[1])
    const perExpert = parseParamValue(nxm[2], nxm[3])
    if (Number.isFinite(experts) && perExpert != null) {
      const total = Math.round(experts * perExpert)
      const activeMarker = t.match(/\ba\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
      if (activeMarker) {
        const active = parseParamValue(activeMarker[1], activeMarker[2])
        return { parameters: total, activeParameters: active }
      }
      const active = Math.round(2 * perExpert)
      return { parameters: total, activeParameters: active }
    }
  }

  const activeMarker = t.match(/\ba\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
  if (activeMarker) {
    const active = parseParamValue(activeMarker[1], activeMarker[2])
    const before = t.slice(0, activeMarker.index!)
    const paramMatches = [...before.matchAll(/(\d+(?:\.\d+)?)\s*([tTbBmM])\b/g)]
    if (paramMatches.length > 0) {
      const last = paramMatches[paramMatches.length - 1]
      const total = parseParamValue(last[1], last[2])
      return { parameters: total, activeParameters: active }
    }
  }

  const allMatches = [...t.matchAll(/(\d+(?:\.\d+)?)\s*([tTbBmM])\b/g)]
  if (allMatches.length > 0) {
    const last = allMatches[allMatches.length - 1]
    const total = parseParamValue(last[1], last[2])
    return { parameters: total, activeParameters: null }
  }

  return { parameters: null, activeParameters: null }
}

function extractParamsFromAA(data: AAModelData | null | undefined): { parameters: number | null; activeParameters: number | null } {
  if (!data) return { parameters: null, activeParameters: null }
  const totalBillions = data.totalParameters ?? data.parameters ?? null
  const activeBillions = data.activeParameters ?? data.inferenceParametersActiveBillions ?? null
  return {
    parameters: totalBillions != null && totalBillions > 0 ? Math.round(totalBillions * 1e9) : null,
    activeParameters: activeBillions != null && activeBillions > 0 ? Math.round(activeBillions * 1e9) : null,
  }
}

function parseParams(text: string, data: AAModelData | null | undefined): { parameters: number | null; activeParameters: number | null } {
  const result = extractParamsFromAA(data)

  const known = matchKnownParams(text)
  if (known) {
    if (result.parameters == null) result.parameters = known.parameters
    if (result.activeParameters == null) result.activeParameters = known.activeParameters
  }

  const fromName = parseNameParams(text)
  if (result.parameters == null) result.parameters = fromName.parameters
  if (result.activeParameters == null) result.activeParameters = fromName.activeParameters

  return result
}

async function fetchPerfForSlug(slug: string, details: Map<string, DetailResult>, flags: Flags): Promise<{ outputSpeed: number | null; latencySeconds: number | null; contextWindowTokens: number | null } | null> {
  const cached = details.get(slug)
  let attempts = 0
  while (attempts < 2) {
    try {
      const html = cached?.html ?? await getDetailHtml(slug, flags)
      const perf = extractPerfFromDetail(html, slug)
      return perf
    } catch (e) {
      attempts++
      if (attempts < 2) {
        await new Promise((r) => setTimeout(r, flags.delayMs))
      } else {
        return null
      }
    }
  }
  return null
}

export async function run(flags: Flags): Promise<void> {
  const t0 = Date.now()
  fs.mkdirSync(PAGES_DIR, { recursive: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log(`— fetching OpenRouter models (timeout=${flags.timeout}ms, retries=${flags.retries})…`)
  const t1 = Date.now()
  const orModels = await fetchOpenRouter(flags)
  console.log(`  ${orModels.length} models (${Date.now() - t1}ms)`)

  console.log('— fetching Artificial Analysis models page…')
  const t2 = Date.now()
  const { registry, scored } = await fetchAAModelsPage(flags)
  console.log(`  registry: ${registry.length} models, ${scored.length} scored on page (${Date.now() - t2}ms)`)

  console.log('— fetching Artificial Analysis leaderboards page…')
  const t3 = Date.now()
  const leaderboard = await fetchAALeaderboards(flags)
  console.log(`  ${leaderboard.length} full model objects (coding index etc.) (${Date.now() - t3}ms)`)

  const active = registry.filter((m) => !m.deprecated)
  const whitelisted = active.filter(
    (m) => m.creator && CREATOR_WHITELIST.some((c) => m.creator!.name.toLowerCase().includes(c.toLowerCase())),
  )
  const recent = whitelisted.filter((m) => (m.releaseDate ?? '') >= '2025-01-01')
  console.log(`  whitelisted active: ${whitelisted.length}, released >= 2025: ${recent.length}`)

  const haveSlugs = new Set(scored.map((o) => o.release?.slug).filter((s): s is string => Boolean(s)))
  const topSlugs = [...haveSlugs]

  const scoreBySlug = new Map<string, AAModelData>()
  for (const o of scored) if (o.release?.slug) scoreBySlug.set(o.release.slug, o)
  for (const o of leaderboard) {
    const key = o.slug ?? o.release?.slug
    if (key) scoreBySlug.set(key, o)
  }

  let crawlSlugs: string[]
  if (flags.refresh) {
    const now = Date.now()
    const staleOrMissing = recent.filter((m) => {
      const file = slugToFile(m.slug)
      if (flags.noCache || flags.force) return true
      if (!fs.existsSync(file)) return true
      const age = now - fs.statSync(file).mtimeMs
      return age >= flags.detailMaxAgeMs
    })
    console.log(`— refreshing ${staleOrMissing.length} models with stale/missing cache (concurrency=${flags.concurrency})…`)
    crawlSlugs = [...new Set(staleOrMissing.map((m) => m.slug))]
  } else {
    crawlSlugs = [...new Set([...recent.map((m) => m.slug), ...topSlugs])].filter((s) => !haveSlugs.has(s))
    console.log(`— crawling ${crawlSlugs.length} detail pages (concurrency=${flags.concurrency}, delay=${flags.delayMs}ms, already have ${topSlugs.length})…`)
  }
  const details = await crawlDetails(crawlSlugs, flags)
  console.log(`  got scores for ${details.size} detail pages`)

  for (const [slug, d] of details) {
    const prev = scoreBySlug.get(slug)
    if (!prev) {
      scoreBySlug.set(slug, d.data!)
    } else if (d.data) {
      const merged = { ...prev, ...d.data }
      if (d.data.agenticIndex == null && prev.agenticIndex != null) {
        merged.agenticIndex = prev.agenticIndex
      }
      scoreBySlug.set(slug, merged)
    }
  }

  const skippedNoScore = recent.filter((m) => scoreBySlug.get(m.slug)?.intelligenceIndex == null)
  console.log(`  skipped (no II): ${skippedNoScore.length}/${recent.length}`)
  if (flags.verbose && skippedNoScore.length) {
    for (const m of skippedNoScore) console.log(`    ${m.slug} (${m.creator?.name ?? '?'} ${m.name})`)
  }

  const orById = new Map(orModels.map((m) => [m.id, m]))

  const rows: Array<Record<string, unknown>> = []
  const unmatched: string[] = []
  for (const m of recent) {
    const data = scoreBySlug.get(m.slug)
    const score = data?.intelligenceIndex
    if (score == null) continue
    const orId = AA_TO_OR[m.slug]
    if (!orId) continue
    const or = orById.get(orId)
    if (!or) {
      unmatched.push(`${m.slug} -> ${orId}`)
      continue
    }
    rows.push({
      id: or.id,
      name: or.name,
      family: m.creator?.name ?? null,
      slug: m.slug,
      aaName: m.name,
      effort: parseEffort(m.name),
      released: m.releaseDate,
      isReasoning: m.isReasoning,
      intelligenceIndex: round1(score),
      codingIndex: data?.codingIndex != null ? round1(data.codingIndex) : null,
      agenticIndex: data?.agenticIndex != null ? round1(data.agenticIndex) : null,
      tau2: data?.tau2 != null ? round1(data.tau2) : null,
      hle: data?.hle != null ? round1(data.hle) : null,
      omniscience: data?.omniscience != null ? round1(data.omniscience) : null,
      contextTokens: data?.contextWindowTokens ?? or.context,
      openWeights: data?.isOpenWeights === true || data?.openSourceCategorization === 'open' || m.name.toLowerCase().includes('oss'),
      inputPerM: usd(or.pricing.prompt),
      outputPerM: usd(or.pricing.completion),
      cacheReadPerM: usd(or.pricing.input_cache_read),
      cacheWritePerM: usd(or.pricing.input_cache_write),
      maxCompletionTokens: or.top_provider?.max_completion_tokens ?? null,
      ...parseParams(`${or.id} ${or.name} ${m.name}`, data),
    })
  }

  console.log(`— building rows: ${rows.length} models`)

  console.log(`— extracting perf for ${rows.length} models (concurrency=${flags.concurrency})…`)

  const modelsPath = path.join(OUT_DIR, 'models.json')
  const metaPath = path.join(OUT_DIR, 'meta.json')
  const previous = fs.existsSync(modelsPath) ? (JSON.parse(fs.readFileSync(modelsPath, 'utf8')) as Array<Record<string, unknown>>) : []

  if (!flags.skipPerf) {
    const existingPerfBySlug = new Map<string, { outputSpeed: number | null; latencySeconds: number | null; contextWindowTokens: number | null }>()
    for (const r of previous) {
      const slug = r.slug as string | undefined
      if (slug && (r.outputSpeed != null || r.latencySeconds != null)) {
        existingPerfBySlug.set(slug, {
          outputSpeed: r.outputSpeed as number | null,
          latencySeconds: r.latencySeconds as number | null,
          contextWindowTokens: r.contextTokens as number | null,
        })
      }
    }

    const perfResults = await extractPerfParallel(rows, details, flags, existingPerfBySlug)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>
      const perf = perfResults[i]
      if (perf) {
        row.outputSpeed = perf.outputSpeed != null ? round1(perf.outputSpeed) : null
        row.latencySeconds = perf.latencySeconds != null ? round1(perf.latencySeconds) : null
        if ((row.contextTokens as number | null) == null && perf.contextWindowTokens != null) row.contextTokens = perf.contextWindowTokens
      }
    }
    const perfOk = perfResults.filter((p) => p != null && (p.outputSpeed != null || p.latencySeconds != null)).length
    const perfMissing = perfResults.filter((p) => p == null || (p.outputSpeed == null && p.latencySeconds == null)).length
    console.log(`  perf ok: ${perfOk}, missing both: ${perfMissing}`)
  } else {
    console.log(`  perf extraction skipped`)
  }

  const paramRows = rows as Array<Record<string, unknown>>
  const paramFromAA = paramRows.filter((r) => r.parameters != null).length
  const paramNull = paramRows.filter((r) => r.parameters == null).length
  const activeFromAA = paramRows.filter((r) => r.activeParameters != null).length
  console.log(`  parameters: ${paramFromAA}/${paramRows.length} filled, ${paramNull} null (${activeFromAA} active filled)`)

  const maxCompFromOR = rows.filter((r) => r.maxCompletionTokens != null).length
  console.log(`  maxCompletionTokens: ${maxCompFromOR}/${rows.length} from OpenRouter`)

  rows.sort((a, b) => {
    const ai = a.intelligenceIndex as number
    const bi = b.intelligenceIndex as number
    if (bi !== ai) return bi - ai
    const ar = (a.released as string) ?? ''
    const br = (b.released as string) ?? ''
    if (ar !== br) return ar < br ? 1 : -1
    const aid = (a.id as string) ?? ''
    const bid = (b.id as string) ?? ''
    return aid < bid ? -1 : aid > bid ? 1 : 0
  })

  // Safety check: warn if new data is drastically smaller than before,
  // but DO NOT abort — we will merge with previous data so no model is ever lost.
  const MIN_RETENTION = 0.7
  if (previous.length > 0 && rows.length < previous.length * MIN_RETENTION) {
    console.warn(
      `\n⚠ Warning: fetched ${rows.length} models, but src/data/models.json currently has ${previous.length} ` +
        `(< ${Math.round(MIN_RETENTION * 100)}% retained). This usually means a source page changed shape. ` +
        `Preserving existing data and merging — investigate the source change.`,
    )
  }

  // Merge new rows with previous data so that models can never be removed.
  // Strategy: start with all previous models, then overlay fresh data for matching slugs.
  // For each field, prefer the new value if it is not null/undefined; otherwise keep the old value.
  const prevBySlug = new Map<string, Record<string, unknown>>()
  for (const r of previous) {
    const slug = r.slug as string | undefined
    if (slug) prevBySlug.set(slug, r)
  }

  const merged = new Map<string, Record<string, unknown>>()

  for (const [slug, oldRow] of prevBySlug) {
    merged.set(slug, { ...oldRow })
  }

  for (const newRow of rows) {
    const slug = newRow.slug as string
    const oldRow = merged.get(slug)
    if (oldRow) {
      const updated = { ...oldRow }
      for (const key of Object.keys(newRow)) {
        const newVal = (newRow as Record<string, unknown>)[key]
        if (newVal !== null && newVal !== undefined) {
          (updated as Record<string, unknown>)[key] = newVal
        }
      }
      merged.set(slug, updated)
    } else {
      merged.set(slug, { ...newRow })
    }
  }

  const finalRows = Array.from(merged.values())
  finalRows.sort((a, b) => {
    const ai = a.intelligenceIndex as number
    const bi = b.intelligenceIndex as number
    if (bi !== ai) return bi - ai
    const ar = (a.released as string) ?? ''
    const br = (b.released as string) ?? ''
    if (ar !== br) return ar < br ? 1 : -1
    const aid = (a.id as string) ?? ''
    const bid = (b.id as string) ?? ''
    return aid < bid ? -1 : aid > bid ? 1 : 0
  })

  const prevKeys = new Set(previous.map((r) => r.slug as string | undefined).filter((s): s is string => Boolean(s)))
  const finalKeys = new Set(finalRows.map((r) => r.slug as string))
  const added = [...finalKeys].filter((k) => !prevKeys.has(k))
  const removed = [...prevKeys].filter((k) => !finalKeys.has(k))

  if (removed.length > 0) {
    console.error(`\n✗ Internal error: ${removed.length} models were removed despite preservation logic. This should never happen.`)
    process.exit(1)
  }

  const meta = {
    fetchedAt: new Date().toISOString(),
    sources: {
      openrouter: 'https://openrouter.ai/api/v1/models',
      artificialAnalysis: 'https://artificialanalysis.ai/models',
    },
    note: 'Prices are USD per 1M tokens from OpenRouter. Scores are Artificial Analysis Intelligence Index (and friends).',
  }

  const changed = added.length > 0 || JSON.stringify(finalRows) !== JSON.stringify(previous)

  if (flags.dryRun) {
    console.log(`\n— dry-run: skipping write to ${modelsPath} and ${metaPath}`)
  } else {
    fs.writeFileSync(modelsPath, JSON.stringify(finalRows, null, 2))
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
    console.log(`\n— wrote ${finalRows.length} models to src/data/models.json (+${added.length} / -${removed.length} vs previous run)`)
  }
  if (added.length) console.log(`  added:   ${added.slice(0, 30).join(', ')}${added.length > 30 ? ', …' : ''}`)
  if (removed.length) console.log(`  removed: ${removed.slice(0, 30).join(', ')}${removed.length > 30 ? ', …' : ''}`)
  if (unmatched.length) {
    console.log(`\n${unmatched.length} AA models with scores but no OpenRouter match:`)
    for (const u of unmatched.slice(0, 60)) console.log('   ', u)
  }

  const summaryLines = [
    `Fetched ${finalRows.length} models (+${added.length} / -${removed.length}).`,
    added.length ? `Added: ${added.join(', ')}` : null,
    removed.length ? `Removed: ${removed.join(', ')}` : null,
  ].filter((l): l is string => l != null)

  if (!flags.dryRun) {
    const githubOutput = process.env.GITHUB_OUTPUT
    if (githubOutput) {
      fs.appendFileSync(githubOutput, `changed=${changed}\n`)
      fs.appendFileSync(githubOutput, `added_count=${added.length}\n`)
      fs.appendFileSync(githubOutput, `removed_count=${removed.length}\n`)
      fs.appendFileSync(githubOutput, `total_count=${finalRows.length}\n`)
      fs.appendFileSync(githubOutput, `summary<<EOF\n${summaryLines.join('\n')}\nEOF\n`)
    }
    const githubStepSummary = process.env.GITHUB_STEP_SUMMARY
    if (githubStepSummary) {
      fs.appendFileSync(githubStepSummary, `## AI Pareto data refresh\n\n${summaryLines.map((l) => `- ${l}`).join('\n')}\n`)
    }
  }

  console.log(`\n— done in ${Date.now() - t0}ms`)
}

async function extractPerfParallel(
  rows: Array<Record<string, unknown>>,
  details: Map<string, DetailResult>,
  flags: Flags,
  existingPerfBySlug: Map<string, { outputSpeed: number | null; latencySeconds: number | null; contextWindowTokens: number | null }> | null = null,
): Promise<Array<{ outputSpeed: number | null; latencySeconds: number | null; contextWindowTokens: number | null } | null>> {
  const results = new Array<(null | { outputSpeed: number | null; latencySeconds: number | null; contextWindowTokens: number | null })>(rows.length)
  const queue: number[] = []
  for (let i = 0; i < rows.length; i++) queue.push(i)
  let next = 0
  const failures: string[] = []
  const worker = async () => {
    while (true) {
      const idx = queue[next++]
      if (idx == null) return
      const row = rows[idx] as Record<string, unknown>
      const slug = row.slug as string
      if (!details.has(slug) && existingPerfBySlug) {
        const existing = existingPerfBySlug.get(slug)
        if (existing) {
          results[idx] = existing
          continue
        }
      }
      const perf = await fetchPerfForSlug(slug, details, flags)
      results[idx] = perf
      if (perf == null || (perf.outputSpeed == null && perf.latencySeconds == null)) {
        failures.push(slug)
      }
      console.log(`  [${idx + 1}/${rows.length}] perf ${slug}: speed=${perf?.outputSpeed ?? '-'} lat=${perf?.latencySeconds ?? '-'}`)
    }
  }
  const workers = Math.min(flags.concurrency, Math.max(1, rows.length))
  await Promise.all(Array.from({ length: workers }, worker))
  if (failures.length) {
    console.warn(`  perf extraction failed for: ${failures.slice(0, 20).join(', ')}${failures.length > 20 ? ', …' : ''}`)
  }
  return results
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function usd(n: number | null | undefined): number | null {
  if (n == null) return null
  return Math.round(n * 1e6 * 10000) / 10000
}

function main() {
  const flags = parseFlags()
  const shutdown = () => {
    console.log('\n— interrupted, exiting…')
    process.exit(130)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  run(flags).catch((e) => {
    console.error(`\n✗ fetch-data failed: ${e}`)
    process.exit(1)
  })
}

main()

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
 *   --no-cache        Do not write cache files (.tmp/).
 *   --concurrency N   Parallel workers for detail page crawling (default 4).
 *   --delay MS        Delay between requests per worker (default 400).
 *   --older-than HOURS  Only refresh leaderboards cache if older than this (default 24).
 */
import fs from 'node:fs'
import path from 'node:path'
import { extractFlightChunks, extractModelObjects, extractObjectsContaining, extractPerfFromDetail, parseModelRegistry, type AAModelData, type AAModelMeta } from './aa-utils.mts'
import { AA_TO_OR } from './model-map.ts'
import { CREATOR_WHITELIST, DEFAULT_LEADERBOARD_MAX_AGE_MS, DEFAULT_RETRIES, DEFAULT_TIMEOUT, get } from './shared.mts'

const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = path.join(ROOT, '.tmp')
const PAGES_DIR = path.join(TMP, 'aa_pages')
const OUT_DIR = path.join(ROOT, 'src', 'data')

interface Flags {
  force: boolean
  noCache: boolean
  concurrency: number
  delayMs: number
  leaderboardMaxAgeMs: number
}

function parseFlags(): Flags {
  const args = process.argv.slice(2)
  const flags: Flags = {
    force: false,
    noCache: false,
    concurrency: 4,
    delayMs: 400,
    leaderboardMaxAgeMs: DEFAULT_LEADERBOARD_MAX_AGE_MS,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--force') flags.force = true
    else if (a === '--no-cache') flags.noCache = true
    else if (a === '--concurrency' && args[i + 1]) flags.concurrency = Math.max(1, parseInt(args[++i], 10) || 4)
    else if (a === '--delay' && args[i + 1]) flags.delayMs = Math.max(0, parseInt(args[++i], 10) || 400)
    else if (a === '--older-than' && args[i + 1]) flags.leaderboardMaxAgeMs = Math.max(1, parseInt(args[++i], 10) || 24) * 60 * 60 * 1000
  }
  return flags
}

interface ORModel {
  id: string
  name: string
  context: number | null
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

async function fetchOpenRouter(): Promise<ORModel[]> {
  const json = JSON.parse(await get('https://openrouter.ai/api/v1/models')) as { data: ORModel[] }
  return json.data
}

async function fetchAAModelsPage(): Promise<{ registry: AAModelMeta[]; scored: AAModelData[] }> {
  const html = await get('https://artificialanalysis.ai/models')
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
    html = await get('https://artificialanalysis.ai/leaderboards/models', { timeout: 60000 })
    if (!flags.noCache) fs.writeFileSync(file, html)
  }
  return extractObjectsContaining(extractFlightChunks(html).join(''), '"codingIndex"')
}

async function getDetailHtml(slug: string, flags: Flags): Promise<string> {
  const file = path.join(PAGES_DIR, `${slug}.html`)
  if (!flags.force && fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const html = await get(`https://artificialanalysis.ai/models/${slug}`)
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
  const worker = async () => {
    while (true) {
      const i = next++
      const slug = queue[i]
      if (!slug) return
      try {
        const result = await fetchAADetail(slug, flags)
        results.set(slug, result)
        console.log(`  [${i + 1}/${queue.length}] ${slug} ${result.data?.intelligenceIndex != null ? `II=${result.data.intelligenceIndex.toFixed(1)}` : '(no score)'}`)
      } catch (e) {
        console.warn(`  [${i + 1}/${queue.length}] ${slug} FAILED: ${(e as Error).message}`)
      }
      await new Promise((r) => setTimeout(r, flags.delayMs))
    }
  }
  await Promise.all(Array.from({ length: Math.min(flags.concurrency, queue.length) }, worker))
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

function parseParams(text: string): { total: number | null; active: number | null } {
  const t = text.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ')
  
  // Pattern: NxM B/M/T (e.g. "8x7b", "8x22b")
  const nxm = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
  if (nxm) {
    const experts = parseFloat(nxm[1])
    const perExpert = parseParamValue(nxm[2], nxm[3])
    if (Number.isFinite(experts) && perExpert != null) {
      const total = Math.round(experts * perExpert)
      const active = Math.round(2 * perExpert)
      return { total, active }
    }
  }
  
  const activeMarker = t.match(/a\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
  if (activeMarker) {
    const active = parseParamValue(activeMarker[1], activeMarker[2])
    const before = t.slice(0, activeMarker.index!)
    const paramMatches = [...before.matchAll(/(\d+(?:\.\d+)?)\s*([tTbBmM])\b/g)]
    if (paramMatches.length > 0) {
      const last = paramMatches[paramMatches.length - 1]
      const total = parseParamValue(last[1], last[2])
      return { total, active }
    }
  }
  
  const allMatches = [...t.matchAll(/(\d+(?:\.\d+)?)\s*([tTbBmM])\b/g)]
  if (allMatches.length > 0) {
    const last = allMatches[allMatches.length - 1]
    const total = parseParamValue(last[1], last[2])
    return { total, active: null }
  }
  
  return { total: null, active: null }
}

async function main() {
  const flags = parseFlags()
  fs.mkdirSync(PAGES_DIR, { recursive: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log(`— fetching OpenRouter models (timeout=${DEFAULT_TIMEOUT}ms, retries=${DEFAULT_RETRIES})…`)
  const orModels = await fetchOpenRouter()
  console.log(`  ${orModels.length} models`)

  console.log('— fetching Artificial Analysis models page…')
  const { registry, scored } = await fetchAAModelsPage()
  console.log(`  registry: ${registry.length} models, ${scored.length} scored on page`)

  console.log('— fetching Artificial Analysis leaderboards page…')
  const leaderboard = await fetchAALeaderboards(flags)
  console.log(`  ${leaderboard.length} full model objects (coding index etc.)`)

  const active = registry.filter((m) => !m.deprecated)
  const whitelisted = active.filter(
    (m) => m.creator && CREATOR_WHITELIST.some((c) => m.creator!.name.toLowerCase().includes(c.toLowerCase())),
  )
  const recent = whitelisted.filter((m) => (m.releaseDate ?? '') >= '2025-01-01')
  console.log(`  whitelisted active: ${whitelisted.length}, released >= 2025: ${recent.length}`)

  const haveSlugs = new Set(scored.map((o) => o.release?.slug).filter((s): s is string => Boolean(s)))
  const topSlugs = [...haveSlugs]

  const crawlSlugs = [...new Set([...recent.map((m) => m.slug), ...topSlugs])].filter((s) => !haveSlugs.has(s))
  console.log(`— crawling ${crawlSlugs.length} detail pages (concurrency=${flags.concurrency}, delay=${flags.delayMs}ms, already have ${topSlugs.length})…`)
  const details = await crawlDetails(crawlSlugs, flags)
  console.log(`  got scores for ${details.size} detail pages`)

  const scoreBySlug = new Map<string, AAModelData>()
  for (const o of scored) if (o.release?.slug) scoreBySlug.set(o.release.slug, o)
  for (const o of leaderboard) {
    const key = o.slug ?? o.release?.slug
    if (key) scoreBySlug.set(key, o)
  }
  for (const [slug, d] of details) {
    const prev = scoreBySlug.get(slug)
    if (!prev) {
      scoreBySlug.set(slug, d.data!)
    } else if (d.data) {
      scoreBySlug.set(slug, { ...d.data, ...prev, agenticIndex: prev.agenticIndex ?? d.data.agenticIndex })
    }
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
      ...parseParams(`${or.id} ${or.name} ${m.name}`),
    })
  }

  let perfOk = 0
  let perfMissing = 0
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>
    const slug = row.slug as string
    const cached = details.get(slug)
    try {
      const html = cached?.html ?? await getDetailHtml(slug, flags)
      const perf = extractPerfFromDetail(html, slug)
      row.outputSpeed = perf.outputSpeed != null ? round1(perf.outputSpeed) : null
      row.latencySeconds = perf.latencySeconds != null ? round1(perf.latencySeconds) : null
      if (row.contextTokens == null && perf.contextWindowTokens != null) row.contextTokens = perf.contextWindowTokens
      if (perf.outputSpeed != null || perf.latencySeconds != null) perfOk++
      else perfMissing++
      console.log(`  [${i + 1}/${rows.length}] perf ${slug}: speed=${row.outputSpeed ?? '-'} lat=${row.latencySeconds ?? '-'}`)
    } catch (e) {
      perfMissing++
      console.warn(`  [${i + 1}/${rows.length}] perf FAILED ${slug}: ${(e as Error).message}`)
    }
    if (!cached) await new Promise((r) => setTimeout(r, flags.delayMs))
  }
  console.log(`  perf ok: ${perfOk}, missing both: ${perfMissing}`)

  rows.sort((a, b) => (b.intelligenceIndex as number) - (a.intelligenceIndex as number))

  const modelsPath = path.join(OUT_DIR, 'models.json')
  const metaPath = path.join(OUT_DIR, 'meta.json')

  const previous = fs.existsSync(modelsPath) ? (JSON.parse(fs.readFileSync(modelsPath, 'utf8')) as Array<Record<string, unknown>>) : []
  const MIN_RETENTION = 0.7
  if (previous.length > 0 && rows.length < previous.length * MIN_RETENTION) {
    console.error(
      `\n✗ Aborting: fetched ${rows.length} models, but src/data/models.json currently has ${previous.length} ` +
        `(< ${Math.round(MIN_RETENTION * 100)}% retained). This usually means a source page changed shape. ` +
        `Not overwriting existing data — investigate before re-running.`,
    )
    process.exit(1)
  }

  const prevKeys = new Set(previous.map((r) => `${r.slug}`))
  const newKeys = new Set(rows.map((r) => r.slug as string))
  const added = [...newKeys].filter((k) => !prevKeys.has(k))
  const removed = [...prevKeys].filter((k) => !newKeys.has(k))

  const meta = {
    fetchedAt: new Date().toISOString(),
    sources: {
      openrouter: 'https://openrouter.ai/api/v1/models',
      artificialAnalysis: 'https://artificialanalysis.ai/models',
    },
    note: 'Prices are USD per 1M tokens from OpenRouter. Scores are Artificial Analysis Intelligence Index (and friends).',
  }

  fs.writeFileSync(modelsPath, JSON.stringify(rows, null, 2))
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))

  console.log(`\n— wrote ${rows.length} models to src/data/models.json (+${added.length} / -${removed.length} vs previous run)`)
  if (added.length) console.log(`  added:   ${added.slice(0, 30).join(', ')}${added.length > 30 ? ', …' : ''}`)
  if (removed.length) console.log(`  removed: ${removed.slice(0, 30).join(', ')}${removed.length > 30 ? ', …' : ''}`)
  if (unmatched.length) {
    console.log(`\n${unmatched.length} AA models with scores but no OpenRouter match:`)
    for (const u of unmatched.slice(0, 60)) console.log('   ', u)
  }

  const summaryLines = [
    `Fetched ${rows.length} models (+${added.length} / -${removed.length}).`,
    added.length ? `Added: ${added.join(', ')}` : null,
    removed.length ? `Removed: ${removed.join(', ')}` : null,
  ].filter((l): l is string => l != null)

  const githubOutput = process.env.GITHUB_OUTPUT
  if (githubOutput) {
    const changed = added.length > 0 || removed.length > 0 || rows.length !== previous.length
    fs.appendFileSync(githubOutput, `changed=${changed}\n`)
    fs.appendFileSync(githubOutput, `added_count=${added.length}\n`)
    fs.appendFileSync(githubOutput, `removed_count=${removed.length}\n`)
    fs.appendFileSync(githubOutput, `total_count=${rows.length}\n`)
    fs.appendFileSync(githubOutput, `summary<<EOF\n${summaryLines.join('\n')}\nEOF\n`)
  }
  const githubStepSummary = process.env.GITHUB_STEP_SUMMARY
  if (githubStepSummary) {
    fs.appendFileSync(githubStepSummary, `## AI Pareto data refresh\n\n${summaryLines.map((l) => `- ${l}`).join('\n')}\n`)
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function usd(n: number | null | undefined): number | null {
  if (n == null) return null
  return Math.round(n * 1e6 * 10000) / 10000
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

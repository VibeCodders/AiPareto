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
 */
import fs from 'node:fs'
import path from 'node:path'
import { extractFlightChunks, extractModelObjects, extractObjectsContaining, extractPerfFromDetail, parseModelRegistry, type AAModelData, type AAModelMeta } from './aa-utils.mts'
import { AA_TO_OR } from './model-map.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = path.join(ROOT, '.tmp')
const PAGES_DIR = path.join(TMP, 'aa_pages')
const OUT_DIR = path.join(ROOT, 'src', 'data')
const UA = 'Mozilla/5.0 (compatible; ai-pareto-data-fetcher/0.1)'

const CREATOR_WHITELIST = [
  'OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek', 'SpaceXAI', 'Alibaba',
  'Mistral', 'Amazon', 'NVIDIA', 'Z AI', 'MiniMax', 'StepFun', 'Tencent',
  'Baidu', 'ByteDance Seed', 'Cohere', 'AI21 Labs', 'Perplexity', 'Microsoft',
  'Naver', 'Xiaomi', 'Moonshot', 'Kimi', 'InclusionAI', 'Moonshot AI',
]

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

async function get(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.text()
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

/** The /leaderboards/models page embeds every model's full benchmark object. */
async function fetchAALeaderboards(): Promise<AAModelData[]> {
  const file = path.join(TMP, 'aa_leaderboards.html')
  let html: string
  if (fs.existsSync(file)) {
    html = fs.readFileSync(file, 'utf8')
  } else {
    html = await get('https://artificialanalysis.ai/leaderboards/models')
    fs.writeFileSync(file, html)
  }
  return extractObjectsContaining(extractFlightChunks(html).join(''), '"codingIndex"')
}

async function getDetailHtml(slug: string): Promise<string> {
  const file = path.join(PAGES_DIR, `${slug}.html`)
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const html = await get(`https://artificialanalysis.ai/models/${slug}`)
  fs.writeFileSync(file, html)
  return html
}

async function fetchAADetail(slug: string): Promise<AAModelData | null> {
  const html = await getDetailHtml(slug)
  const raw = extractFlightChunks(html).join('')
  const objs = extractModelObjects(raw)
  // The page's own model object is the one whose release.slug matches.
  return objs.find((o) => o.release?.slug === slug) ?? objs[0] ?? null
}

async function crawlDetails(slugs: string[], concurrency = 4, delayMs = 400): Promise<Map<string, AAModelData>> {
  const results = new Map<string, AAModelData>()
  const queue = [...slugs]
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      const slug = queue[i]
      if (!slug) return
      try {
        const data = await fetchAADetail(slug)
        if (data) results.set(slug, data)
        console.log(`  [${i + 1}/${queue.length}] ${slug} ${data?.intelligenceIndex != null ? `II=${data.intelligenceIndex.toFixed(1)}` : '(no score)'}`)
      } catch (e) {
        console.warn(`  [${i + 1}/${queue.length}] ${slug} FAILED: ${(e as Error).message}`)
      }
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
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

async function main() {
  fs.mkdirSync(PAGES_DIR, { recursive: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('— fetching OpenRouter models…')
  const orModels = await fetchOpenRouter()
  console.log(`  ${orModels.length} models`)

  console.log('— fetching Artificial Analysis models page…')
  const { registry, scored } = await fetchAAModelsPage()
  console.log(`  registry: ${registry.length} models, ${scored.length} scored on page`)

  console.log('— fetching Artificial Analysis leaderboards page…')
  const leaderboard = await fetchAALeaderboards()
  console.log(`  ${leaderboard.length} full model objects (coding index etc.)`)

  const active = registry.filter((m) => !m.deprecated)
  const whitelisted = active.filter(
    (m) => m.creator && CREATOR_WHITELIST.some((c) => m.creator!.name.toLowerCase().includes(c.toLowerCase())),
  )
  const recent = whitelisted.filter((m) => (m.releaseDate ?? '') >= '2025-01-01')
  console.log(`  whitelisted active: ${whitelisted.length}, released >= 2025: ${recent.length}`)

  // Slugs we already have scores for from the models page
  const haveSlugs = new Set(scored.map((o) => o.release?.slug).filter((s): s is string => Boolean(s)))
  const topSlugs = [...haveSlugs]

  // Crawl list: recent whitelisted models + top-scored models from the page
  const crawlSlugs = [...new Set([...recent.map((m) => m.slug), ...topSlugs])].filter((s) => !haveSlugs.has(s))
  console.log(`— crawling ${crawlSlugs.length} detail pages (already have ${topSlugs.length})…`)
  const details = await crawlDetails(crawlSlugs)
  console.log(`  got scores for ${details.size} detail pages`)

  // Build score lookup: leaderboards first, detail pages fill gaps (e.g. agentic).
  const scoreBySlug = new Map<string, AAModelData>()
  for (const o of scored) if (o.release?.slug) scoreBySlug.set(o.release.slug, o)
  for (const o of leaderboard) {
    const key = o.slug ?? o.release?.slug
    if (key) scoreBySlug.set(key, o)
  }
  for (const [slug, d] of details) {
    const prev = scoreBySlug.get(slug)
    if (!prev) {
      scoreBySlug.set(slug, d)
    } else {
      scoreBySlug.set(slug, { ...d, ...prev, agenticIndex: prev.agenticIndex ?? d.agenticIndex })
    }
  }

  // Map AA slugs to OpenRouter model ids via the curated map
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
    })
  }
  // Output speed / latency / context from each detail page's JSON-LD datasets.
  let perfOk = 0
  let perfMissing = 0
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>
    const slug = row.slug as string
    try {
      const html = await getDetailHtml(slug)
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
    await new Promise((r) => setTimeout(r, 200))
  }
  console.log(`  perf ok: ${perfOk}, missing both: ${perfMissing}`)

  rows.sort((a, b) => (b.intelligenceIndex as number) - (a.intelligenceIndex as number))

  const meta = {
    fetchedAt: new Date().toISOString(),
    sources: {
      openrouter: 'https://openrouter.ai/api/v1/models',
      artificialAnalysis: 'https://artificialanalysis.ai/models',
    },
    note: 'Prices are USD per 1M tokens from OpenRouter. Scores are Artificial Analysis Intelligence Index (and friends).',
  }

  fs.writeFileSync(path.join(OUT_DIR, 'models.json'), JSON.stringify(rows, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))

  console.log(`\n— wrote ${rows.length} models to src/data/models.json`)
  if (unmatched.length) {
    console.log(`\n${unmatched.length} AA models with scores but no OpenRouter match:`)
    for (const u of unmatched.slice(0, 60)) console.log('   ', u)
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function usd(n: number | null | undefined): number | null {
  if (n == null) return null
  return Math.round(n * 1e6 * 10000) / 10000 // $/token -> $/1M tokens
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

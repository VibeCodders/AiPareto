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
import { extractFlightChunks, extractModelObjects, parseModelRegistry, type AAModelData, type AAModelMeta } from './aa-utils.mts'

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

async function fetchAADetail(slug: string): Promise<AAModelData | null> {
  const file = path.join(PAGES_DIR, `${slug}.html`)
  let html: string
  if (fs.existsSync(file)) {
    html = fs.readFileSync(file, 'utf8')
  } else {
    html = await get(`https://artificialanalysis.ai/models/${slug}`)
    fs.writeFileSync(file, html)
  }
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

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function slugifyModelId(orId: string): string {
  // "anthropic/claude-sonnet-4-5" -> "claude-sonnet-4-5"
  const short = orId.includes('/') ? orId.split('/').slice(1).join('/') : orId
  return normalize(short)
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

  const active = registry.filter((m) => !m.deprecated)
  const whitelisted = active.filter(
    (m) => m.creator && CREATOR_WHITELIST.some((c) => m.creator!.name.toLowerCase().includes(c.toLowerCase())),
  )
  const recent = whitelisted.filter((m) => (m.releaseDate ?? '') >= '2025-01-01')
  console.log(`  whitelisted active: ${whitelisted.length}, released >= 2025: ${recent.length}`)

  // Slugs we already have scores for from the models page
  const haveSlugs = new Set(scored.map((o) => o.release?.slug).filter(Boolean))
  const topSlugs = [...haveSlugs]

  // Crawl list: recent whitelisted models + top-scored models from the page
  const crawlSlugs = [...new Set([...recent.map((m) => m.slug), ...topSlugs])].filter((s) => !haveSlugs.has(s))
  console.log(`— crawling ${crawlSlugs.length} detail pages (already have ${topSlugs.length})…`)
  const details = await crawlDetails(crawlSlugs)
  console.log(`  got scores for ${details.size} detail pages`)

  // Build score lookup: slug -> AAModelData
  const scoreBySlug = new Map<string, AAModelData>()
  for (const o of scored) if (o.release?.slug) scoreBySlug.set(o.release.slug, o)
  for (const [slug, d] of details) scoreBySlug.set(slug, d)

  // Map AA slugs to OpenRouter model ids
  const orByNorm = new Map<string, ORModel>()
  for (const m of orModels) orByNorm.set(slugifyModelId(m.id), m)

  const rows: Array<Record<string, unknown>> = []
  const unmatched: string[] = []
  for (const m of recent) {
    const data = scoreBySlug.get(m.slug)
    const score = data?.intelligenceIndex
    if (score == null) continue
    const or = orByNorm.get(normalize(m.slug))
    if (!or) {
      unmatched.push(`${m.slug} (${m.name})`)
      continue
    }
    const pricing = or.pricing
    rows.push({
      id: or.id,
      name: or.name,
      family: m.creator?.name ?? null,
      slug: m.slug,
      aaName: m.name,
      released: m.releaseDate,
      isReasoning: m.isReasoning,
      intelligenceIndex: round1(score),
      agenticIndex: data?.agenticIndex != null ? round1(data.agenticIndex) : null,
      omniscience: data?.omniscience != null ? round1(data.omniscience) : null,
      contextTokens: data?.contextWindowTokens ?? or.context,
      openWeights: data?.openSourceCategorization === 'open' || m.name.toLowerCase().includes('oss'),
      inputPerM: usd(or.pricing.prompt),
      outputPerM: usd(or.pricing.completion),
      cacheReadPerM: usd(or.pricing.input_cache_read),
      cacheWritePerM: usd(or.pricing.input_cache_write),
    })
  }
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

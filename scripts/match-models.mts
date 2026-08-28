/**
 * Prints the AA models we have scores for, plus candidate OpenRouter matches,
 * to drive the curated mapping in scripts/model-map.ts.
 *
 * Models that can be auto-matched (fuzzy name match on OpenRouter) are flagged
 * with "(auto-matchable)" so you can decide whether to add an explicit entry.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CREATOR_WHITELIST, norm } from './shared.mts'
import { extractFlightChunks, parseModelRegistry } from './aa-utils.mts'

const ROOT = path.resolve(import.meta.dirname, '..')

function parseFlags(): { json: boolean } {
  const args = process.argv.slice(2)
  const flags = { json: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--json') flags.json = true
  }
  return flags
}

function inScope(creatorName: string | null | undefined): boolean {
  if (!creatorName) return false
  return CREATOR_WHITELIST.some((c) => creatorName.toLowerCase().includes(c.toLowerCase()))
}

const orModels = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/openrouter.json'), 'utf8')) as Array<{
  id: string
  name: string
  context: number | null
  pricing: Record<string, number | null>
}>

let aaActive: Array<{
  slug: string
  name: string
  deprecated: boolean
  releaseDate: string | null
  creator: { name: string } | null
}>

const aaActiveFile = path.join(ROOT, '.tmp', 'aa_active.json')
const aaModelsFile = path.join(ROOT, '.tmp', 'aa_models.html')

if (fs.existsSync(aaActiveFile)) {
  aaActive = JSON.parse(fs.readFileSync(aaActiveFile, 'utf8'))
} else if (fs.existsSync(aaModelsFile)) {
  const html = fs.readFileSync(aaModelsFile, 'utf8')
  const raw = extractFlightChunks(html).join('')
  aaActive = parseModelRegistry(raw)
} else {
  console.error('Missing .tmp/aa_active.json or .tmp/aa_models.html. Run fetch-data first.')
  process.exit(1)
}

// AA scores from crawled detail pages
const scoredSlugs = new Set(
  fs.readdirSync(path.join(ROOT, '.tmp', 'aa_pages'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, '')),
)
// plus models from the registry that are in scope and recently released
for (const m of aaActive) {
  if (m.deprecated) continue
  if ((m.releaseDate ?? '') >= '2025-01-01' && inScope(m.creator?.name)) {
    scoredSlugs.add(m.slug)
  }
}

const aaSlugs = [...scoredSlugs].sort()

const flags = parseFlags()
const rows: Array<{ slug: string; name: string; creator: string | null; releaseDate: string | null; candidates: Array<{ id: string; name: string }>; autoMatched: boolean }> = []

for (const slug of aaSlugs) {
  const aa = aaActive.find((m) => m.slug === slug)
  if (!aa) continue
  const exact = orModels.find((m) => norm(m.id.split('/').slice(1).join('/')) === norm(slug))
  let cands: Array<{ id: string; name: string }> = []
  let autoMatched = false
  if (exact) {
    cands = [{ id: exact.id, name: exact.name }]
  } else {
    // Fuzzy: one direction contains the other
    const fuzzy = orModels.filter((m) => {
      const nn = norm(m.id.split('/').slice(1).join(''))
      const ns = norm(slug)
      return nn.includes(ns) || ns.includes(nn)
    }).slice(0, 4)
    cands = fuzzy.map((c) => ({ id: c.id, name: c.name }))
    autoMatched = fuzzy.length > 0 && !exact
  }
  if (cands.length === 0) continue
  rows.push({
    slug,
    name: aa.name,
    creator: aa.creator?.name ?? null,
    releaseDate: aa.releaseDate,
    candidates: cands,
    autoMatched,
  })
}

if (flags.json) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  for (const r of rows) {
    const status = r.autoMatched ? '  (auto-matchable)' : ''
    console.log(`\n${r.slug}  [${r.name}]${status}`)
    for (const c of r.candidates) console.log(`   OR: ${c.id}  (${c.name})`)
  }
}

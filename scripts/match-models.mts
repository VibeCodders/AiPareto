/**
 * Prints the AA models we have scores for, plus candidate OpenRouter matches,
 * to drive the curated mapping in scripts/model-map.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CREATOR_WHITELIST } from './shared.mts'
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

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const orNorm = orModels.map((m) => ({ ...m, n: norm(m.id.split('/').slice(1).join('/')) }))

const flags = parseFlags()
const rows: Array<{ slug: string; name: string; creator: string | null; releaseDate: string | null; candidates: Array<{ id: string; name: string }> }> = []

for (const slug of [...scoredSlugs].sort()) {
  const aa = aaActive.find((m) => m.slug === slug)
  if (!aa) continue
  const n = norm(slug)
  const exact = orNorm.find((m) => m.n === n)
  const contains = orNorm.filter((m) => m.n.includes(n) || n.includes(m.n)).slice(0, 4)
  const cands = exact ? [exact] : contains
  if (cands.length === 0) continue
  rows.push({
    slug,
    name: aa.name,
    creator: aa.creator?.name ?? null,
    releaseDate: aa.releaseDate,
    candidates: cands.map((c) => ({ id: c.id, name: c.name })),
  })
}

if (flags.json) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  for (const r of rows) {
    console.log(`\n${r.slug}  [${r.name}]`)
    for (const c of r.candidates) console.log(`   OR: ${c.id}  (${c.name})`)
  }
}

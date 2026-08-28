/**
 * Prints the AA models we have scores for, plus candidate OpenRouter matches,
 * to drive the curated mapping in scripts/model-map.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CREATOR_WHITELIST } from './shared.mts'

const ROOT = path.resolve(import.meta.dirname, '..')

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

const aaActive = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp/aa_active.json'), 'utf8')) as Array<{
  slug: string
  name: string
  deprecated: boolean
  releaseDate: string | null
  creator: { name: string } | null
}>

// AA scores from crawled detail pages
const scoredSlugs = new Set(
  fs.readdirSync(path.join(ROOT, '.tmp/aa_pages'))
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

for (const slug of [...scoredSlugs].sort()) {
  const aa = aaActive.find((m) => m.slug === slug)
  if (!aa) continue
  const n = norm(slug)
  // candidates: exact, contains, prefix match
  const exact = orNorm.find((m) => m.n === n)
  const contains = orNorm.filter((m) => m.n.includes(n) || n.includes(m.n)).slice(0, 4)
  const cands = exact ? [exact] : contains
  if (cands.length === 0) continue
  console.log(`\n${slug}  [${aa.name}]`)
  for (const c of cands) console.log(`   OR: ${c.id}  (${c.name})`)
}

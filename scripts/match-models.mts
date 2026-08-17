/**
 * Prints the AA models we have scores for, plus candidate OpenRouter matches,
 * to drive the curated mapping in scripts/model-map.ts.
 */
import fs from 'node:fs'

const orModels = JSON.parse(fs.readFileSync('.tmp/openrouter.json', 'utf8')) as Array<{
  id: string
  name: string
  context: number | null
  pricing: Record<string, number | null>
}>

const aaActive = JSON.parse(fs.readFileSync('.tmp/aa_active.json', 'utf8')) as Array<{
  slug: string
  name: string
  deprecated: boolean
  releaseDate: string | null
  creator: { name: string } | null
}>

// AA scores from crawled detail pages
const scoreFiles = fs.readdirSync('.tmp/aa_pages').filter((f) => f.endsWith('.html'))
const scoredSlugs = new Set(scoreFiles.map((f) => f.replace(/\.html$/, '')))
// plus the 28 from the models page
for (const m of aaActive) {
  if (m.deprecated) continue
  if ((m.releaseDate ?? '') >= '2025-01-01' && m.creator && ['OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek', 'SpaceXAI', 'Alibaba', 'Mistral', 'Amazon', 'NVIDIA', 'Z AI', 'MiniMax', 'StepFun', 'Tencent', 'Baidu', 'ByteDance Seed', 'Cohere', 'AI21 Labs', 'Perplexity', 'Microsoft', 'Naver', 'Xiaomi', 'Moonshot', 'Kimi', 'InclusionAI', 'Moonshot AI'].some((c) => m.creator!.name.toLowerCase().includes(c.toLowerCase()))) {
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

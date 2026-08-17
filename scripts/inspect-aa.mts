import fs from 'node:fs'

const active = JSON.parse(fs.readFileSync('.tmp/aa_active.json', 'utf8')) as Array<{
  slug: string
  name: string
  deprecated: boolean
  isReasoning: boolean
  releaseDate: string | null
  creator: { name: string } | null
}>

const recent = active.filter((m) => (m.releaseDate ?? '') >= '2025-06-01')
const byCreator = new Map<string, Array<{ slug: string; name: string; releaseDate: string | null }>>()
for (const m of recent) {
  const c = m.creator?.name ?? 'unknown'
  if (!byCreator.has(c)) byCreator.set(c, [])
  byCreator.get(c)!.push({ slug: m.slug, name: m.name, releaseDate: m.releaseDate })
}
for (const [c, ms] of [...byCreator.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${c} (${ms.length})`)
  for (const m of ms.slice(0, 20)) console.log(`   ${m.releaseDate}  ${m.slug}  —  ${m.name}`)
}

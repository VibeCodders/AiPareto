import fs from 'node:fs'
import path from 'node:path'
import { extractFlightChunks, findObjectStart, findObjectEnd } from './aa-utils.mts'
import { AA_TO_OR } from './model-map.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const raw = extractFlightChunks(fs.readFileSync(path.join(ROOT, '.tmp/aa_leaderboards.html'), 'utf8')).join('')

// extract every object containing "codingIndex"
const objs: Array<Record<string, unknown>> = []
const seen = new Set<string>()
let p = 0
while (true) {
  const i = raw.indexOf('"codingIndex"', p)
  if (i === -1) break
  const start = findObjectStart(raw, i)
  const end = findObjectEnd(raw, start)
  const slice = raw.slice(start, end)
  try {
    const o = JSON.parse(slice) as Record<string, unknown>
    if (typeof o.slug === 'string' && !seen.has(o.slug)) {
      seen.add(o.slug)
      objs.push(o)
    }
  } catch {
    /* skip */
  }
  p = end
}
console.log('objects:', objs.length)
const bySlug = new Map(objs.map((o) => [o.slug as string, o]))

const has = (o: Record<string, unknown>, k: string) => o[k] != null
console.log('with II:', objs.filter((o) => has(o, 'intelligenceIndex')).length)
console.log('with codingIndex:', objs.filter((o) => has(o, 'codingIndex')).length)
console.log('with agentic:', objs.filter((o) => has(o, 'agenticIndex')).length)
console.log('with omniscience:', objs.filter((o) => has(o, 'omniscience')).length)
console.log('with openrouterApiId:', objs.filter((o) => has(o, 'openrouterApiId')).length)

const mapped = Object.keys(AA_TO_OR)
const covered = mapped.filter((s) => bySlug.has(s) && has(bySlug.get(s)!, 'intelligenceIndex'))
console.log(`map coverage by slug: ${covered.length}/${mapped.length}`)
const coveredCoding = mapped.filter((s) => bySlug.has(s) && has(bySlug.get(s)!, 'codingIndex'))
console.log(`map coverage coding: ${coveredCoding.length}/${mapped.length}`)
console.log('missing from map:', mapped.filter((s) => !bySlug.has(s)).join(', ') || 'none')

// coverage of extra benchmarks on mapped models
for (const k of ['codingIndex', 'tau2', 'hle', 'scicode', 'terminalbenchHard', 'gpqa', 'ifbench', 'lcr', 'apexAgents', 'analystAgent', 'itbenchSre', 'mmmuPro']) {
  const c = mapped.filter((s) => bySlug.has(s) && has(bySlug.get(s)!, k)).length
  console.log(`  mapped with ${k}: ${c}/${mapped.length}`)
}

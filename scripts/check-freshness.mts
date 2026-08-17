/**
 * Dataset freshness check (npm run check-freshness).
 *
 * Compares the live Artificial Analysis registry and OpenRouter catalog against
 * the curated AA_TO_OR mapping, and flags:
 *  - Recent (>= 2025-01-01), non-deprecated AA models that have no entry in the map
 *    (i.e. would silently be skipped by `npm run fetch-data`).
 *  - Mapped OpenRouter ids that no longer exist on OpenRouter (stale mappings).
 *
 * This does not modify any file — it's a read-only report to run periodically
 * (or in CI) so new model releases don't go unnoticed between manual fetch-data runs.
 */
import { extractFlightChunks, parseModelRegistry } from './aa-utils.mts'
import { AA_TO_OR } from './model-map.ts'

const UA = 'Mozilla/5.0 (compatible; ai-pareto-freshness-check/0.1)'

// Keep in sync with CREATOR_WHITELIST in fetch-data.mts — this mirrors the same
// vendor scope so freshness gaps reported here are ones fetch-data would actually pick up.
const CREATOR_WHITELIST = [
  'OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek', 'SpaceXAI', 'Alibaba',
  'Mistral', 'Amazon', 'NVIDIA', 'Z AI', 'MiniMax', 'StepFun', 'Tencent',
  'Baidu', 'ByteDance Seed', 'Cohere', 'AI21 Labs', 'Perplexity', 'Microsoft',
  'Naver', 'Xiaomi', 'Moonshot', 'Kimi', 'InclusionAI', 'Moonshot AI',
]

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.text()
}

async function main() {
  console.log('— fetching Artificial Analysis model registry…')
  const aaHtml = await get('https://artificialanalysis.ai/models')
  const registry = parseModelRegistry(extractFlightChunks(aaHtml).join(''))
  const active = registry.filter((m) => !m.deprecated)
  const whitelisted = active.filter((m) => m.creator && CREATOR_WHITELIST.some((c) => m.creator!.name.toLowerCase().includes(c.toLowerCase())))
  const recent = whitelisted.filter((m) => (m.releaseDate ?? '') >= '2025-01-01')
  console.log(`  ${registry.length} total, ${active.length} active, ${whitelisted.length} in-scope vendors, ${recent.length} released >= 2025-01-01`)

  console.log('— fetching OpenRouter model catalog…')
  const orJson = JSON.parse(await get('https://openrouter.ai/api/v1/models')) as { data: Array<{ id: string }> }
  const orIds = new Set(orJson.data.map((m) => m.id))
  console.log(`  ${orIds.size} models on OpenRouter`)

  const unmapped = recent.filter((m) => !(m.slug in AA_TO_OR))
  const staleMappings = [...new Set(Object.values(AA_TO_OR))].filter((id) => !orIds.has(id))

  console.log(`\n${unmapped.length} recent AA model(s) with no entry in scripts/model-map.ts:`)
  for (const m of unmapped) {
    console.log(`   ${m.slug.padEnd(40)} ${m.creator?.name ?? '?'} — ${m.name} (${m.releaseDate ?? 'no date'})`)
  }

  console.log(`\n${staleMappings.length} mapped OpenRouter id(s) no longer found on OpenRouter:`)
  for (const id of staleMappings) {
    console.log(`   ${id}`)
  }

  if (unmapped.length === 0 && staleMappings.length === 0) {
    console.log('\n✓ Mapping is up to date with both sources.')
  } else {
    console.log('\nRun `npm run fetch-data` after updating scripts/model-map.ts to pick these up.')
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

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
 *
 * Flags:
 *   --timeout MS   HTTP request timeout in ms (default 30000).
 *   --retries N    Number of retries on transient failures (default 3).
 */
import { extractFlightChunks, parseModelRegistry } from './aa-utils.mts'
import { AA_TO_OR } from './model-map.ts'
import { CREATOR_WHITELIST, get } from './shared.mts'

function parseFlags(): { timeout: number; retries: number; verbose: boolean } {
  const args = process.argv.slice(2)
  const flags = { timeout: 30000, retries: 3, verbose: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--timeout' && args[i + 1]) flags.timeout = Math.max(1000, parseInt(args[++i], 10) || 30000)
    else if (a === '--retries' && args[i + 1]) flags.retries = Math.max(0, parseInt(args[++i], 10) || 3)
    else if (a === '--verbose') flags.verbose = true
  }
  return flags
}

async function main() {
  const flags = parseFlags()
  console.log('— fetching Artificial Analysis model registry…')
  const aaHtml = await get('https://artificialanalysis.ai/models', { timeout: flags.timeout, retries: flags.retries })
  const registry = parseModelRegistry(extractFlightChunks(aaHtml).join(''))
  const active = registry.filter((m) => !m.deprecated)
  const whitelisted = active.filter((m) => m.creator && CREATOR_WHITELIST.some((c) => m.creator!.name.toLowerCase().includes(c.toLowerCase())))
  const recent = whitelisted.filter((m) => (m.releaseDate ?? '') >= '2025-01-01')
  console.log(`  ${registry.length} total, ${active.length} active, ${whitelisted.length} in-scope vendors, ${recent.length} released >= 2025-01-01`)

  console.log('— fetching OpenRouter model catalog…')
  const orJson = JSON.parse(await get('https://openrouter.ai/api/v1/models', { timeout: flags.timeout, retries: flags.retries })) as { data: Array<{ id: string }> }
  const orIds = new Set(orJson.data.map((m) => m.id))
  console.log(`  ${orIds.size} models on OpenRouter`)

  const unmapped = recent.filter((m) => !(m.slug in AA_TO_OR))
  const staleMappings = [...new Set(Object.values(AA_TO_OR))].filter((id) => !orIds.has(id))

  const mappedCount = recent.length - unmapped.length
  console.log(`\n${mappedCount}/${recent.length} recent AA models correctly mapped.`)
  if (flags.verbose && mappedCount > 0) {
    const mapped = recent.filter((m) => (m.slug in AA_TO_OR))
    for (const m of mapped.slice(0, 20)) {
      console.log(`   ${m.slug.padEnd(40)} ${m.creator?.name ?? '?'} — ${m.name}`)
    }
    if (mapped.length > 20) console.log(`   ... and ${mapped.length - 20} more`)
  }

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

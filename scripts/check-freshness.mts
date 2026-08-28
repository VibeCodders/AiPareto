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
import { autoMatchSlug, get } from './shared.mts'

function parseFlags(): { timeout: number; retries: number; verbose: boolean; json: boolean; includeDeprecated: boolean } {
  const args = process.argv.slice(2)
  const flags = { timeout: 30000, retries: 3, verbose: false, json: false, includeDeprecated: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--timeout' && args[i + 1]) flags.timeout = Math.max(1000, parseInt(args[++i], 10) || 30000)
    else if (a === '--retries' && args[i + 1]) flags.retries = Math.max(0, parseInt(args[++i], 10) || 3)
    else if (a === '--verbose') flags.verbose = true
    else if (a === '--json') flags.json = true
    else if (a === '--include-deprecated') flags.includeDeprecated = true
  }
  return flags
}

async function main() {
  const flags = parseFlags()
  console.log('— fetching Artificial Analysis model registry…')
  const aaHtml = await get('https://artificialanalysis.ai/models', { timeout: flags.timeout, retries: flags.retries })
  const registry = parseModelRegistry(extractFlightChunks(aaHtml).join(''))
  const active = registry.filter((m) => !m.deprecated)
  const recent = active.filter((m) => !m.releaseDate || m.releaseDate >= '2025-01-01')
  console.log(`  ${registry.length} total, ${active.length} active, ${recent.length} candidate (undated or released >= 2025-01-01)`)

  console.log('— fetching OpenRouter model catalog…')
  const orJson = JSON.parse(await get('https://openrouter.ai/api/v1/models', { timeout: flags.timeout, retries: flags.retries })) as { data: Array<{ id: string }> }
  const orIds = new Set(orJson.data.map((m) => m.id))
  console.log(`  ${orIds.size} models on OpenRouter`)

  const unmapped = recent.filter((m) => !(m.slug in AA_TO_OR))
  const staleMappings = [...new Set(Object.values(AA_TO_OR))].filter((id) => !orIds.has(id))

  // Classify unmapped models: those that can be auto-matched (and are thus
  // safe — fetch-data will pick them up automatically) vs. those that truly
  // have no OpenRouter counterpart.
  const autoMatchable: Array<{ slug: string; name: string; creator: string | null; releaseDate: string | null; orId: string }> = []
  const trulyUnmatched: Array<{ slug: string; name: string; creator: string | null; releaseDate: string | null }> = []
  for (const m of unmapped) {
    const matched = autoMatchSlug(m.slug, [...orIds])
    if (matched) {
      autoMatchable.push({ slug: m.slug, name: m.name, creator: m.creator?.name ?? null, releaseDate: m.releaseDate, orId: matched })
    } else {
      trulyUnmatched.push({ slug: m.slug, name: m.name, creator: m.creator?.name ?? null, releaseDate: m.releaseDate })
    }
  }

  const mappedCount = recent.length - unmapped.length

  const result = {
    ok: trulyUnmatched.length === 0 && staleMappings.length === 0,
    registryTotal: registry.length,
    active: active.length,
    recent: recent.length,
    openRouterTotal: orIds.size,
    mappedCount,
    autoMatchable: autoMatchable.map((m) => ({ slug: m.slug, orId: m.orId })),
    trulyUnmatched: trulyUnmatched.map((m) => ({ slug: m.slug, name: m.name, creator: m.creator, releaseDate: m.releaseDate })),
    staleMappings,
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }

  console.log(`\n${mappedCount}/${recent.length} recent AA models correctly mapped.`)
  if (flags.verbose && mappedCount > 0) {
    const mapped = recent.filter((m) => (m.slug in AA_TO_OR))
    for (const m of mapped.slice(0, 20)) {
      console.log(`   ${m.slug.padEnd(40)} ${m.creator?.name ?? '?'} — ${m.name}`)
    }
    if (mapped.length > 20) console.log(`   ... and ${mapped.length - 20} more`)
  }

  if (autoMatchable.length > 0) {
    console.log(`\n${autoMatchable.length} recent AA model(s) with no entry in scripts/model-map.ts but auto-matchable on OpenRouter:`)
    for (const m of autoMatchable) {
      console.log(`   ${m.slug.padEnd(40)} ${m.creator ?? '?'} — ${m.name} → ${m.orId} (${m.releaseDate ?? 'no date'})`)
    }
    console.log('  (fetch-data will auto-match these; add them to the map for explicit control.)')
  }

  if (trulyUnmatched.length > 0) {
    console.log(`\n${trulyUnmatched.length} recent AA model(s) with no OpenRouter match:`)
    for (const m of trulyUnmatched) {
      console.log(`   ${m.slug.padEnd(40)} ${m.creator ?? '?'} — ${m.name} (${m.releaseDate ?? 'no date'})`)
    }
  }

  console.log(`\n${staleMappings.length} mapped OpenRouter id(s) no longer found on OpenRouter:`)
  for (const id of staleMappings) {
    console.log(`   ${id}`)
  }

  if (trulyUnmatched.length === 0 && staleMappings.length === 0) {
    console.log('\n✓ Mapping is up to date with both sources.')
    if (autoMatchable.length > 0) {
      console.log(`  ${autoMatchable.length} model(s) are auto-matchable; add them to scripts/model-map.ts for explicit control.`)
    }
  } else {
    console.log('\nRun `npm run fetch-data` after updating scripts/model-map.ts to pick these up.')
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

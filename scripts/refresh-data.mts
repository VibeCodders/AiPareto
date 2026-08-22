/**
 * Incremental data refresh (npm run refresh-data).
 *
 * Wrapper around `fetch-data.mts` that defaults to `--refresh` mode:
 * only re-crawls model detail pages that have missing or stale scores,
 * instead of re-downloading everything from scratch.
 *
 * Forwards signals (SIGINT/SIGTERM) and reports errors.
 *
 * Passes through any additional flags to `fetch-data.mts`.
 */
import { run } from './fetch-data.mts'
import { parseFlags } from './fetch-data.mts'

const rawArgs = process.argv.slice(2)
const flags = parseFlags()
flags.refresh = true
const merged = ['--refresh', ...rawArgs.filter((a) => a !== '--refresh')]

console.log(`— refresh-data: running fetch-data ${merged.join(' ')}`)

const shutdown = () => {
  process.exit(1)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

try {
  await run(flags)
} catch (e) {
  console.error(`\n✗ refresh-data failed: ${e}`)
  process.exit(1)
}

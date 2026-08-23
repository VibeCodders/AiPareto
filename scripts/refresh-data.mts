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
import { run, parseFlags } from './fetch-data.mts'

const rawArgs = process.argv.slice(2)

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`
Usage: npm run refresh-data [flags]

Incremental refresh wrapper. Runs fetch-data with --refresh enabled by default.

Flags:
  --no-refresh       Disable incremental refresh (run full fetch).
  --skip-perf        Skip performance extraction (faster).
  --help, -h         Show this help message.
  [all fetch-data flags are also supported]
`)
  process.exit(0)
}

const flags = parseFlags()

const useRefresh = !rawArgs.includes('--no-refresh')
flags.refresh = useRefresh
const merged = useRefresh ? ['--refresh', ...rawArgs.filter((a) => a !== '--refresh' && a !== '--no-refresh')] : rawArgs.filter((a) => a !== '--no-refresh')

console.log(`— refresh-data: running fetch-data ${merged.join(' ')}`)

const shutdown = () => {
  console.log('\n— refresh-data interrupted, exiting…')
  process.exit(130)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

try {
  await run(flags)
} catch (e) {
  console.error(`\n✗ refresh-data failed: ${e}`)
  process.exit(1)
}

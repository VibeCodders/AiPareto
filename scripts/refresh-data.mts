/**
 * Incremental data refresh (npm run refresh-data).
 *
 * Wrapper around `fetch-data.mts` that defaults to `--refresh` mode:
 * only re-crawls model detail pages that have missing or stale scores,
 * instead of re-downloading everything from scratch.
 *
 * Passes through any additional flags to `fetch-data.mts`.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const script = path.join(root, 'scripts', 'fetch-data.mts')

const args = ['--refresh', ...process.argv.slice(2)]

const child = spawn('node', [path.join(root, 'node_modules', '.bin', 'tsx'), script, ...args], {
  stdio: 'inherit',
  cwd: root,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

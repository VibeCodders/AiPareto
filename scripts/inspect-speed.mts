import fs from 'node:fs'
import path from 'node:path'
import { extractJsonLdDatasets } from './aa-utils.mts'

const ROOT = path.resolve(import.meta.dirname, '..')
const PAGES_DIR = path.join(ROOT, '.tmp', 'aa_pages')

const slugArg = process.argv[2]
let file: string
if (slugArg) {
  file = path.join(PAGES_DIR, `${slugArg.replace(/[\\/:*?"<>|]/g, '_')}.html`)
  if (!fs.existsSync(file)) {
    console.error(`No cached detail page for "${slugArg}" at ${file}`)
    process.exit(1)
  }
} else {
  const pages = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html'))
  if (pages.length === 0) {
    console.error('No cached detail pages found. Run fetch-data first.')
    process.exit(1)
  }
  file = path.join(PAGES_DIR, pages[0])
  console.error(`(no slug given, inspecting ${pages[0]})`)
}
const html = fs.readFileSync(file, 'utf8')

for (const d of extractJsonLdDatasets(html)) {
  if (/per second|first answer|Context window/i.test(String(d.description ?? ''))) {
    console.log('=== ', String(d.description ?? '').slice(0, 80))
    console.log('rows:', d.rows.length)
    console.log('keys:', [...new Set(d.rows.flatMap((r) => Object.keys(r)))].join(', '))
    console.log('first row:', JSON.stringify(d.rows[0]).slice(0, 200))
    console.log()
  }
}

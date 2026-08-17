import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const html = fs.readFileSync(path.join(ROOT, '.tmp/aa_pages/claude-opus-5-high.html'), 'utf8')

function extractDatasets(h: string): Array<{ name: string; rows: Array<Record<string, unknown>> }> {
  const out: Array<{ name: string; rows: Array<Record<string, unknown>> }> = []
  let p = 0
  while (true) {
    const s = h.indexOf('"@type":"Dataset"', p)
    if (s === -1) break
    let start = s
    while (start > 0 && h[start] !== '{') start--
    let depth = 0
    let end = start
    let inStr = false
    for (let i = start; i < h.length; i++) {
      const ch = h[i]
      if (inStr) { if (ch === '\\') i++; else if (ch === '"') inStr = false }
      else if (ch === '"') inStr = true
      else if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { end = i + 1; break } }
    }
    const block = h.slice(start, end)
    const name = block.match(/"description":"([^"]*)"/)?.[1] ?? '?'
    const dIdx = block.indexOf('"data":[')
    if (dIdx === -1) { p = end; continue }
    const dataStr = block.slice(dIdx + 7, block.length - 1)
    try {
      out.push({ name, rows: JSON.parse(dataStr) as Array<Record<string, unknown>> })
    } catch { /* skip */ }
    p = end
  }
  return out
}

for (const d of extractDatasets(html)) {
  if (/per second|first answer|Context window/i.test(d.name)) {
    console.log('=== ', d.name.slice(0, 80))
    console.log('rows:', d.rows.length)
    console.log('keys:', [...new Set(d.rows.flatMap((r) => Object.keys(r)))].join(', '))
    console.log('first row:', JSON.stringify(d.rows[0]).slice(0, 200))
    const own = d.rows.find((r) => String(r.detailsUrl).includes('claude-opus-5'))
    console.log('own row:', own ? JSON.stringify(own).slice(0, 200) : 'NOT FOUND')
    console.log()
  }
}

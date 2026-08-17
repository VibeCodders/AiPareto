import fs from 'node:fs'

const html = fs.readFileSync('.aa_models.html', 'utf8')

// Fast extraction of self.__next_f.push([1,"..."]) chunks with indexOf
const chunks: string[] = []
const needle = 'self.__next_f.push([1,"'
let pos = 0
while (true) {
  const s = html.indexOf(needle, pos)
  if (s === -1) break
  const start = s + needle.length
  // find the closing "\")] — scan respecting backslash escapes
  let end = start
  let escaped = false
  while (end < html.length) {
    const ch = html[end]
    if (escaped) {
      escaped = false
    } else if (ch === '\\') {
      escaped = true
    } else if (ch === '"') {
      break
    }
    end++
  }
  chunks.push(html.slice(start, end))
  pos = end + 1
}
console.log('chunks:', chunks.length)
const raw = chunks.map((c) => JSON.parse(`"${c}"`)).join('')
console.log('raw length:', raw.length)

const marker = '"release":{"slug"'
const parsed: Record<string, unknown>[] = []
let from = 0
while (true) {
  const m = raw.indexOf(marker, from)
  if (m === -1) break
  // find the opening brace: walk back from marker to nearest '{' at depth 0,
  // bounded to the last 5000 chars
  let depth = 0
  let start = -1
  const backLimit = Math.max(0, m - 5000)
  for (let i = m; i >= backLimit; i--) {
    const ch = raw[i]
    if (ch === '}') depth++
    else if (ch === '{') {
      depth--
      if (depth === 0) {
        start = i
        break
      }
    }
  }
  if (start === -1) {
    from = m + marker.length
    continue
  }
  depth = 0
  let end = -1
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end === -1) break
  const slice = raw.slice(start, end)
  try {
    parsed.push(JSON.parse(slice) as Record<string, unknown>)
  } catch {
    /* skip malformed */
  }
  from = end
}
console.log('model objects parsed:', parsed.length)
if (parsed.length > 0) {
  const first = parsed[0]
  console.log('keys:', Object.keys(first).join(', '))
  console.log('release:', JSON.stringify(first['release']))
  console.log('intelligenceIndex:', first['intelligenceIndex'])
  console.log('pricing?', JSON.stringify(first['pricing'] ?? null).slice(0, 200))
}

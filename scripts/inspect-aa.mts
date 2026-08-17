import fs from 'node:fs'

const html = fs.readFileSync('.aa_models.html', 'utf8')

const needle = 'self.__next_f.push([1,"'
const chunks: string[] = []
let pos = 0
while (true) {
  const s = html.indexOf(needle, pos)
  if (s === -1) break
  const start = s + needle.length
  let end = start
  let escaped = false
  while (end < html.length) {
    const ch = html[end]
    if (escaped) escaped = false
    else if (ch === '\\') escaped = true
    else if (ch === '"') break
    end++
  }
  chunks.push(html.slice(start, end))
  pos = end + 1
}
const raw = chunks.map((c) => JSON.parse(`"${c}"`)).join('')

// Count elements in the "models" array by counting '"slug":' inside it
const s = raw.indexOf('"models":[', 279000)
let depth = 0
let end = -1
for (let i = s + '"models":'.length; i < raw.length; i++) {
  const ch = raw[i]
  if (ch === '{' || ch === '[') depth++
  else if (ch === '}' || ch === ']') {
    depth--
    if (depth === 0) {
      end = i
      break
    }
  }
}
const arrStr = raw.slice(s + '"models":'.length, end)
console.log('array length:', arrStr.length)
console.log('element count (by "slug":):', (arrStr.match(/"slug":/g) || []).length)
console.log('deprecated count:', (arrStr.match(/"deprecated":true/g) || []).length)

// list first 30 slugs
console.log([...arrStr.matchAll(/"slug":"([a-z0-9-]+)"/g)].slice(0, 40).map((m) => m[1]).join('\n'))

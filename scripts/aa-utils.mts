/**
 * Helpers to extract data from Artificial Analysis Next.js flight payloads.
 * The models page embeds the full model registry and the top models' scores;
 * each model detail page embeds that model's full benchmark data.
 */

export interface AAModelMeta {
  slug: string
  name: string
  deprecated: boolean
  isReasoning: boolean
  releaseDate: string | null
  creator: { name: string } | null
}

export interface AAModelData {
  release: { slug: string; name: string }
  deprecated: boolean
  isReasoning: boolean
  intelligenceIndex: number | null
  intelligenceIndexIsEstimated?: boolean
  agenticIndex: number | null
  omniscience: number | null
  contextWindowTokens: number | null
  openSourceCategorization?: string | null
}

/** Extract and unescape all self.__next_f.push([1,"..."]) chunks from a page. */
export function extractFlightChunks(html: string): string[] {
  const chunks: string[] = []
  const needle = 'self.__next_f.push([1,"'
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
  return chunks.map((c) => JSON.parse(`"${c}"`))
}

/** Find the brace-matched JSON value for a key like "models":[ ... ] inside raw flight text. */
export function extractJsonValue(raw: string, key: string, hintPos: number): string {
  const keyStr = `"${key}":`
  const s = raw.indexOf(keyStr, hintPos)
  if (s === -1) throw new Error(`key "${key}" not found in flight payload`)
  const start = s + keyStr.length
  let depth = 0
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return raw.slice(start, i + 1).replace(/[\r\n]/g, '')
    }
  }
  throw new Error(`unterminated value for key "${key}"`)
}

/** Parse the full model registry array from the /models page flight payload. */
export function parseModelRegistry(raw: string): AAModelMeta[] {
  const value = extractJsonValue(raw, 'models', 279000)
  return JSON.parse(value) as AAModelMeta[]
}

/** Extract full per-model data objects (keyed by "release":{...}) from a page's flight payload. */
export function extractModelObjects(raw: string): AAModelData[] {
  const out: AAModelData[] = []
  const marker = '"release":{"slug"'
  let from = 0
  while (true) {
    const m = raw.indexOf(marker, from)
    if (m === -1) break
    let depth = 0
    let start = -1
    const backLimit = Math.max(0, m - 6000)
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
      out.push(JSON.parse(slice) as AAModelData)
    } catch {
      /* skip malformed */
    }
    from = end
  }
  return out
}

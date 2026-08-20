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
  release?: { slug: string; name: string }
  slug?: string
  name?: string
  deprecated: boolean
  isReasoning: boolean
  intelligenceIndex: number | null
  intelligenceIndexIsEstimated?: boolean
  agenticIndex: number | null
  codingIndex: number | null
  tau2: number | null
  hle: number | null
  omniscience: number | null
  contextWindowTokens: number | null
  openSourceCategorization?: string | null
  isOpenWeights?: boolean | null
  openrouterApiId?: string | null
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

/**
 * Find the index of the opening brace of the JSON object containing pos,
 * walking back. Skips string contents (distinguishing opening vs closing
 * quotes by the following character) and tracks both { } and [ ] nesting.
 */
export function findObjectStart(raw: string, pos: number): number {
  let inStr = false
  let depth = 0
  for (let i = pos; i >= 0; i--) {
    const ch = raw[i]
    if (inStr) {
      if (ch === '\\') i-- // skip escaped char (walking back)
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      // A quote is an OPENING quote (string extends forward) unless the next
      // non-space char is a JSON structure character.
      let j = i + 1
      while (raw[j] === ' ' || raw[j] === '\t') j++
      const next = raw[j]
      // Closing quote (string extends backward) iff followed by a structure char.
      inStr = next === ':' || next === ',' || next === '}' || next === ']' || next === undefined
    } else if (ch === '}' || ch === ']') {
      depth++
    } else if (ch === '{' || ch === '[') {
      if (depth === 0) return i
      depth--
    }
  }
  return -1
}

/**
 * Find the index just past the matching close bracket of the JSON value
 * starting at start. Skips string contents; tracks both { } and [ ] nesting.
 */
export function findObjectEnd(raw: string, start: number): number {
  let inStr = false
  let depth = 0
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inStr) {
      if (ch === '\\') i++ // skip escaped char
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      inStr = true
    } else if (ch === '{' || ch === '[') {
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** Find the brace-matched JSON value for a key like "models":[ ... ] inside raw flight text. */
export function extractJsonValue(raw: string, key: string, hintPos: number): string {
  const keyStr = `"${key}":`
  const s = raw.indexOf(keyStr, hintPos)
  if (s === -1) throw new Error(`key "${key}" not found in flight payload`)
  const start = s + keyStr.length
  const end = findObjectEnd(raw, start)
  if (end === -1) throw new Error(`unterminated value for key "${key}"`)
  return raw.slice(start, end).replace(/[\r\n]/g, '')
}

/** Parse the full model registry array from the /models page flight payload. */
export function parseModelRegistry(raw: string): AAModelMeta[] {
  const keyStr = '"models":'
  let from = 0
  let best: { value: string; len: number } | undefined
  while (true) {
    const s = raw.indexOf(keyStr, from)
    if (s === -1) break
    const start = s + keyStr.length
    const end = findObjectEnd(raw, start)
    if (end === -1) break
    const value = raw.slice(start, end).replace(/[\r\n]/g, '')
    if (value.length > (best?.len ?? 0)) best = { value, len: value.length }
    from = end
  }
  if (!best) throw new Error('key "models" not found in flight payload')
  return JSON.parse(best.value) as AAModelMeta[]
}

/** Extract full per-model data objects (keyed by "release":{...}) from a page's flight payload. */
export function extractModelObjects(raw: string): AAModelData[] {
  return extractObjectsContaining(raw, '"release":{"slug"')
}

/** Performance data pulled from a detail page's JSON-LD datasets. */
export interface AADetailPerf {
  outputSpeed: number | null
  latencySeconds: number | null
  contextWindowTokens: number | null
}

/** All JSON-LD benchmark datasets embedded in a page (rows keyed by detailsUrl). */
export function extractJsonLdDatasets(html: string): Array<{ rows: Array<Record<string, unknown>> }> {
  const out: Array<{ rows: Array<Record<string, unknown>> }> = []
  let p = 0
  while (true) {
    const s = html.indexOf('"@type":"Dataset"', p)
    if (s === -1) break
    let start = s
    while (start > 0 && html[start] !== '{') start--
    const end = findObjectEnd(html, start)
    if (end === -1) break
    const block = html.slice(start, end)
    const dIdx = block.indexOf('"data":[')
    if (dIdx !== -1) {
      const dataStr = block.slice(dIdx + 7, block.length - 1)
      try {
        out.push({ rows: JSON.parse(dataStr) as Array<Record<string, unknown>> })
      } catch {
        /* skip malformed */
      }
    }
    p = end
  }
  return out
}

/**
 * Pull output speed (tok/s), latency (seconds to first answer token, incl.
 * reasoning time) and context window for slug from a cached detail page.
 */
export function extractPerfFromDetail(html: string, slug: string): AADetailPerf {
  const wantUrl = `/models/${slug}`
  const perf: AADetailPerf = { outputSpeed: null, latencySeconds: null, contextWindowTokens: null }
  for (const d of extractJsonLdDatasets(html)) {
    const row = d.rows.find((r) => r.detailsUrl === wantUrl)
    if (!row) continue
    if (typeof row.outputSpeed === 'number') perf.outputSpeed = row.outputSpeed as number
    else if (typeof row.medianOutputSpeed === 'number' && perf.outputSpeed == null) {
      perf.outputSpeed = row.medianOutputSpeed as number
    }
    if (typeof row.reasoningTime === 'number' && typeof row.inputTime === 'number') {
      perf.latencySeconds = (row.inputTime as number) + (row.reasoningTime as number)
    }
    if (typeof row.contextWindowTokens === 'number') perf.contextWindowTokens = row.contextWindowTokens as number
  }
  return perf
}

/**
 * Extract every distinct JSON object whose span contains the given marker
 * (e.g. "codingIndex") from a flight payload, deduped by slug.
 */
export function extractObjectsContaining(raw: string, marker: string): AAModelData[] {
  const out: AAModelData[] = []
  const seen = new Set<string>()
  let from = 0
  while (true) {
    const m = raw.indexOf(marker, from)
    if (m === -1) break
    const start = findObjectStart(raw, m)
    if (start === -1) {
      from = m + marker.length
      continue
    }
    const end = findObjectEnd(raw, start)
    if (end === -1) break
    const slice = raw.slice(start, end)
    try {
      const o = JSON.parse(slice) as AAModelData
      const key = o.slug ?? o.release?.slug
      if (key && !seen.has(key)) {
        seen.add(key)
        out.push(o)
      }
    } catch {
      /* skip malformed */
    }
    from = Math.max(end, m + marker.length)
  }
  return out
}

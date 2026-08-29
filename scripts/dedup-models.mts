#!/usr/bin/env node
/**
 * Deduplicate src/data/models.json in place.
 *
 * Canonical identity: AA `slug`, falling back to OpenRouter `id`.
 * Effort variants of the same base model share an `id` but have distinct
 * slugs, so they are intentionally preserved. True duplicates (same slug) —
 * including slug collisions where one slug maps to more than one `id` — are
 * collapsed to a single row, keeping the most data-complete version.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { exit } from 'node:process'

const file = resolve(import.meta.dirname, '../src/data/models.json')

function rowKey(r: Record<string, unknown>): string {
  const slug = (r.slug as string | undefined)?.trim() || ''
  const id = (r.id as string | undefined)?.trim() || ''
  return slug || id
}

function fieldCount(r: Record<string, unknown>): number {
  let n = 0
  for (const v of Object.values(r)) if (v !== null && v !== undefined) n++
  return n
}

function deduplicateRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>()
  const keyless: Array<Record<string, unknown>> = []
  const dropped: string[] = []
  for (const r of rows) {
    const key = rowKey(r)
    if (!key) {
      keyless.push(r)
      continue
    }
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, r)
    } else if (fieldCount(existing) >= fieldCount(r)) {
      dropped.push(`${key} (dropped id=${String(r.id)} slug=${String(r.slug)})`)
    } else {
      dropped.push(`${key} (dropped id=${String(existing.id)} slug=${String(existing.slug)})`)
      byKey.set(key, r)
    }
  }
  if (dropped.length > 0) {
    console.warn(`deduplicateRows: removed ${dropped.length} duplicate row(s) by slug/id (kept most complete):`)
    for (const d of dropped) console.warn(`  ${d}`)
  }
  return [...byKey.values(), ...keyless]
}

function verifyNoDuplicates(rows: Array<Record<string, unknown>>): void {
  const slugs = new Set<string>()
  const pairs = new Set<string>()
  const dupSlugs: string[] = []
  const dupPairs: string[] = []
  for (const r of rows) {
    const slug = (r.slug as string | undefined)?.trim() || ''
    const id = (r.id as string | undefined)?.trim() || ''
    if (slug) {
      if (slugs.has(slug)) dupSlugs.push(slug)
      slugs.add(slug)
    }
    if (id && slug) {
      const pair = `${id}|${slug}`
      if (pairs.has(pair)) dupPairs.push(pair)
      pairs.add(pair)
    }
  }
  if (dupSlugs.length > 0) {
    console.error(`Internal error: ${dupSlugs.length} duplicate slug(s) in final output: ${[...new Set(dupSlugs)].join(', ')}`)
    exit(1)
  }
  if (dupPairs.length > 0) {
    console.error(`Internal error: ${dupPairs.length} duplicate (id, slug) pair(s) in final output: ${[...new Set(dupPairs)].join(', ')}`)
    exit(1)
  }
}

async function main() {
  let rows: Array<Record<string, unknown>>
  try {
    rows = JSON.parse(await readFile(file, 'utf8'))
  } catch (e) {
    console.error(`Failed to read/parse ${file}:`, e)
    exit(1)
  }

  const before = rows.length
  rows = deduplicateRows(rows)
  const after = rows.length

  verifyNoDuplicates(rows)

  const out = JSON.stringify(rows, null, 2) + '\n'
  await writeFile(file, out)

  console.log(`Deduplication complete: ${before} -> ${after} rows (${before - after} removed).`)
  if (after === before) console.log('No duplicates found; file unchanged.')
}

await main()

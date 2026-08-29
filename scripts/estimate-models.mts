#!/usr/bin/env node
/**
 * Estimation coverage checker (npm run estimate-models).
 *
 * Loads src/data/models.json, runs the runtime k-NN estimation engine
 * (src/estimation.ts), and reports which fields are estimated for each model.
 *
 * This is a diagnostic/verification tool: after a data refresh, it shows
 * whether newly ingested models with partial data (missing benchmarks, specs,
 * or prices) can actually be fully estimated, so data engineers can spot
 * gaps before the data ships to users.
 *
 * Flags:
 *   --json        Output results as JSON (for CI / piped tooling).
 *   --write       Write estimated values to src/data/models-estimated.json.
 *   --slug SLUG   Inspect only the model with the given slug.
 *   --family FAM  Inspect only models in the given family.
 *   --help, -h    Show this help message.
 */
import fs from 'node:fs'
import path from 'node:path'
import { estimateModels, type EstimatedModel, type EstimableField } from '../src/estimation.ts'
import type { Model } from '../src/types.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const MODELS_FILE = path.join(ROOT, 'src', 'data', 'models.json')
const OUT_FILE = path.join(ROOT, 'src', 'data', 'models-estimated.json')

interface ReportEntry {
  slug: string
  id: string
  family: string
  missingFields: string[]
  estimatedFields: string[]
  nullCount: number
}

function parseFlags(): { json: boolean; write: boolean; slug: string | null; family: string | null } {
  const args = process.argv.slice(2)
  const flags = { json: false, write: false, slug: null as string | null, family: null as string | null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--json') flags.json = true
    else if (a === '--write') flags.write = true
    else if (a === '--slug' && args[i + 1]) flags.slug = args[++i]
    else if (a === '--family' && args[i + 1]) flags.family = args[++i]
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: npm run estimate-models [flags]

  --json        Output as JSON.
  --write       Write estimated model data to src/data/models-estimated.json.
  --slug SLUG   Inspect only the model with the given slug.
  --family FAM  Inspect only models in the given family.
  --help, -h    Show this help.`)
      process.exit(0)
    }
  }
  return flags
}

function main(): void {
  const flags = parseFlags()

  if (!fs.existsSync(MODELS_FILE)) {
    console.error(`✗ models.json not found at ${MODELS_FILE}. Run "npm run fetch-data" first.`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8')) as Model[]
  const estimated = estimateModels(raw) as EstimatedModel[]

  const ALL_FIELDS: EstimableField[] = [
    'intelligenceIndex', 'codingIndex', 'agenticIndex', 'tau2', 'hle',
    'omniscience', 'outputSpeed', 'latencySeconds', 'contextTokens',
    'inputPerM', 'outputPerM', 'cacheReadPerM', 'cacheWritePerM',
    'maxCompletionTokens', 'parameters', 'activeParameters',
  ]

  const entries: ReportEntry[] = []
  for (const m of estimated) {
    const est = m.estimatedMetrics
    const missing: string[] = []
    const estimatedFields: string[] = []
    for (const f of ALL_FIELDS) {
      if (m[f] == null) {
        missing.push(f)
      } else if (est && est.has(f)) {
        estimatedFields.push(f)
      }
    }

    const entry: ReportEntry = {
      slug: m.slug,
      id: m.id,
      family: m.family,
      missingFields: missing,
      estimatedFields,
      nullCount: ALL_FIELDS.filter((f) => m[f] == null).length,
    }

    if (flags.slug && entry.slug !== flags.slug) continue
    if (flags.family && entry.family !== flags.family) continue

    entries.push(entry)
  }

  // Also include subscription models in the raw count
  const subModels = raw.filter((m) => m.isSubscription)
  const nonSubNull = estimated.filter((m) => !m.isSubscription).filter((m) => {
    const est = m.estimatedMetrics
    return est && est.size > 0
  }).length

  if (flags.json) {
    const summary = {
      totalModels: estimated.filter((m) => !m.isSubscription).length,
      totalSubscriptions: subModels.length,
      modelsWithEstimates: nonSubNull,
      totalEstimatedFields: entries.reduce((s, e) => s + e.estimatedFields.length, 0),
      modelsStillMissingFields: entries.filter((e) => e.missingFields.length > 0).length,
      entries: flags.slug || flags.family ? entries : undefined,
    }
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log(`\n📊 Estimation coverage report\n`)
    console.log(`Total models:      ${estimated.filter((m) => !m.isSubscription).length}`)
    console.log(`Subscriptions:     ${subModels.length}`)
    console.log(`Models w/ estimates: ${nonSubNull}`)
    console.log(`Total estimated fields: ${entries.reduce((s, e) => s + e.estimatedFields.length, 0)}`)
    console.log(`Models still missing fields: ${entries.filter((e) => e.missingFields.length > 0).length}`)

    if (entries.some((e) => e.missingFields.length > 0)) {
      console.log(`\n⚠ Models with fields that could not be estimated:\n`)
      for (const e of entries.filter((x) => x.missingFields.length > 0)) {
        console.log(`  ${e.slug} [${e.family}]: ${e.missingFields.join(', ')}`)
      }
    }

    if (entries.some((e) => e.estimatedFields.length > 0)) {
      console.log(`\n✓ Models with successfully estimated fields:\n`)
      for (const e of entries.filter((x) => x.estimatedFields.length > 0)) {
        console.log(`  ${e.slug} [${e.family}]: ${e.estimatedFields.join(', ')}`)
      }
    }

    // Models with zero nulls — fully specified, no estimation needed
    const fullModels = entries.filter((e) => e.missingFields.length === 0 && e.estimatedFields.length === 0)
    if (fullModels.length > 0) {
      console.log(`\n✓ ${fullModels.length} models have complete data (no estimation needed).`)
    }
  }

  if (flags.write) {
    const withEstimates = estimated.filter((m) => !m.isSubscription).map((m) => {
      const { estimatedMetrics, ...rest } = m
      return {
        ...rest,
        _estimatedFields: Array.from(estimatedMetrics ?? new Set()).sort(),
      }
    })
    fs.writeFileSync(OUT_FILE, JSON.stringify(withEstimates, null, 2) + '\n')
    console.log(`\n— wrote estimated data to ${OUT_FILE}`)
  }
}

main()

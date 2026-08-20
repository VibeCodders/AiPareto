import type { CostView, MetricKey, Model, ValueScoreBase } from './types'

/**
 * Estimation of missing benchmark, spec, and cost values.
 *
 * Missing fields are estimated using a hierarchical, domain-aware approach:
 * 1. Specialized parametric/ratio heuristics (e.g. cache ratio, output-to-input ratio within family or similar models).
 * 2. Specialized benchmark regressions/anchorings (e.g. coding/agentic/omniscience scaling off intelligenceIndex).
 * 3. Distance-weighted Gaussian kernel k-NN over normalized multidimensional features with
 *    strong architectural affinity (family, reasoning capability, open-weights status, effort variants).
 *
 * Every filled or derived value is tracked in `estimatedMetrics` for full UI transparency.
 */

export type EstimableField =
  | 'intelligenceIndex'
  | 'codingIndex'
  | 'agenticIndex'
  | 'tau2'
  | 'hle'
  | 'omniscience'
  | 'outputSpeed'
  | 'latencySeconds'
  | 'contextTokens'
  | 'inputPerM'
  | 'outputPerM'
  | 'cacheReadPerM'
  | 'cacheWritePerM'
  | 'parameters'
  | 'activeParameters'

export const ESTIMABLE_FIELDS: EstimableField[] = [
  'intelligenceIndex',
  'codingIndex',
  'agenticIndex',
  'tau2',
  'hle',
  'omniscience',
  'outputSpeed',
  'latencySeconds',
  'contextTokens',
  'inputPerM',
  'outputPerM',
  'cacheReadPerM',
  'cacheWritePerM',
  'parameters',
  'activeParameters',
]

export type EstimatedModel = Model & {
  estimatedMetrics: Set<string>
}

const DISTANCE_FEATURES: EstimableField[] = [
  'intelligenceIndex',
  'codingIndex',
  'agenticIndex',
  'hle',
  'omniscience',
  'outputSpeed',
  'latencySeconds',
  'contextTokens',
  'inputPerM',
  'outputPerM',
  'parameters',
  'activeParameters',
]

/** Feature weights tailored depending on what target field is being estimated. */
const FEATURE_WEIGHTS: Record<EstimableField, Partial<Record<EstimableField, number>>> = {
  intelligenceIndex: { codingIndex: 2.0, agenticIndex: 2.0, hle: 1.5, omniscience: 1.5, inputPerM: 0.8, parameters: 1.2 },
  codingIndex: { intelligenceIndex: 2.5, agenticIndex: 2.0, hle: 1.2, omniscience: 1.2 },
  agenticIndex: { intelligenceIndex: 2.5, codingIndex: 2.0, tau2: 1.8, hle: 1.2 },
  tau2: { agenticIndex: 2.5, intelligenceIndex: 1.8, codingIndex: 1.5 },
  hle: { intelligenceIndex: 2.5, omniscience: 2.0, codingIndex: 1.5 },
  omniscience: { intelligenceIndex: 2.5, hle: 2.0, codingIndex: 1.5 },
  outputSpeed: { latencySeconds: 2.0, inputPerM: 1.2, contextTokens: 0.8 },
  latencySeconds: { outputSpeed: 2.0, inputPerM: 1.2, contextTokens: 0.8 },
  contextTokens: { inputPerM: 1.2, outputPerM: 1.2, intelligenceIndex: 0.8, parameters: 1.0 },
  inputPerM: { outputPerM: 3.0, intelligenceIndex: 1.8, codingIndex: 1.2, contextTokens: 1.0 },
  outputPerM: { inputPerM: 3.0, intelligenceIndex: 1.8, codingIndex: 1.2 },
  cacheReadPerM: { inputPerM: 3.0, outputPerM: 1.5 },
  cacheWritePerM: { inputPerM: 3.0, outputPerM: 1.5 },
  parameters: { intelligenceIndex: 2.5, contextTokens: 1.5, inputPerM: 1.2, activeParameters: 1.0 },
  activeParameters: { parameters: 3.0, intelligenceIndex: 1.0 },
}

/** Feature value on a normalized/log scale for fair distance comparison. */
function featureValue(m: Model, k: EstimableField): number | null {
  const v = m[k]
  if (v == null || !Number.isFinite(v)) return null
  if (k === 'contextTokens' || k === 'inputPerM' || k === 'outputPerM' || k === 'cacheReadPerM' || k === 'cacheWritePerM' || k === 'outputSpeed' || k === 'latencySeconds' || k === 'parameters' || k === 'activeParameters') {
    return Math.log10(Math.max(v, 0.0001))
  }
  return v
}

function parseParamValue(numStr: string, unit: string): number | null {
  const n = parseFloat(numStr)
  if (!Number.isFinite(n) || n <= 0) return null
  const u = unit.trim().toLowerCase()
  if (u === 't') return Math.round(n * 1e12)
  if (u === 'b') return Math.round(n * 1e9)
  if (u === 'm') return Math.round(n * 1e6)
  return null
}

const KNOWN_PARAMS_ESTIMATION: Record<string, { parameters: number; activeParameters?: number }> = {
  'llama-4-maverick': { parameters: 400e9, activeParameters: 17e9 },
  'llama-4-scout': { parameters: 109e9, activeParameters: 17e9 },
  'gemma-4-26b-a4b': { parameters: 26e9, activeParameters: 4e9 },
  'gemma-4-31b': { parameters: 31e9 },
  'gemma-3-270m': { parameters: 270e6 },
  'gemma-3-4b': { parameters: 4e9 },
  'gemma-3-12b': { parameters: 12e9 },
  'gemma-3-27b': { parameters: 27e9 },
  'gemma-2-27b': { parameters: 27e9 },
  'gemma-3n-e4b': { parameters: 4e9 },
  'gemma-4-e2b': { parameters: 2e9 },
  'gemma-4-e4b': { parameters: 4e9 },
  'gemma-4-12b': { parameters: 12e9 },
  'ministral-14b': { parameters: 14e9 },
  'ministral-3b': { parameters: 3e9 },
  'ministral-8b': { parameters: 8e9 },
  'mistral-small-3': { parameters: 24e9 },
  'mistral-small-3.1-24b': { parameters: 24e9 },
  'mistral-small-4': { parameters: 24e9 },
  'mistral-medium-3': { parameters: 70e9 },
  'mistral-large-3': { parameters: 123e9 },
  'gpt-oss-120b': { parameters: 120e9 },
  'gpt-oss-20b': { parameters: 20e9 },
  'ring-2.6-1t': { parameters: 1e12 },
  'muse-glimmer-30b': { parameters: 30e9 },
  'muse-spark-1.2': { parameters: 1.2e9 },
  'qwen3.5-122b-a10b': { parameters: 122e9, activeParameters: 10e9 },
  'qwen3.5-35b-a3b': { parameters: 35e9, activeParameters: 3e9 },
  'qwen3.5-397b-a17b': { parameters: 397e9, activeParameters: 17e9 },
  'qwen3.6-35b-a3b': { parameters: 35e9, activeParameters: 3e9 },
  'qwen3.8-27b': { parameters: 27e9 },
  'qwen3.8-2.4t-a95b': { parameters: 2400e9, activeParameters: 95e9 },
  'qwen3-next-80b-a3b': { parameters: 80e9, activeParameters: 3e9 },
  'qwen3-coder-next': { parameters: 235e9 },
  'deepseek-v3-0324': { parameters: 671e9, activeParameters: 37e9 },
  'deepseek-r1-distill-llama-70b': { parameters: 70e9 },
  'llama-3.3-70b': { parameters: 70e9 },
  'llama-3.1-70b': { parameters: 70e9 },
  'llama-3.1-8b': { parameters: 8e9 },
  'llama-3.2-1b': { parameters: 1e9 },
  'llama-3.2-3b': { parameters: 3e9 },
  'llama-guard-4-12b': { parameters: 12e9 },
  'phi-4': { parameters: 14e9 },
  'llama-3.3-70b-instruct': { parameters: 70e9 },
  'nemotron-3-nano-30b-a3b': { parameters: 30e9, activeParameters: 3e9 },
  'nemotron-3-super-120b-a12b': { parameters: 120e9, activeParameters: 12e9 },
  'nemotron-3-ultra-550b-a55b': { parameters: 550e9, activeParameters: 55e9 },
  'nemotron-3.5-lightning': { parameters: 340e9 },
  'nemotron-3-nano-4b': { parameters: 4e9 },
  'nemotron-nano-9b-v2': { parameters: 9e9 },
  'nemotron-nano-12b-v2-vl': { parameters: 12e9 },
  'nemotron-cascade-2-30b-a3b': { parameters: 30e9, activeParameters: 3e9 },
  'kimi-linear-48b-a3b-instruct': { parameters: 48e9, activeParameters: 3e9 },
  'step-3-vl-10b': { parameters: 10e9 },
  'ernie-4-5-300b-a47b': { parameters: 300e9, activeParameters: 47e9 },
  'jamba-1-7-mini': { parameters: 8e9 },
  'jamba-1-7-large': { parameters: 52e9 },
  'jamba-reasoning-3b': { parameters: 3e9 },
}

function extractActiveFromText(text: string): number | null {
  const t = text.toLowerCase()
  const dashActive = t.match(/(\d+(?:\.\d+)?)\s*[bBmM]\s*-\s*a\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
  if (dashActive) {
    return parseParamValue(dashActive[2], dashActive[3])
  }
  const standaloneActive = t.match(/\ba\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
  if (standaloneActive) {
    return parseParamValue(standaloneActive[1], standaloneActive[2])
  }
  return null
}

function estimateMoERatio(text: string, total: number): number | null {
  const t = text.toLowerCase()
  const active = extractActiveFromText(t)
  if (active != null && total > 0) return active / total

  const nxm = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*([bBmM])\b/)
  if (nxm) {
    const experts = parseFloat(nxm[1])
    const perExpert = parseParamValue(nxm[2], nxm[3])
    if (Number.isFinite(experts) && perExpert != null && total > 0) {
      const activeTotal = Math.round(2 * perExpert)
      return activeTotal / total
    }
  }

  if (t.includes('deepseek-v3') || t.includes('deepseek-r1')) return 37e9 / total
  if (t.includes('llama-4-maverick')) return 17e9 / total
  if (t.includes('llama-4-scout')) return 17e9 / total
  if (t.includes('gemma-4')) return 4e9 / total
  if (/\bqwen3\b/.test(t) && /\ba\d+[bBmM]\b/.test(t)) return 0.025

  return null
}

function modelDistance(
  a: Model,
  b: Model,
  targetField: EstimableField,
  max: Record<string, number>,
  min: Record<string, number>,
): number {
  let weightedSum = 0
  let totalWeight = 0
  const weights = FEATURE_WEIGHTS[targetField] ?? {}

  for (const f of DISTANCE_FEATURES) {
    if (f === targetField) continue
    const va = featureValue(a, f)
    const vb = featureValue(b, f)
    if (va == null || vb == null) continue

    const range = (max[f] - min[f]) || 1
    const normalizedDiff = (va - vb) / range
    const w = weights[f] ?? 1.0
    weightedSum += w * (normalizedDiff ** 2)
    totalWeight += w
  }

  let d = totalWeight > 0 ? Math.sqrt(weightedSum / totalWeight) : 1.0

  // Penalty / Affinity matrix for qualitative architecture properties:
  // Same base model/ID family (e.g. variants of Claude 3.5 Sonnet)
  if (a.id && b.id && a.id === b.id) {
    d *= 0.35
  } else if (a.family === b.family) {
    d *= 0.65
  } else {
    d += 0.30
  }

  // Reasoning architecture penalty
  if (a.isReasoning !== b.isReasoning) {
    d += 0.25
  }

  // Open weights vs proprietary pricing / performance profile
  if (a.openWeights !== b.openWeights) {
    d += 0.20
  }

  // Effort variant affinity
  if (a.effort && b.effort && a.effort === b.effort) {
    d *= 0.85
  }

  return d
}

/**
 * Returns a shallow-cloned list where all missing numeric fields (benchmarks, specs, costs)
 * are filled with similarity-weighted estimates.
 * Deterministic: same input always produces the same output.
 */
export function estimateModels(models: Model[]): EstimatedModel[] {
  const max: Record<string, number> = {}
  const min: Record<string, number> = {}

  for (const f of DISTANCE_FEATURES) {
    let mx = -Infinity
    let mn = Infinity
    for (const m of models) {
      const v = featureValue(m, f)
      if (v != null) {
        mx = Math.max(mx, v)
        mn = Math.min(mn, v)
      }
    }
    max[f] = Number.isFinite(mx) ? mx : 1
    min[f] = Number.isFinite(mn) ? mn : 0
  }

  const targetMax: Partial<Record<EstimableField, number>> = {}
  const targetMin: Partial<Record<EstimableField, number>> = {}
  for (const x of ESTIMABLE_FIELDS) {
    let mx = -Infinity
    let mn = Infinity
    for (const m of models) {
      const v = m[x]
      if (v != null) {
        mx = Math.max(mx, v)
        mn = Math.min(mn, v)
      }
    }
    targetMax[x] = Number.isFinite(mx) ? mx : 1
    min[x] = Number.isFinite(mn) ? mn : 0
  }

  const K = 7

  return models.map((m) => {
    const existingEst = (m as Partial<EstimatedModel>).estimatedMetrics
    const estimatedMetrics = new Set<string>(existingEst ? Array.from(existingEst) : [])
    const out = { ...m, estimatedMetrics } as EstimatedModel

    if (m.isSubscription) {
      return out
    }

    // Step 1: Specific smart pricing heuristics for costs
    // Output price from input price via family ratio
    if (out.outputPerM == null && out.inputPerM != null && out.inputPerM > 0) {
      const sameFamilyModels = models.filter((c) => c.family === m.family && c.inputPerM != null && c.inputPerM > 0 && c.outputPerM != null && c.outputPerM > 0)
      if (sameFamilyModels.length > 0) {
        const avgRatio = sameFamilyModels.reduce((s, c) => s + (c.outputPerM! / c.inputPerM!), 0) / sameFamilyModels.length
        out.outputPerM = Number((out.inputPerM * avgRatio).toFixed(4))
        estimatedMetrics.add('outputPerM')
      }
    }

    // Input price from output price via family ratio
    if (out.inputPerM == null && out.outputPerM != null && out.outputPerM > 0) {
      const sameFamilyModels = models.filter((c) => c.family === m.family && c.inputPerM != null && c.inputPerM > 0 && c.outputPerM != null && c.outputPerM > 0)
      if (sameFamilyModels.length > 0) {
        const avgRatio = sameFamilyModels.reduce((s, c) => s + (c.inputPerM! / c.outputPerM!), 0) / sameFamilyModels.length
        out.inputPerM = Number((out.outputPerM * avgRatio).toFixed(4))
        estimatedMetrics.add('inputPerM')
      }
    }

    // Cache read price heuristics
    if (out.cacheReadPerM == null && out.inputPerM != null && out.inputPerM > 0) {
      const sameFamilyCache = models.filter((c) => c.family === m.family && c.inputPerM != null && c.inputPerM > 0 && c.cacheReadPerM != null)
      if (sameFamilyCache.length > 0) {
        const avgRatio = sameFamilyCache.reduce((s, c) => s + (c.cacheReadPerM! / c.inputPerM!), 0) / sameFamilyCache.length
        out.cacheReadPerM = Number((out.inputPerM * avgRatio).toFixed(4))
        estimatedMetrics.add('cacheReadPerM')
      } else {
        // Industry baseline for cache read is typically 25% of input price
        out.cacheReadPerM = Number((out.inputPerM * 0.25).toFixed(4))
        estimatedMetrics.add('cacheReadPerM')
      }
    }

    // Cache write price heuristics
    if (out.cacheWritePerM == null && out.inputPerM != null && out.inputPerM > 0) {
      const sameFamilyCacheW = models.filter((c) => c.family === m.family && c.inputPerM != null && c.inputPerM > 0 && c.cacheWritePerM != null)
      if (sameFamilyCacheW.length > 0) {
        const avgRatio = sameFamilyCacheW.reduce((s, c) => s + (c.cacheWritePerM! / c.inputPerM!), 0) / sameFamilyCacheW.length
        out.cacheWritePerM = Number((out.inputPerM * avgRatio).toFixed(4))
        estimatedMetrics.add('cacheWritePerM')
      } else {
        // Industry baseline for cache write is typically 125% of input price
        out.cacheWritePerM = Number((out.inputPerM * 1.25).toFixed(4))
        estimatedMetrics.add('cacheWritePerM')
      }
    }

    // Step 1.5: Fill known exact parameter counts before k-NN estimation
    if (out.parameters == null || out.activeParameters == null) {
      const text = `${out.name} ${out.id} ${out.aaName}`.toLowerCase().replace(/[–—\s]+/g, '-')
      const known = KNOWN_PARAMS_ESTIMATION[out.id.split('/').pop() ?? '']
      ?? Object.entries(KNOWN_PARAMS_ESTIMATION).find(([k]) => text.includes(k))?.[1]
      if (known) {
        if (out.parameters == null && known.parameters != null) {
          out.parameters = known.parameters
          estimatedMetrics.add('parameters')
        }
        if (out.activeParameters == null && known.activeParameters != null) {
          out.activeParameters = known.activeParameters
          estimatedMetrics.add('activeParameters')
        }
      }
    }

    // Step 2: Impute remaining fields with similarity-weighted k-NN
    for (const x of ESTIMABLE_FIELDS) {
      if (out[x] != null) continue

      const candidates = models
        .filter((c) => c[x] != null && c !== m && !c.isSubscription)
        .map((c) => ({ c, d: modelDistance(m, c, x, max, min) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, K)

      if (candidates.length === 0) continue

      // Gaussian decay kernel weights for smoother and more realistic interpolation
      const sigma = 0.45
      const weights = candidates.map(({ d }) => Math.exp(-(d ** 2) / (2 * sigma * sigma)))
      const total = weights.reduce((s, w) => s + w, 0)
      if (total <= 0) continue

      let v = 0
      for (let i = 0; i < candidates.length; i++) {
        v += (candidates[i].c[x] as number) * weights[i]
      }
      v /= total

      if (x === 'tau2') {
        v = Math.min(1, Math.max(0, Number(v.toFixed(3))))
      } else if (x === 'latencySeconds') {
        v = Math.max(0.1, Number(v.toFixed(2)))
      } else if (x === 'outputSpeed') {
        v = Math.max(1, Number(v.toFixed(1)))
      } else if (x === 'contextTokens') {
        v = Math.max(1024, Math.round(v / 1000) * 1000)
      } else if (x === 'inputPerM' || x === 'outputPerM' || x === 'cacheReadPerM' || x === 'cacheWritePerM') {
        v = Math.max(0.001, Number(v.toFixed(4)))
      } else if (x === 'parameters' || x === 'activeParameters') {
        v = Math.max(1, Math.round(v / 1000000) * 1000000)
      } else {
        v = Math.min(targetMax[x] ?? 100, Math.max(targetMin[x] ?? 0, Number(v.toFixed(2))))
      }

      out[x] = v
      estimatedMetrics.add(x)
    }

    if (out.activeParameters == null && out.parameters != null) {
      const text = `${out.name} ${out.id} ${out.aaName}`.toLowerCase()
      const ratio = estimateMoERatio(text, out.parameters)
      if (ratio != null) {
        out.activeParameters = Math.max(1, Math.round(out.parameters * ratio))
      } else {
        out.activeParameters = out.parameters
      }
      estimatedMetrics.add('activeParameters')
    }

    return out
  })
}

/** Check whether a specific field on the model was estimated. */
export function isFieldEstimated(model: Model, field: string): boolean {
  const est = (model as Partial<EstimatedModel>).estimatedMetrics
  return Boolean(est && est.has(field))
}

/** True when the displayed value for `metric` on `model` is an estimate (direct or derived). */
export function isEstimated(model: Model, metric: MetricKey, valueScoreBase: ValueScoreBase = 'intelligenceIndex'): boolean {
  const est = (model as Partial<EstimatedModel>).estimatedMetrics
  if (!est || est.size === 0) return false
  switch (metric) {
    case 'valueScore':
      return est.has(valueScoreBase) || est.has('inputPerM') || est.has('outputPerM') || est.has('cacheReadPerM')
    case 'speedAdjustedScore':
      return est.has('intelligenceIndex') || est.has('latencySeconds')
    case 'contextValue':
      return est.has('contextTokens') || est.has('inputPerM')
    case 'efficiencyScore':
      return (
        est.has('intelligenceIndex') ||
        est.has('latencySeconds') ||
        est.has('contextTokens') ||
        est.has(valueScoreBase) ||
        est.has('inputPerM') ||
        est.has('outputPerM') ||
        est.has('cacheReadPerM')
      )
    default:
      return est.has(metric)
  }
}

/** True when the calculated cost for a given CostView on `model` relies on an estimated price. */
export function isCostEstimated(model: Model, view: CostView): boolean {
  const est = (model as Partial<EstimatedModel>).estimatedMetrics
  if (!est || est.size === 0) return false
  if (model.isSubscription) return false

  switch (view) {
    case 'input':
      return est.has('inputPerM')
    case 'output':
      return est.has('outputPerM')
    case 'cache':
      return est.has('cacheReadPerM') || est.has('inputPerM')
    case 'blended':
      return est.has('inputPerM') || est.has('outputPerM')
    case 'task':
      return est.has('inputPerM') || est.has('outputPerM')
  }
}



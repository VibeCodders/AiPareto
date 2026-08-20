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
  parameters: { intelligenceIndex: 2.5, contextTokens: 1.5, inputPerM: 1.2 },
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
      const hasMoE = /\b(a\d+(?:\.\d+)?\s*[bBmM]|x\d+\s*[bBmM])\b/.test(text)
      if (hasMoE) {
        out.activeParameters = Math.max(1, Math.round(out.parameters * 0.28))
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



import type { CostView, MetricKey, Model, ValueScoreBase } from './types'

/**
 * Estimation of missing benchmark, spec, and cost values.
 *
 * Missing fields are filled using a similarity-weighted k-NN approach:
 * Euclidean distance is computed across available normalized features (benchmarks,
 * log-transformed context, log-transformed prices) with a penalty for different model families.
 * If cost components like cacheReadPerM or cacheWritePerM are missing for models that have
 * inputPerM, provider/family ratio fallbacks are also applied consistently.
 * Every filled value is recorded in `estimatedFields` so the UI can clearly mark it as an estimate.
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
  'contextTokens',
  'inputPerM',
  'outputPerM',
]

/** Feature value on a normalized/log scale for fair distance comparison. */
function featureValue(m: Model, k: EstimableField): number | null {
  const v = m[k]
  if (v == null || !Number.isFinite(v)) return null
  if (k === 'contextTokens' || k === 'inputPerM' || k === 'outputPerM' || k === 'cacheReadPerM' || k === 'cacheWritePerM') {
    return Math.log10(Math.max(v, 0.0001))
  }
  return v
}

function distance(a: Model, b: Model, max: Record<string, number>, min: Record<string, number>): number {
  let sum = 0
  let n = 0
  for (const f of DISTANCE_FEATURES) {
    const va = featureValue(a, f)
    const vb = featureValue(b, f)
    if (va == null || vb == null) continue
    const range = (max[f] - min[f]) || 1
    sum += ((va - vb) / range) ** 2
    n++
  }
  let d = n > 0 ? Math.sqrt(sum / n) : 1
  // Models from the same family tend to cluster in architecture and pricing structure.
  if (a.family !== b.family) d += 0.35
  return d
}

/**
 * Returns a shallow-cloned list where all missing numeric fields (benchmarks, specs, costs)
 * are filled with similarity-weighted k-NN estimates.
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
    targetMin[x] = Number.isFinite(mn) ? mn : 0
  }

  const K = 8

  return models.map((m) => {
    // Retain existing estimatedMetrics if any, otherwise initialize new
    const existingEst = (m as Partial<EstimatedModel>).estimatedMetrics
    const estimatedMetrics = new Set<string>(existingEst ? Array.from(existingEst) : [])
    const out = { ...m, estimatedMetrics } as EstimatedModel

    // Skip subscription models as their pricing/specs are derived from the plan
    if (m.isSubscription) {
      return out
    }

    for (const x of ESTIMABLE_FIELDS) {
      if (out[x] != null) continue

      // Specific smart fallbacks for cache prices if input price is available
      if (x === 'cacheReadPerM' && out.inputPerM != null) {
        // Find models in same family that have both input and cacheRead to determine ratio
        const sameFamilyCache = models.filter((c) => c.family === m.family && c.inputPerM != null && c.inputPerM > 0 && c.cacheReadPerM != null)
        if (sameFamilyCache.length > 0) {
          const avgRatio = sameFamilyCache.reduce((s, c) => s + (c.cacheReadPerM! / c.inputPerM!), 0) / sameFamilyCache.length
          out.cacheReadPerM = Number((out.inputPerM * avgRatio).toFixed(4))
          estimatedMetrics.add('cacheReadPerM')
          continue
        }
      }

      if (x === 'cacheWritePerM' && out.inputPerM != null) {
        const sameFamilyCacheW = models.filter((c) => c.family === m.family && c.inputPerM != null && c.inputPerM > 0 && c.cacheWritePerM != null)
        if (sameFamilyCacheW.length > 0) {
          const avgRatio = sameFamilyCacheW.reduce((s, c) => s + (c.cacheWritePerM! / c.inputPerM!), 0) / sameFamilyCacheW.length
          out.cacheWritePerM = Number((out.inputPerM * avgRatio).toFixed(4))
          estimatedMetrics.add('cacheWritePerM')
          continue
        }
      }

      const candidates = models
        .filter((c) => c[x] != null && c !== m && !c.isSubscription)
        .map((c) => ({ c, d: distance(m, c, max, min) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, K)

      if (candidates.length === 0) continue

      const weights = candidates.map(({ d }) => 1 / (1 + d * d))
      const total = weights.reduce((s, w) => s + w, 0)
      if (total <= 0) continue

      let v = 0
      for (let i = 0; i < candidates.length; i++) {
        v += (candidates[i].c[x] as number) * weights[i]
      }
      v /= total

      if (x === 'tau2') {
        v = Math.min(1, Math.max(0, v))
      } else if (x === 'latencySeconds') {
        v = Math.max(0.1, Number(v.toFixed(2)))
      } else if (x === 'outputSpeed') {
        v = Math.max(1, Number(v.toFixed(1)))
      } else if (x === 'contextTokens') {
        v = Math.max(1024, Math.round(v / 1000) * 1000)
      } else if (x === 'inputPerM' || x === 'outputPerM' || x === 'cacheReadPerM' || x === 'cacheWritePerM') {
        v = Math.max(0.001, Number(v.toFixed(4)))
      } else {
        v = Math.min(targetMax[x] ?? 100, Math.max(targetMin[x] ?? 0, Number(v.toFixed(2))))
      }

      out[x] = v
      estimatedMetrics.add(x)
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


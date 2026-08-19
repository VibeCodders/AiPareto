import type { MetricKey, Model, ValueScoreBase } from './types'

/**
 * Estimation of missing benchmark/spec values.
 *
 * Prices (inputPerM, outputPerM, cache…) are authoritative provider data and are never
 * estimated; the "cache" cost view already falls back to the input price when missing.
 * The benchmark/spec metrics listed in ESTIMABLE are filled with a similarity-weighted
 * k-NN: a missing value is a weighted average of the k closest models that do have it,
 * where closeness is Euclidean distance over the normalized benchmark features
 * (Intelligence/Coding/Agentic/HLE/Omniscience + log context) plus a family penalty.
 * Every filled value is flagged so the UI can mark it as an estimate.
 */

/** Metrics that are plain numeric fields on Model (as opposed to computed ones). */
type FieldMetric =
  | 'intelligenceIndex'
  | 'codingIndex'
  | 'agenticIndex'
  | 'tau2'
  | 'hle'
  | 'omniscience'
  | 'outputSpeed'
  | 'latencySeconds'
  | 'contextTokens'

export const ESTIMABLE: FieldMetric[] = ['codingIndex', 'agenticIndex', 'tau2', 'outputSpeed', 'latencySeconds']

export type EstimatedModel = Model & { estimatedMetrics: Set<MetricKey> }

const FEATURES: FieldMetric[] = ['intelligenceIndex', 'codingIndex', 'agenticIndex', 'hle', 'omniscience', 'contextTokens']

/** Feature value on a comparable scale (context window is log-transformed). */
function featureValue(m: Model, k: FieldMetric): number | null {
  if (k === 'contextTokens') return m.contextTokens == null ? null : Math.log10(m.contextTokens)
  return m[k]
}

function distance(a: Model, b: Model, max: Record<string, number>): number {
  let sum = 0
  let n = 0
  for (const f of FEATURES) {
    const va = featureValue(a, f)
    const vb = featureValue(b, f)
    if (va == null || vb == null) continue
    sum += ((va / max[f]) - (vb / max[f])) ** 2
    n++
  }
  let d = n > 0 ? Math.sqrt(sum / n) : 1
  // Models from the same family tend to cluster (same training data, same serving stack).
  if (a.family !== b.family) d += 0.35
  return d
}

/**
 * Returns a shallow-cloned list where every missing ESTIMABLE metric is filled with a
 * similarity-weighted k-NN estimate, and each model carries the set of metrics it estimated.
 * Deterministic: same input always produces the same output.
 */
export function estimateModels(models: Model[]): EstimatedModel[] {
  const max: Record<string, number> = {}
  for (const f of FEATURES) {
    let mx = 1
    for (const m of models) {
      const v = featureValue(m, f)
      if (v != null) mx = Math.max(mx, v)
    }
    max[f] = mx
  }
  const targetMax: Partial<Record<MetricKey, number>> = {}
  for (const x of ESTIMABLE) {
    let mx = 1
    for (const m of models) {
      const v = m[x]
      if (v != null) mx = Math.max(mx, v)
    }
    targetMax[x] = mx
  }

  const K = 8
  return models.map((m) => {
    const estimatedMetrics = new Set<MetricKey>()
    const out = { ...m, estimatedMetrics } as EstimatedModel
    for (const x of ESTIMABLE) {
      if (out[x] != null) continue
      const candidates = models
        .filter((c) => c[x] != null && c !== m)
        .map((c) => ({ c, d: distance(m, c, max) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, K)
      if (candidates.length === 0) continue
      const weights = candidates.map(({ d }) => 1 / (1 + d * d))
      const total = weights.reduce((s, w) => s + w, 0)
      if (total <= 0) continue
      let v = 0
      for (let i = 0; i < candidates.length; i++) v += (candidates[i].c[x] as number) * weights[i]
      v /= total
      if (x === 'tau2') v = Math.min(1, Math.max(0, v))
      else if (x === 'latencySeconds') v = Math.max(0.1, v)
      else if (x === 'outputSpeed') v = Math.max(1, v)
      else v = Math.min(targetMax[x] ?? 1, Math.max(0, v))
      out[x] = v
      estimatedMetrics.add(x)
    }
    return out
  })
}

/** True when the displayed value for `metric` on `model` is an estimate (direct or derived). */
export function isEstimated(model: Model, metric: MetricKey, valueScoreBase: ValueScoreBase = 'intelligenceIndex'): boolean {
  const est = (model as Partial<EstimatedModel>).estimatedMetrics
  if (!est || est.size === 0) return false
  switch (metric) {
    case 'valueScore':
      return est.has(valueScoreBase)
    case 'speedAdjustedScore':
      return est.has('intelligenceIndex') || est.has('latencySeconds')
    case 'contextValue':
      return est.has('contextTokens')
    case 'efficiencyScore':
      return est.has('intelligenceIndex') || est.has('latencySeconds') || est.has('contextTokens') || est.has(valueScoreBase)
    default:
      return est.has(metric)
  }
}

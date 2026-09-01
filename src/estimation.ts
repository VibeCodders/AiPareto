import type { CostView, MetricKey, Model, ValueScoreBase } from './types'
import knownParams from './data/known-params.json'

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
  | 'maxCompletionTokens'
  | 'parameters'
  | 'activeParameters'
  | 'hfMMLU'
  | 'hfGSM8K'
  | 'hfHumanEval'
  | 'hfARC'
  | 'hfWinogrande'
  | 'hfHellaSwag'
  | 'hfTruthfulQA'
  | 'hfDownloads'
  | 'arenaElo'
  | 'arenaCodeElo'
  | 'benchlmScore'

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
  'maxCompletionTokens',
  'parameters',
  'activeParameters',
  'hfMMLU',
  'hfGSM8K',
  'hfHumanEval',
  'hfARC',
  'hfWinogrande',
  'hfHellaSwag',
  'hfTruthfulQA',
  'hfDownloads',
  'arenaElo',
  'arenaCodeElo',
  'benchlmScore',
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
  'hfMMLU',
  'hfGSM8K',
  'hfHumanEval',
  'hfARC',
  'hfDownloads',
  'arenaElo',
  'maxCompletionTokens',
  'parameters',
  'activeParameters',
]

/** Feature weights tailored depending on what target field is being estimated. */
const FEATURE_WEIGHTS: Record<EstimableField, Partial<Record<EstimableField, number>>> = {
  intelligenceIndex: { codingIndex: 2.0, agenticIndex: 2.0, hle: 1.5, omniscience: 1.5, inputPerM: 0.8, parameters: 1.2, hfMMLU: 1.8, hfGSM8K: 1.5, hfHumanEval: 1.5, arenaElo: 1.3, benchlmScore: 1.3 },
  codingIndex: { intelligenceIndex: 2.5, agenticIndex: 2.0, hle: 1.2, omniscience: 1.2, hfHumanEval: 2.0, hfMMLU: 1.2, benchlmScore: 1.0, arenaElo: 1.0, arenaCodeElo: 1.3 },
  agenticIndex: { intelligenceIndex: 2.5, codingIndex: 2.0, tau2: 1.8, hle: 1.2, arenaCodeElo: 1.5, benchlmScore: 1.0, hfMMLU: 1.0 },
  tau2: { agenticIndex: 2.5, intelligenceIndex: 1.8, codingIndex: 1.5 },
  hle: { intelligenceIndex: 2.5, omniscience: 2.0, codingIndex: 1.5, hfMMLU: 1.2 },
  omniscience: { intelligenceIndex: 2.5, hle: 2.0, codingIndex: 1.5 },
  outputSpeed: { latencySeconds: 2.0, inputPerM: 1.2, contextTokens: 0.8 },
  latencySeconds: { outputSpeed: 2.0, inputPerM: 1.2, contextTokens: 0.8 },
  contextTokens: { inputPerM: 1.2, outputPerM: 1.2, intelligenceIndex: 0.8, parameters: 1.0, hfDownloads: 0.8 },
  inputPerM: { outputPerM: 3.0, intelligenceIndex: 1.8, codingIndex: 1.2, contextTokens: 1.0, parameters: 1.0 },
  outputPerM: { inputPerM: 3.0, intelligenceIndex: 1.8, codingIndex: 1.2 },
  cacheReadPerM: { inputPerM: 3.0, outputPerM: 1.5 },
  cacheWritePerM: { inputPerM: 3.0, outputPerM: 1.5 },
  maxCompletionTokens: { contextTokens: 2.0, inputPerM: 0.8, outputPerM: 0.8, parameters: 1.0 },
  parameters: { intelligenceIndex: 2.5, contextTokens: 1.5, inputPerM: 1.2, activeParameters: 1.0, hfDownloads: 1.2 },
  activeParameters: { parameters: 3.0, intelligenceIndex: 1.0 },
  hfMMLU: { intelligenceIndex: 3.0, codingIndex: 1.8, agenticIndex: 1.5, hfGSM8K: 1.8, hfHumanEval: 1.2, benchlmScore: 1.0, arenaElo: 0.8 },
  hfGSM8K: { intelligenceIndex: 2.5, codingIndex: 2.0, hfMMLU: 1.8, benchlmScore: 1.0, arenaElo: 0.8 },
  hfHumanEval: { codingIndex: 3.0, agenticIndex: 2.0, intelligenceIndex: 1.5, hfMMLU: 1.2, benchlmScore: 1.0, arenaCodeElo: 0.8 },
  hfARC: { intelligenceIndex: 2.0, hfMMLU: 1.0, parameters: 1.0 },
  hfWinogrande: { intelligenceIndex: 1.0, hfMMLU: 0.8 },
  hfHellaSwag: { intelligenceIndex: 1.0, hfMMLU: 0.8 },
  hfTruthfulQA: { intelligenceIndex: 1.0, hle: 0.8 },
  hfDownloads: { parameters: 1.5, intelligenceIndex: 0.8, contextTokens: 0.8, inputPerM: 0.5 },
  arenaElo: { intelligenceIndex: 2.0, codingIndex: 1.5, agenticIndex: 1.5, benchlmScore: 1.0 },
  arenaCodeElo: { codingIndex: 2.5, agenticIndex: 2.0, intelligenceIndex: 1.2, benchlmScore: 1.0 },
  benchlmScore: { intelligenceIndex: 2.0, codingIndex: 1.5, hfMMLU: 1.5, arenaElo: 1.0 },
}

/** Feature value on a normalized/log scale for fair distance comparison. */
function featureValue(m: Model, k: EstimableField): number | null {
  const v = m[k]
  if (v == null || !Number.isFinite(v)) return null
  if (k === 'contextTokens' || k === 'inputPerM' || k === 'outputPerM' || k === 'cacheReadPerM' || k === 'cacheWritePerM' || k === 'outputSpeed' || k === 'latencySeconds' || k === 'maxCompletionTokens' || k === 'parameters' || k === 'activeParameters' || k === 'hfDownloads') {
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

const KNOWN_PARAMS: Record<string, { parameters: number; activeParameters?: number }> = knownParams as Record<string, { parameters: number; activeParameters?: number }>

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

  // Family-specific MoE ratios: total known params / active ratio for MoE models.
  // Dense (non-MoE) models default to active = total (ratio 1.0) via the caller.
  if (t.includes('deepseek-v3') || t.includes('deepseek-r1') || t.includes('deepseek-v4')) return 37e9 / total
  if (t.includes('llama-4-maverick')) return 17e9 / total
  if (t.includes('llama-4-scout')) return 17e9 / total
  if (t.includes('gemma-4')) return 4e9 / total
  if (t.includes('ernie-4-5')) return 47e9 / total
  if (t.includes('nemotron-3-super')) return 12e9 / total
  if (t.includes('nemotron-3-ultra')) return 55e9 / total
  if (t.includes('nemotron-cascade')) return 3e9 / total
  if (t.includes('nemotron-3-nano')) return 3e9 / total
  if (t.includes('kimi-linear')) return 3e9 / total
  if (t.includes('qwen3.5-397b-a17b')) return 17e9 / total
  if (t.includes('qwen3.5-122b-a10b')) return 10e9 / total
  if (t.includes('qwen3.6-35b-a3b')) return 3e9 / total
  if (t.includes('qwen3-8-2.4t-a95b')) return 95e9 / total
  if (t.includes('qwen3-next-80b')) return 3e9 / total
  if (t.includes('qwen3-coder-next') && total > 0) return Math.round(3e9) / total
  if (t.includes('jamba-1-7-large')) return 12e9 / total
  if (t.includes('jamba-1-7-mini')) return 12e9 / total
  if (/\bqwen3\b/.test(t) && /\ba\d+[bBmM]\b/.test(t)) return 0.025
  if (t.includes('mistral-large')) return 41e9 / total
  if (t.includes('mistral-small-4')) return 6.5e9 / total
  if (t.includes('mistral-small-3')) return 6.5e9 / total
  if (t.includes('gpt-oss-120b')) return 5.1e9 / total
  if (t.includes('gpt-oss-20b')) return 3.6e9 / total
  if (t.includes('kimi-k2-7-code')) return 32e9 / total
  if (t.includes('kimi-k3')) return 104e9 / total
  if (t.includes('minimax-m3')) return 23e9 / total
  if (t.includes('ring-2.6-1t')) return 63e9 / total
  if (t.includes('hy3')) return 21e9 / total
  if (t.includes('ling-3.0-flash')) return 5.1e9 / total
  if (t.includes('mimo-v2.5-pro')) return 42e9 / total
  if (t.includes('mimo-v2')) return 15e9 / total

  return null
}

function computeGlobalAverage(models: Model[], field: EstimableField): number | null {
  const vals = models.map((m) => m[field] as number | null).filter((v): v is number => v != null)
  if (vals.length === 0) return null
  const sum = vals.reduce((s, v) => s + v, 0)
  return sum / vals.length
}

function computeFamilyAverage(models: Model[], family: string | null, field: EstimableField): number | null {
  if (!family) return null
  const vals = models.filter((m) => m.family === family).map((m) => m[field] as number | null).filter((v): v is number => v != null)
  if (vals.length === 0) return null
  const sum = vals.reduce((s, v) => s + v, 0)
  return sum / vals.length
}

function clampAndRound(field: EstimableField, v: number, min: number, max: number): number {
  if (field === 'tau2') return Math.min(1, Math.max(0, Number(v.toFixed(3))))
  if (field === 'latencySeconds') return Math.max(0.1, Number(v.toFixed(2)))
  if (field === 'outputSpeed') return Math.max(1, Number(v.toFixed(1)))
  if (field === 'contextTokens') return Math.max(1024, Math.round(v / 1000) * 1000)
  if (field === 'maxCompletionTokens') return Math.max(1024, Math.round(v / 1024) * 1024)
  if (field === 'inputPerM' || field === 'outputPerM' || field === 'cacheReadPerM' || field === 'cacheWritePerM') return Math.max(0.001, Number(v.toFixed(4)))
  if (field === 'parameters' || field === 'activeParameters') {
    const step = v >= 1e12 ? 1e8 : v >= 1e11 ? 1e7 : v >= 1e10 ? 1e6 : v >= 1e9 ? 1e6 : 1e5
    return Math.max(1, Math.round(v / step) * step)
  }
  if (field === 'hfDownloads') return Math.max(0, Math.round(v))
  return Math.min(max ?? 100, Math.max(min ?? 0, Number(v.toFixed(2))))
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
    targetMin[x] = Number.isFinite(mn) ? mn : 0
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
      const known = KNOWN_PARAMS[out.id.split('/').pop() ?? '']
      ?? Object.entries(KNOWN_PARAMS).find(([k]) => text.includes(k))?.[1]
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

      if (candidates.length === 0) {
        const famAvg = computeFamilyAverage(models, m.family, x)
        if (famAvg != null) {
          out[x] = clampAndRound(x, famAvg, targetMin[x] ?? 0, targetMax[x] ?? 100)
          estimatedMetrics.add(x)
        } else {
          const globalAvg = computeGlobalAverage(models, x)
          if (globalAvg != null) {
            out[x] = clampAndRound(x, globalAvg, targetMin[x] ?? 0, targetMax[x] ?? 100)
            estimatedMetrics.add(x)
          }
        }
        continue
      }

      // Gaussian decay kernel weights for smoother and more realistic interpolation
      const sigma = 0.45
      const weights = candidates.map(({ d }) => Math.exp(-(d ** 2) / (2 * sigma * sigma)))
      const total = weights.reduce((s, w) => s + w, 0)
      if (total <= 0) continue

       let v = 0
      // For parameters and activeParameters, which span many orders of magnitude,
      // average in log10-space (matching how featureValue computes distances) to
      // avoid being dominated by the single largest model.
       const useLogAverage = x === 'parameters' || x === 'activeParameters' || x === 'hfDownloads'
      if (useLogAverage) {
        let logSum = 0
        for (let i = 0; i < candidates.length; i++) {
          logSum += Math.log10(Math.max(candidates[i].c[x] as number, 1)) * weights[i]
        }
        v = Math.pow(10, logSum / total)
      } else {
        for (let i = 0; i < candidates.length; i++) {
          v += (candidates[i].c[x] as number) * weights[i]
        }
        v /= total
      }

      // Round and clamp to the observed target range (clampAndRound applies field-specific
      // precision/flooring, so the type of x is the only thing that varies here).
      v = clampAndRound(x, v, targetMin[x] ?? 0, targetMax[x] ?? 100)

      out[x] = v
      estimatedMetrics.add(x)
    }

    if (out.activeParameters == null && out.parameters != null) {
      const text = `${out.name} ${out.id} ${out.aaName}`.toLowerCase()
      const ratio = estimateMoERatio(text, out.parameters)
      if (ratio != null) {
        out.activeParameters = Math.max(1, Math.round(out.parameters * ratio))
      } else {
        // No MoE pattern matched: assume dense (active = total) unless the family
        // is known for sparse MoE architectures where the active ratio is typically small.
        const denseFamily = /mistral|ministral|gemma-4|gemma-3|gpt-oss|gemini|nemotron-nano|nemotron-3-nano|nemotron-cascade.*3b|phi|kimi-linear|step-3-vl|jamba-1-7-mini|jamba-reasoning|ling-3.0-tiny|ring-flash|tiny-aya|magistral-small|muse|deepseek-v4-flash|north-mini/.test(text)
        if (denseFamily) {
          out.activeParameters = out.parameters
        } else {
          // Unknown architecture: be conservative — a typical MoE active ratio is ~5-15%.
          out.activeParameters = Math.round(out.parameters * 0.10)
        }
      }
      estimatedMetrics.add('activeParameters')
    }

    // Sanity: active parameters can never exceed total parameters.
    if (out.parameters != null && out.activeParameters != null && out.activeParameters > out.parameters) {
      out.activeParameters = out.parameters
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



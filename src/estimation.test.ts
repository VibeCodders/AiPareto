import { describe, it, expect } from 'vitest'
import type { Model } from './types'
import { estimatedFieldCount, isCostEstimated, isFieldEstimated, estimateModels, type EstimatedModel } from './estimation'

/** Minimal model with the numeric fields the estimator reads, defaults null for the rest. */
function model(partial: Partial<Model> = {}): Model {
  return {
    id: 'm',
    name: 'm',
    slug: 'm',
    aaName: 'm',
    family: 'f',
    effort: null,
    released: null,
    isReasoning: false,
    isSubscription: false,
    openWeights: false,
    intelligenceIndex: 90,
    codingIndex: 88,
    agenticIndex: null,
    tau2: null,
    hle: null,
    omniscience: null,
    outputSpeed: null,
    latencySeconds: null,
    contextTokens: null,
    inputPerM: 1,
    outputPerM: 3,
    cacheReadPerM: null,
    cacheWritePerM: null,
    maxCompletionTokens: null,
    parameters: null,
    activeParameters: null,
    huggingFaceId: null,
    hfDownloads: null,
    hfMMLU: null,
    hfGSM8K: null,
    hfHumanEval: null,
    hfARC: null,
    hfWinogrande: null,
    hfHellaSwag: null,
    hfTruthfulQA: null,
    arenaElo: null,
    arenaVotes: null,
    arenaCodeElo: null,
    arenaCodeVotes: null,
    benchlmScore: null,
    benchlmCodingScore: null,
    ...partial,
  }
}

describe('estimateModels', () => {
  it('fills a missing benchmark and flags it as estimated', () => {
    const full = model({ agenticIndex: 85 })
    const missing = model({ id: 'gap', slug: 'gap', agenticIndex: null })
    const out = estimateModels([full, missing])
    const est = out.find((m) => m.slug === 'gap') as EstimatedModel
    expect(est.agenticIndex).not.toBeNull()
    expect(isFieldEstimated(est, 'agenticIndex')).toBe(true)
  })

  it('does not overwrite known values and leaves them unflagged', () => {
    const m = model({ codingIndex: 88 })
    const out = estimateModels([m])
    expect(isFieldEstimated(out[0], 'codingIndex')).toBe(false)
    expect(out[0].codingIndex).toBe(88)
  })

  it('skips subscriptions entirely', () => {
    const sub = model({ id: 'sub', slug: 'sub', isSubscription: true, agenticIndex: null })
    const out = estimateModels([sub])
    expect(isFieldEstimated(out[0], 'agenticIndex')).toBe(false)
    expect(out[0].agenticIndex).toBeNull()
  })

  it('clamps tau2 into 0..1', () => {
    const full = model({ tau2: 0.9, agenticIndex: 95, intelligenceIndex: 98 })
    const missing = model({ id: 'gap', slug: 'gap', tau2: null })
    const out = estimateModels([full, missing])
    const est = out.find((m) => m.slug === 'gap') as EstimatedModel
    if (est.tau2 != null) expect(est.tau2).toBeGreaterThanOrEqual(0)
    if (est.tau2 != null) expect(est.tau2).toBeLessThanOrEqual(1)
  })

  it('reports cost views as estimated when the price was imputed', () => {
    // outputDerived model missing cacheReadPerM -> filled via heuristic and flagged.
    const full = model({ cacheReadPerM: 0.25 })
    const missing = model({ id: 'gap', slug: 'gap', cacheReadPerM: null })
    const out = estimateModels([full, missing])
    const est = out.find((m) => m.slug === 'gap') as EstimatedModel
    expect(isFieldEstimated(est, 'cacheReadPerM')).toBe(true)
    expect(isCostEstimated(est, 'cache')).toBe(true)
  })

  it('derives outputPerM from a same-family input/output ratio', () => {
    const full = model({ slug: 'full', family: 'F', inputPerM: 1, outputPerM: 3 })
    const gap = model({ id: 'gap', slug: 'gap', family: 'F', inputPerM: 2, outputPerM: null })
    const out = estimateModels([full, gap])
    const est = out.find((m) => m.slug === 'gap') as EstimatedModel
    expect(est.outputPerM).toBe(6) // 2 * (3 / 1)
    expect(isFieldEstimated(est, 'outputPerM')).toBe(true)
  })

  it('falls back to the industry baseline for cache write (input * 1.25)', () => {
    const m = model({ inputPerM: 0.2, outputPerM: 0.4 }) // cacheWritePerM stays null
    const out = estimateModels([m])
    const est = out[0] as EstimatedModel
    expect(est.cacheWritePerM).toBeCloseTo(0.2 * 1.25)
    expect(isFieldEstimated(est, 'cacheWritePerM')).toBe(true)
  })

  it('assumes dense active params (= total) when no MoE pattern matches', () => {
    const m = model({ name: 'Phi 4', id: 'phi-4', parameters: 5_000_000_000, activeParameters: null })
    const out = estimateModels([m])
    const est = out[0] as EstimatedModel
    expect(est.activeParameters).toBe(5_000_000_000)
    expect(isFieldEstimated(est, 'activeParameters')).toBe(true)
  })
})

describe('estimatedFieldCount', () => {
  it('counts imputed fields and returns 0 when there are none', () => {
    const none = model({ cacheReadPerM: 0.25 }) // no imputed fields
    expect(estimatedFieldCount(none)).toBe(0)
    const est = model({ id: 'gap', slug: 'gap', cacheReadPerM: null }) as Model & { estimatedMetrics?: Set<string> }
    est.estimatedMetrics = new Set(['cacheReadPerM', 'latencySeconds'])
    expect(estimatedFieldCount(est)).toBe(2)
  })
})

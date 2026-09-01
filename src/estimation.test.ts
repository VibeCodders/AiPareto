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

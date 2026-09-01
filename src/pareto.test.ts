import { describe, it, expect } from 'vitest'
import type { Model, Point } from './types'
import { blendedCostOf, computeFrontier, computeMetric, costOf, dominates, formatMetric, frontierDeltaOf, frontierUpgradeOf, priceRatiosOf } from './pareto'

/** Minimal valid Model for pure-math tests (only fields under test are meaningful). */
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
    intelligenceIndex: 50,
    codingIndex: null,
    agenticIndex: null,
    tau2: null,
    hle: null,
    omniscience: null,
    outputSpeed: null,
    latencySeconds: null,
    contextTokens: null,
    inputPerM: 0.1,
    outputPerM: 0.2,
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

function point(slug: string, x: number, score: number): Point {
  return { model: { ...model(), slug }, x, score }
}

describe('blendedCostOf', () => {
  it('computes the 80/20 blend', () => {
    expect(blendedCostOf(model({ inputPerM: 0.1, outputPerM: 0.2 }))).toBeCloseTo(0.12)
  })
  it('returns null when either price is missing', () => {
    expect(blendedCostOf(model({ inputPerM: 0.1, outputPerM: null }))).toBeNull()
    expect(blendedCostOf(model({ inputPerM: null, outputPerM: 0.2 }))).toBeNull()
  })
})

describe('priceRatiosOf', () => {
  it('derives ratios from the model and applies fallbacks for missing prices', () => {
    const r = priceRatiosOf(model({ inputPerM: 0.1, outputPerM: 0.3, cacheReadPerM: 0.025 }))
    expect(r.output).toBeCloseTo(3)
    expect(r.cacheRead).toBeCloseTo(0.25)
    expect(r.cacheWrite).toBeCloseTo(1.25) // no cache write on the model -> industry fallback
  })
})

describe('costOf', () => {
  const m = model({ inputPerM: 1, outputPerM: 4, cacheReadPerM: 0.5 })
  it('reads the requested view', () => {
    expect(costOf(m, 'input')).toBe(1)
    expect(costOf(m, 'output')).toBe(4)
    expect(costOf(m, 'cache')).toBe(0.5)
    expect(costOf(m, 'blended')).toBeCloseTo(0.8 * 1 + 0.2 * 4)
  })
  it('computes per-task cost from token counts', () => {
    // input price applies to input tokens, output price to output tokens.
    expect(costOf(m, 'task')).toBeCloseTo((3000 / 1e6) * 1 + (1000 / 1e6) * 4)
  })
})

describe('computeFrontier', () => {
  it('keeps only Pareto-optimal points, ascending in X', () => {
    const pts = [point('p1', 1, 5), point('p2', 2, 10), point('p3', 1.5, 4)]
    const frontier = computeFrontier(pts, false, true)
    expect(frontier.map((p) => p.model.slug)).toEqual(['p1', 'p2'])
  })
  it('treats cheaper as better on the X axis by default', () => {
    // p2 has a higher score but costs more, so both p1 and p2 are frontier.
    const front = computeFrontier([point('a', 1, 5), point('b', 2, 10)], false, true)
    expect(front.map((p) => p.model.slug)).toEqual(['a', 'b'])
  })
  it('drops exact duplicates', () => {
    const front = computeFrontier([point('a', 1, 5), point('dup', 1, 5)], false, true)
    expect(front).toHaveLength(1)
  })
})

describe('dominates', () => {
  it('returns true when cheaper AND at least as good', () => {
    expect(dominates(point('a', 1, 10), point('b', 2, 5), false, true)).toBe(true)
  })
  it('returns false when only one axis is better', () => {
    expect(dominates(point('a', 1, 5), point('b', 2, 10), false, true)).toBe(false)
  })
  it('respects lower-is-better metrics', () => {
    // latency: lower score is better
    expect(dominates(point('a', 1, 5), point('b', 2, 9), true, true)).toBe(true)
  })
})

describe('frontierUpgradeOf', () => {
  it('finds the cheapest frontier model with a better score', () => {
    const p = point('p', 1.5, 50)
    const frontier = [point('cheap', 1, 40), point('mid', 2, 55), point('top', 3, 70)]
    const up = frontierUpgradeOf(p, frontier, false)
    expect(up).not.toBeNull()
    expect(up?.model.slug).toBe('mid')
    expect(up?.scoreGain).toBeCloseTo(5)
    expect(up?.costDeltaPct).toBeCloseTo((0.5 / 1.5) * 100)
  })
  it('returns null when the point is already on the frontier', () => {
    const f = point('f', 2, 55)
    expect(frontierUpgradeOf(f, [f], false)).toBeNull()
  })
  it('returns null when nothing scores better', () => {
    const top = point('top', 3, 70)
    expect(frontierUpgradeOf(top, [point('under', 2, 60)], false)).toBeNull()
  })
  it('handles lower-is-better metrics (latency)', () => {
    const p = point('p', 2, 60)
    const up = frontierUpgradeOf(p, [point('fast', 1.5, 40)], true)
    expect(up?.scoreGain).toBeCloseTo(20) // lower latency is better
  })
})

describe('frontierDeltaOf', () => {
  it('reports the % behind the frontier at an equal-or-better X', () => {
    const frontier = [point('f', 2, 10)]
    const behind = point('p', 2, 8)
    expect(frontierDeltaOf(behind, frontier, false, true)).toBeCloseTo(20)
  })
  it('returns 0 for a point that is itself on the frontier', () => {
    const f = point('f', 2, 10)
    expect(frontierDeltaOf(f, [f], false, true)).toBe(0)
  })
})

describe('computeMetric', () => {
  it('resolves valueScore as benchmark / unit cost', () => {
    const m = model({ intelligenceIndex: 100, inputPerM: 1, outputPerM: 4 })
    // blended cost = 0.8*1 + 0.2*4 = 1.6
    expect(computeMetric(m, 'valueScore', 'blended')).toBeCloseTo(100 / 1.6)
  })
})

describe('formatMetric', () => {
  it('formats according to the metric kind', () => {
    expect(formatMetric('latencySeconds', 1.51)).toBe('1.5s')
    expect(formatMetric('outputSpeed', 120)).toBe('120 tok/s')
    expect(formatMetric('contextTokens', 1_250_000)).toBe('1.3M')
    expect(formatMetric('efficiencyScore', 42.4)).toBe('42')
    expect(formatMetric('arenaElo', 1218.2)).toBe('1218')
  })
  it('returns a dash for missing values', () => {
    expect(formatMetric('intelligenceIndex', null)).toBe('—')
  })
})
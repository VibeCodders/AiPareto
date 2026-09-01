import { describe, it, expect } from 'vitest'
import type { CostView, MetricKey, Model, Point } from './types'
import { blendedCostOf, budgetedPareto, computeFrontier, computeMetric, costOf, costUnitLabel, dominates, formatCostChangePct, formatMetric, frontierDeltaOf, frontierUpgradeOf, priceRatiosOf, topValueByBudget } from './pareto'

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
    expect(blendedCostOf(model({ inputPerM: null, outputPerM: null }))).toBeNull()
  })
})

describe('priceRatiosOf', () => {
  it('derives ratios from the model and applies fallbacks for missing prices', () => {
    const r = priceRatiosOf(model({ inputPerM: 0.1, outputPerM: 0.3, cacheReadPerM: 0.025 }))
    expect(r.output).toBeCloseTo(3)
    expect(r.cacheRead).toBeCloseTo(0.25)
    expect(r.cacheWrite).toBeCloseTo(1.25) // no cache write on the model -> industry fallback
  })
  it('uses fallbacks when either price is missing or zero', () => {
    const r = priceRatiosOf(model({ inputPerM: 0.1, outputPerM: null }))
    expect(r.output).toBeCloseTo(3)
    expect(r.cacheRead).toBeCloseTo(0.25)
    // a zero input price can't anchor ratios -> falls back too
    expect(priceRatiosOf(model({ inputPerM: 0, outputPerM: 0.2 })).output).toBeCloseTo(3)
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
  it('charges the flat effective rate for subscriptions', () => {
    const sub = model({ isSubscription: true, effectiveCostPerM: 5, inputPerM: 1, outputPerM: 4 })
    expect(costOf(sub, 'input')).toBe(5)
    expect(costOf(sub, 'output')).toBe(5)
    expect(costOf(sub, 'blended')).toBe(5)
    // task view scales the flat rate by the full token count
    expect(costOf(sub, 'task', 3000, 1000)).toBeCloseTo((4000 / 1e6) * 5)
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
  it('returns [] for no points', () => {
    expect(computeFrontier([], false, true)).toEqual([])
  })
  it('keeps the lowest-latency point for lower-is-better metrics', () => {
    // latency: lower score is better. a is cheaper, b is faster -> both on the frontier.
    const front = computeFrontier([point('a', 1, 10), point('b', 2, 4)], true, true)
    expect(front.map((p) => p.model.slug)).toEqual(['a', 'b'])
  })
  it('treats larger X as better when X is a higher-is-better metric', () => {
    // context on X: more is better, so b (more context AND higher score) dominates a.
    const front = computeFrontier([point('a', 100, 50), point('b', 200, 60)], false, false)
    expect(front.map((p) => p.model.slug)).toEqual(['b'])
  })
  it('keeps flat subscriptions on the frontier regardless of the cost view', () => {
    // A subscription charges its flat effective rate on every unit view, so its X position
    // (and thus the frontier) must be identical whether we price input, blended or output.
    const sub = model({ id: 'sub', slug: 'sub', isSubscription: true, effectiveCostPerM: 5, intelligenceIndex: 80 })
    const cheap = model({ slug: 'cheap', intelligenceIndex: 50 }) // paygo, blended cost ~0.12
    for (const view of ['input', 'blended', 'output'] as CostView[]) {
      expect(costOf(sub, view)).toBe(5)
      const pts = [sub, cheap].map((m) => ({ model: m, x: costOf(m, view, 3000, 1000)!, score: m.intelligenceIndex! }))
      const slugs = computeFrontier(pts, false, true).map((p) => p.model.slug)
      expect(slugs).toEqual(['cheap', 'sub'])
    }
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
  it('returns false when both axes are equal', () => {
    expect(dominates(point('a', 1, 5), point('b', 1, 5), false, true)).toBe(false)
  })
  it('honors a higher-is-better X metric', () => {
    // more context AND higher score dominates
    expect(dominates(point('a', 200, 60), point('b', 100, 50), false, false)).toBe(true)
    // equal score but more context -> still dominates via the strict X
    expect(dominates(point('a', 200, 50), point('b', 100, 50), false, false)).toBe(true)
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
  it('reports positive delta for lower-is-better metrics', () => {
    // point latency (8) is worse than frontier latency (4)
    expect(frontierDeltaOf(point('p', 2, 8), [point('f', 2, 4)], true, true)).toBeCloseTo(100)
  })
  it('returns null when the point beats the whole frontier', () => {
    // cheapest frontier point costs 1, our point is cheaper (0.5) with no reference
    expect(frontierDeltaOf(point('p', 0.5, 50), [point('f', 1, 30)], false, true)).toBeNull()
  })
  it('returns null when the reference score is zero', () => {
    expect(frontierDeltaOf(point('p', 2, 5), [point('f', 2, 0)], false, true)).toBeNull()
  })
  it('computes the delta against a task-cost X axis', () => {
    // X values derived from per-task cost, not an arbitrary unit: same prices => same X,
    // so the point sits behind the frontier at its own cost and lags the frontier by 25%.
    const mk = (slug: string, intel: number) => {
      const m = model({ slug, intelligenceIndex: intel, inputPerM: 1, outputPerM: 2 })
      return { model: m, x: costOf(m, 'task', 3000, 1000)!, score: m.intelligenceIndex! }
    }
    const frontierPoint = mk('f', 80)
    const behind = mk('p', 60)
    expect(frontierDeltaOf(behind, [frontierPoint], false, true)).toBeCloseTo(25)
  })
})

describe('topValueByBudget', () => {
  it('keeps only models within the budget and ranks by valueScore', () => {
    const cheap = model({ intelligenceIndex: 60 })
    const pricey = model({ intelligenceIndex: 95, inputPerM: 0.5 })
    const rows = topValueByBudget([cheap, pricey], 'blended', 3000, 1000, 'intelligenceIndex', 'intelligenceIndex', undefined, 1)
    // cheap costs 0.12/1M and stays in budget 1; pricey costs 0.5/1M and stays too;
    // both have a valueScore, so both appear, best value first.
    expect(rows.length).toBe(2)
    expect(rows[0].model.slug).toBe(cheap.slug)
    expect(rows[0].cost).toBeLessThanOrEqual(1)
  })
  it('excludes models over budget', () => {
    const m = model({ intelligenceIndex: 95, inputPerM: 5 }) // blended cost > budget 1
    expect(topValueByBudget([m], 'blended', 3000, 1000, 'intelligenceIndex', 'intelligenceIndex', undefined, 1)).toHaveLength(0)
  })
  it('returns [] for a zero budget', () => {
    expect(topValueByBudget([model()], 'blended', 3000, 1000, 'intelligenceIndex', 'intelligenceIndex', undefined, 0)).toHaveLength(0)
  })
  it('ranks by the metric score when requested', () => {
    const smart = model({ slug: 'smart', intelligenceIndex: 95, inputPerM: 0.5 })
    const cheap = model({ slug: 'cheap', intelligenceIndex: 55 })
    const byScore = topValueByBudget([smart, cheap], 'blended', 3000, 1000, 'intelligenceIndex', 'intelligenceIndex', undefined, 1, 8, 'score')
    const byValue = topValueByBudget([smart, cheap], 'blended', 3000, 1000, 'intelligenceIndex', 'intelligenceIndex', undefined, 1, 8, 'value')
    expect(byScore[0].model.slug).toBe('smart')
    expect(byValue[0].model.slug).toBe('cheap')
  })
  it('ranks by efficiency score when requested', () => {
    // Efficiency here weights speed only, so the fast model outranks the slow one at equal smarts.
    const opts = { weights: { value: 0, speed: 1, context: 0 }, norm: { value: 1, speed: 100, context: 1 } }
    const highEff = model({ slug: 'highEff', intelligenceIndex: 90, latencySeconds: 1 })
    const lowEff = model({ slug: 'lowEff', intelligenceIndex: 90, latencySeconds: 100 })
    const byEff = topValueByBudget([highEff, lowEff], 'blended', 3000, 1000, 'intelligenceIndex', 'intelligenceIndex', opts, 10, 8, 'efficiency')
    expect(byEff.length).toBe(2)
    expect(byEff[0].model.slug).toBe('highEff')
  })
  it('respects the maxRows cap', () => {
    const many = Array.from({ length: 12 }, (_, i) => model({ intelligenceIndex: 50 + i }))
    expect(topValueByBudget(many, 'blended', 3000, 1000, 'intelligenceIndex', 'intelligenceIndex', undefined, 100, 5)).toHaveLength(5)
  })
})

describe('budgetedPareto', () => {
  it('marks in-budget Pareto picks and the % cost to the next better value', () => {
    const cheap = model({ slug: 'cheap', intelligenceIndex: 60 }) // value 60/0.12 = 500
    const mid = model({ slug: 'mid', intelligenceIndex: 300, inputPerM: 0.5, outputPerM: 0.5 }) // value 300/0.5 = 600
    const pricey = model({ slug: 'pricey', intelligenceIndex: 98, inputPerM: 5 }) // blended ~5 -> over budget 1
    const res = budgetedPareto([cheap, mid, pricey], 'blended', 3000, 1000, 1, 'intelligenceIndex')
    // pricey is excluded; cheap and mid are both value-Pareto within the budget.
    expect(res.frontierSlugs.has('cheap')).toBe(true)
    expect(res.frontierSlugs.has('mid')).toBe(true)
    expect(res.frontierSlugs.size).toBe(2)
    expect(res.costToNext.has('cheap')).toBe(true) // % cost to step up to 'mid'
    expect(res.costToNext.has('pricey')).toBe(false)
  })
})

describe('formatCostChangePct', () => {
  it('formats signed % changes and a dash for missing values', () => {
    expect(formatCostChangePct(12.4)).toBe('+12%')
    expect(formatCostChangePct(-5.6)).toBe('−6%')
    expect(formatCostChangePct(0)).toBe('+0%')
    expect(formatCostChangePct(null)).toBe('—')
    expect(formatCostChangePct(undefined)).toBe('—')
  })
})

describe('costUnitLabel', () => {
  it('labels task view per task and everything else per 1M', () => {
    expect(costUnitLabel('task')).toBe('/task')
    expect(costUnitLabel('input')).toBe('/1M')
    expect(costUnitLabel('blended')).toBe('/1M')
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
  it('formats derived and community metrics', () => {
    expect(formatMetric('contextValue', 2_500_000)).toBe('2.5M/$')
    expect(formatMetric('valueScore', 51.6)).toBe('51.6')
    expect(formatMetric('arenaCodeElo', 1345.7)).toBe('1346')
  })
  it('rounds tokens appropriately at the million boundary', () => {
    expect(formatMetric('contextTokens', 999_999)).toBe('1000k')
    expect(formatMetric('contextTokens', 1_000_000)).toBe('1.0M')
  })
  it('covers every MetricKey', () => {
    const all: MetricKey[] = [
      'intelligenceIndex', 'codingIndex', 'agenticIndex', 'tau2', 'hle', 'omniscience',
      'outputSpeed', 'latencySeconds', 'contextTokens', 'valueScore', 'speedAdjustedScore',
      'contextValue', 'efficiencyScore', 'hfMMLU', 'hfGSM8K', 'hfHumanEval', 'hfARC',
      'hfWinogrande', 'hfHellaSwag', 'hfTruthfulQA', 'arenaElo', 'arenaCodeElo', 'benchlmScore',
    ]
    // Missing values always render as a dash, for every metric type.
    for (const key of all) {
      expect(formatMetric(key, null)).toBe('—')
      const v = formatMetric(key, 1234.56)
      expect(v.length).toBeGreaterThan(0)
      expect(v).not.toBe('—')
    }
    // Representative exact formats per kind.
    expect(formatMetric('intelligenceIndex', 1234.56)).toBe('1234.6')
    expect(formatMetric('outputSpeed', 1234.56)).toBe('1235 tok/s')
    expect(formatMetric('latencySeconds', 1234.56)).toBe('1234.6s')
    expect(formatMetric('efficiencyScore', 1234.56)).toBe('1235')
    expect(formatMetric('arenaElo', 1234.56)).toBe('1235')
    expect(formatMetric('arenaCodeElo', 1234.56)).toBe('1235')
  })
})
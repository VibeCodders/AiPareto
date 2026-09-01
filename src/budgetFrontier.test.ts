import { describe, it, expect } from 'vitest'
import type { Model, Point } from './types'
import { bestValuePoint, budgetFrontierScale, frontierStepPath } from './budgetFrontier'

function model(slug: string): Model {
  return {
    id: slug,
    name: slug,
    slug,
    aaName: slug,
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
  }
}

function point(slug: string, x: number, score: number): Point {
  return { model: model(slug), x, score }
}

describe('budgetFrontierScale', () => {
  const s = budgetFrontierScale([point('a', 0.1, 10), point('b', 10, 500)], 5, 200, 100, 10, 10)

  it('maps the data domain into the plot area on a log X / linear Y scale', () => {
    // X is log: min cost sits at the left padding, max at the right edge.
    expect(s.x(0.1)).toBeCloseTo(10)
    expect(s.x(10)).toBeCloseTo(190)
    // Y is linear: max value at the top padding, zero at the bottom.
    expect(s.y(500)).toBeCloseTo(10)
    expect(s.y(0)).toBeCloseTo(90)
  })

  it('keeps the budget cap inside the X domain', () => {
    expect(s.budgetX).not.toBeNull()
    expect(s.budgetX!).toBeGreaterThanOrEqual(10)
    expect(s.budgetX!).toBeLessThanOrEqual(190)
  })

  it('returns no cap line for a zero (uncapped) budget', () => {
    const uncapped = budgetFrontierScale([point('a', 0.1, 10)], 0, 200, 100)
    expect(uncapped.budgetX).toBeNull()
  })

  it('handles an empty point set without degenerating', () => {
    const empty = budgetFrontierScale([], 5, 200, 100)
    expect(Number.isFinite(empty.x(1))).toBe(true)
    expect(empty.domain.maxCost).toBeGreaterThan(0)
  })
})

describe('frontierStepPath', () => {
  it('builds a step-after path through the frontier points, sorted by cost', () => {
    const s = budgetFrontierScale([point('a', 1, 10), point('b', 2, 20)], 5, 200, 100)
    const d = frontierStepPath([point('b', 2, 20), point('a', 1, 10)], s)
    // Starts at the cheapest point, then steps horizontally then vertically to the next.
    const pts = d.split(' ').filter((tok) => tok !== 'L' && tok !== 'M')
    expect(pts).toHaveLength(6)
    expect(d).toMatch(new RegExp(`^M ${s.x(1).toFixed(2)} ${s.y(10).toFixed(2)}`))
    expect(d).toContain(`L ${s.x(2).toFixed(2)} ${s.y(10).toFixed(2)}`)
    expect(d).toContain(`L ${s.x(2).toFixed(2)} ${s.y(20).toFixed(2)}`)
  })

  it('returns an empty path for an empty frontier', () => {
    expect(frontierStepPath([], budgetFrontierScale([], 5, 200, 100))).toBe('')
  })
})

describe('bestValuePoint', () => {
  it('returns the point with the highest valueScore', () => {
    const pts = [point('a', 1, 10), point('b', 2, 30), point('c', 3, 20)]
    expect(bestValuePoint(pts)?.model.slug).toBe('b')
  })
  it('returns null when there are no points', () => {
    expect(bestValuePoint([])).toBeNull()
  })
})

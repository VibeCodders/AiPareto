import { describe, it, expect } from 'vitest'
import type { Model } from './types'
import { bestSlug, bestSlugsFor, winCount } from './compare'

function model(slug: string, score: number): Model {
  return { ...emptyModel(), slug, intelligenceIndex: score }
}

function emptyModel(): Model {
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
  }
}

const byIntel = (m: Model) => m.intelligenceIndex

describe('bestSlug / bestSlugsFor', () => {
  it('returns the top value for higher-is-better rows', () => {
    const ms = [model('a', 50), model('b', 80)]
    expect(bestSlug(ms, true, byIntel)).toBe('b')
    expect(bestSlugsFor(ms, true, byIntel)).toEqual(['b'])
  })
  it('returns every tied winner', () => {
    const ms = [model('a', 80), model('b', 80)]
    expect(bestSlugsFor(ms, true, byIntel)).toEqual(['a', 'b'])
  })
  it('ignores models with missing values', () => {
    const ms = [model('a', 50), { ...emptyModel(), slug: 'none' }]
    expect(bestSlug(ms, true, byIntel)).toBe('a')
  })
  it('returns null/empty when nothing has a value', () => {
    const ms = [{ ...emptyModel(), slug: 'none', intelligenceIndex: null }]
    expect(bestSlug(ms, true, byIntel)).toBeNull()
    expect(bestSlugsFor(ms, true, byIntel)).toEqual([])
  })
})

describe('winCount', () => {
  it('counts the rows a model is best at', () => {
    const a = model('a', 90)
    const b = model('b', 70)
    const rows = [
      { higherIsBetter: true, value: byIntel },
      { higherIsBetter: false, value: (m: Model) => m.latencySeconds }, // both null -> no winner
    ]
    expect(winCount(a, [a, b], rows)).toBe(1)
  })
})
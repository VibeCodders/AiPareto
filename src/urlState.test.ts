import { describe, it, expect } from 'vitest'
import type { MetricKey } from './types'
import { defaultMinScore, isLowerBetter, parseUrl, toSearch } from './urlState'
import type { UrlState } from './urlState'

const FAMILIES = ['A', 'B', 'C']

const METRIC_MAX = {
  intelligenceIndex: 100,
  codingIndex: 100,
  agenticIndex: 100,
  tau2: 1,
  hle: 100,
  omniscience: 100,
  outputSpeed: 600,
  latencySeconds: 60,
  contextTokens: 4000000,
  valueScore: 1000,
  speedAdjustedScore: 1000,
  contextValue: 4000000,
  efficiencyScore: 100,
  hfMMLU: 100,
  hfGSM8K: 100,
  hfHumanEval: 100,
  hfARC: 100,
  hfWinogrande: 100,
  hfHellaSwag: 100,
  hfTruthfulQA: 100,
  arenaElo: 2000,
  arenaCodeElo: 2000,
  benchlmScore: 100,
} as Record<MetricKey, number>

describe('isLowerBetter / defaultMinScore', () => {
  it('treats latency as lower-is-better only', () => {
    expect(isLowerBetter('latencySeconds')).toBe(true)
    expect(isLowerBetter('intelligenceIndex')).toBe(false)
    expect(isLowerBetter('hfHumanEval')).toBe(false)
  })
  it('defaults minScore to 0 for higher-better and to max for latency', () => {
    expect(defaultMinScore('intelligenceIndex', 100)).toBe(0)
    expect(defaultMinScore('latencySeconds', 60)).toBe(60)
  })
})

describe('parseUrl', () => {
  it('returns defaults for an empty search', () => {
    const s = parseUrl('', FAMILIES, METRIC_MAX)
    expect(s.metric).toBe('intelligenceIndex')
    expect(s.costView).toBe('input')
    expect(s.lang).toBe('it')
    expect(s.families).toBeNull()
    expect(s.budget).toBe(40)
  })
  it('parses and clamps values', () => {
    const s = parseUrl('?metric=codingIndex&tin=9999999999&tout=-5&lang=en&min=9999', FAMILIES, METRIC_MAX)
    expect(s.metric).toBe('codingIndex')
    expect(s.taskInput).toBe(1_000_000)
    expect(s.taskOutput).toBe(1)
    expect(s.lang).toBe('en')
    // minScore clamps to the metric max
    expect(s.minScore).toBe(METRIC_MAX.codingIndex)
  })
  it('filters families to known ones', () => {
    const s = parseUrl('?f=B,zzz', FAMILIES, METRIC_MAX)
    expect(s.families).toEqual(['B'])
  })
  it('accepts community benchmarks as xMetric', () => {
    const s = parseUrl('?xmet=hfHumanEval', FAMILIES, METRIC_MAX)
    expect(s.xMetric).toBe('hfHumanEval')
  })
  it('rejects unknown xMetric', () => {
    const s = parseUrl('?xmet=not-a-metric', FAMILIES, METRIC_MAX)
    expect(s.xMetric).toBeNull()
  })
  it('round-trips price caps above $1000', () => {
    const s = parseUrl('?pmin=12.5&pmax=2500', FAMILIES, METRIC_MAX)
    expect(s.minPrice).toBe(12.5)
    expect(s.maxPrice).toBe(2500)
    // serialize keeps the high cap, then parse restores it.
    const back = parseUrl(toSearch(s, FAMILIES, METRIC_MAX), FAMILIES, METRIC_MAX)
    expect(back.minPrice).toBe(12.5)
    expect(back.maxPrice).toBe(2500)
  })
})

describe('toSearch / parseUrl round-trip', () => {
  it('serializes then re-parses a non-default state', () => {
    const s: UrlState = {
      lang: 'en',
      theme: 'light',
      metric: 'codingIndex',
      costView: 'task',
      taskInput: 5000,
      taskOutput: 2000,
      logScale: false,
      includeEfforts: true,
      maxEffortOnly: true,
      minScore: 20,
      query: 'gpt',
      families: ['A'],
      selectedId: 'sel-1',
      presetId: null,
      reasoningOnly: true,
      openWeightsOnly: false,
      minPrice: 0.5,
      maxPrice: 900,
      compareIds: ['a', 'b'],
      minContext: 10000,
      releasedFrom: '2024-01-01',
      showSubscriptions: false,
      usageFactor: 0.5,
      subscriptionOnly: true,
      valueScoreBase: 'codingIndex',
      efficiencyWeights: { value: 2, speed: 0.5, context: 0.5 },
      showTrend: true,
      paretoOnly: true,
      maxMonthlyCost: 100,
      sizeBy: 'downloads',
      showLabels: false,
      estimateMissing: false,
      xMetric: 'hfHumanEval',
      budget: 75,
    }
    const back = parseUrl(toSearch(s, FAMILIES, METRIC_MAX), FAMILIES, METRIC_MAX)
    expect(back.metric).toBe('codingIndex')
    expect(back.costView).toBe('task')
    expect(back.taskInput).toBe(5000)
    expect(back.taskOutput).toBe(2000)
    expect(back.query).toBe('gpt')
    expect(back.families).toEqual(['A'])
    expect(back.reasoningOnly).toBe(true)
    expect(back.usageFactor).toBe(0.5)
    expect(back.efficiencyWeights).toEqual({ value: 2, speed: 0.5, context: 0.5 })
    expect(back.sizeBy).toBe('downloads')
    expect(back.xMetric).toBe('hfHumanEval')
    expect(back.releasedFrom).toBe('2024-01-01')
    expect(back.budget).toBe(75)
  })
})
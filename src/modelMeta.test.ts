import { describe, it, expect } from 'vitest'
import type { Model } from './types'
import { colorFor, displayNameOf, shortNameOf } from './modelMeta'

function model(partial: Partial<Model> = {}): Model {
  return {
    id: 'm',
    name: 'short',
    slug: 'm',
    aaName: 'Full Model Name',
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

describe('displayNameOf', () => {
  it('uses the AA name for pay-as-you-go models', () => {
    expect(displayNameOf(model())).toBe('Full Model Name')
  })
  it('uses the plan name for subscriptions', () => {
    expect(displayNameOf(model({ isSubscription: true, name: 'Plan Pro' }))).toBe('Plan Pro')
  })
})

describe('shortNameOf', () => {
  it('uses the short model name, or the subscription plan name', () => {
    expect(shortNameOf(model())).toBe('short')
    expect(shortNameOf(model({ isSubscription: true, name: 'Plan Pro' }))).toBe('Plan Pro')
  })
})

describe('colorFor', () => {
  it('is deterministic per family and returns a palette color', () => {
    const c1 = colorFor('OpenAI')
    expect(colorFor('OpenAI')).toBe(c1)
    expect(colorFor('Anthropic')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

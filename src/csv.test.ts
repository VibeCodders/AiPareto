import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Model } from './types'
import { STRINGS } from './i18n'
import { exportModelsCsv } from './csv'

// Capture what exportModelsCsv hands to downloadBlob so we can assert content/filename
// without touching a real DOM.
const captured: Array<{ blob: Blob; filename: string }> = []
vi.mock('./download', () => ({
  downloadBlob: (blob: Blob, filename: string) => {
    captured.push({ blob, filename })
  },
}))

function model(partial: Partial<Model> = {}): Model {
  return {
    id: 'm', name: 'm', slug: 'm', aaName: 'm', family: 'f',
    effort: null, released: null, isReasoning: false, isSubscription: false, openWeights: false,
    intelligenceIndex: 50, codingIndex: null, agenticIndex: null, tau2: null, hle: null, omniscience: null,
    outputSpeed: null, latencySeconds: null, contextTokens: null, inputPerM: 0.1, outputPerM: 0.2,
    cacheReadPerM: null, cacheWritePerM: null, maxCompletionTokens: null, parameters: null,
    activeParameters: null, huggingFaceId: null, hfDownloads: null, hfMMLU: null, hfGSM8K: null,
    hfHumanEval: null, hfARC: null, hfWinogrande: null, hfHellaSwag: null, hfTruthfulQA: null,
    arenaElo: null, arenaVotes: null, arenaCodeElo: null, arenaCodeVotes: null, benchlmScore: null,
    benchlmCodingScore: null,
    ...partial,
  }
}

function withEstimate(m: Model, field: string): Model {
  const out = m as Model & { estimatedMetrics?: Set<string> }
  out.estimatedMetrics = new Set([field])
  return m
}

const t = STRINGS.en

beforeEach(() => {
  captured.length = 0
})

describe('exportModelsCsv', () => {
  it('prepends a UTF-8 BOM, uses ;-separated rows and appends the filename suffix', async () => {
    const plain = model({ id: 'm1', aaName: 'Model One', intelligenceIndex: 80 })
    const est = withEstimate(model({ id: 'm2', intelligenceIndex: 60 }), 'outputSpeed')
    exportModelsCsv([plain, est], 'blended', 3000, 1000, t, 'budget=40/1M', '-top')
    expect(captured.length).toBe(1)
    const { blob, filename } = captured[0]
    expect(filename).toContain('-top.csv')
    expect(filename).toMatch(/^ai-pareto-\d{4}-\d{2}-\d{2}/)

    // blob.text() strips the BOM, so check the raw first bytes = EF BB BF.
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])

    const text = await blob.text() // BOM already decoded
    const lines = text.split('\r\n')
    expect(lines[0]).toBe('# budget=40/1M')
    expect(lines[1]).toBe('# estimated: 1/2')
    expect(lines[2].split(';')).toContain(t.model)
    expect(lines[2].split(';').length).toBeGreaterThan(5)
    // The imputed field is flagged in the final 'estimated' column.
    expect(lines[4].split(';').pop()).toBe('outputSpeed')
  })

  it('quotes a cell containing the separator', async () => {
    exportModelsCsv([model({ aaName: 'a;b,c' })], 'input', 3000, 1000, t)
    const text = await (await captured[0].blob).text()
    const row = text.split('\r\n').find((l) => l.startsWith('m;'))
    expect(row).toContain('m;"a;b,c";f;')
  })

  it('always writes an estimates summary line, even without a filter summary', async () => {
    exportModelsCsv([model()], 'input', 3000, 1000, t)
    const text = await (await captured[0].blob).text()
    expect(text.split('\r\n')[0]).toBe('# estimated: 0/1')
  })
})
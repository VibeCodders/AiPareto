export interface Model {
  id: string
  name: string
  family: string
  slug: string
  aaName: string
  effort: string | null
  released: string | null
  isReasoning: boolean
  intelligenceIndex: number | null
  agenticIndex: number | null
  omniscience: number | null
  contextTokens: number | null
  openWeights: boolean
  inputPerM: number | null
  outputPerM: number | null
  cacheReadPerM: number | null
  cacheWritePerM: number | null
}

export type MetricKey = 'intelligenceIndex' | 'agenticIndex' | 'omniscience'
export type CostView = 'input' | 'blended' | 'cache' | 'output'

export interface Point {
  model: Model
  cost: number
  score: number
}

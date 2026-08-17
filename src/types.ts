export interface SubscriptionPlan {
  id: string
  name: string
  provider: string
  priceMonthly: number
  modelId: string
  modelSlug: string
  estimatedTokensMonthly: number
  rateLimitDesc: string
  notes: string
}

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
  codingIndex: number | null
  agenticIndex: number | null
  tau2: number | null
  hle: number | null
  omniscience: number | null
  outputSpeed: number | null
  latencySeconds: number | null
  contextTokens: number | null
  openWeights: boolean
  inputPerM: number | null
  outputPerM: number | null
  cacheReadPerM: number | null
  cacheWritePerM: number | null
  valueScore: number | null
  // Subscription metadata if this item represents a subscription plan
  isSubscription?: boolean
  subscription?: SubscriptionPlan
  effectiveCostPerM?: number
}

export type MetricKey =
  | 'intelligenceIndex'
  | 'codingIndex'
  | 'agenticIndex'
  | 'tau2'
  | 'hle'
  | 'omniscience'
  | 'outputSpeed'
  | 'latencySeconds'
  | 'contextTokens'
  | 'valueScore'
  | 'speedAdjustedScore'
  | 'contextValue'
export type CostView = 'input' | 'blended' | 'cache' | 'output' | 'task'

export interface ComparisonModel {
  model: Model
  rank: number | null
  valueScore: number | null
}

export interface Point {
  model: Model
  cost: number
  score: number
}


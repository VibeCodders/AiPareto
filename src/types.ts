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
  /** Short explanation of how estimatedTokensMonthly was derived, shown to the user for transparency. */
  methodology?: string
  /** True for team/business/enterprise tiers (as opposed to individual plans). */
  isTeamTier?: boolean
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
  maxCompletionTokens: number | null
  parameters: number | null
  activeParameters: number | null
  valueScore: number | null
  /** Hugging Face model ID (from OpenRouter's `hugging_face_id`), used to match
   *  benchmark scores and download counts from Hugging Face. */
  huggingFaceId: string | null
  /** HF Hub download count (popularity indicator). */
  hfDownloads: number | null
  /** MMLU benchmark score (0-shot, 0-100) from Hugging Face. */
  hfMMLU: number | null
  /** GSM8K benchmark score (0-shot, 0-100) from Hugging Face. */
  hfGSM8K: number | null
  /** HumanEval pass@1 (0-100) from Hugging Face. */
  hfHumanEval: number | null
  /** ARC Challenge score (0-shot, 0-100) from Hugging Face. */
  hfARC: number | null
  /** Winogrande score (0-shot, 0-100) from Hugging Face. */
  hfWinogrande: number | null
  /** HellaSwag score (0-shot, 0-100) from Hugging Face. */
  hfHellaSwag: number | null
  /** TruthfulQA score (0-shot, 0-100) from Hugging Face. */
  hfTruthfulQA: number | null
  /** LMSYS Chatbot Arena ELO (text conversation battles). */
  arenaElo: number | null
  /** Number of Arena text battles rated. */
  arenaVotes: number | null
  /** LMSYS Chatbot Arena ELO (code generation battles). */
  arenaCodeElo: number | null
  /** Number of Arena code battles rated. */
  arenaCodeVotes: number | null
  /** Overall score from BenchLM.ai aggregate benchmarks. */
  benchlmScore: number | null
  /** Coding-category score from BenchLM.ai. */
  benchlmCodingScore: number | null
  // Subscription metadata if this item represents a subscription plan
  isSubscription?: boolean
  subscription?: SubscriptionPlan
  effectiveCostPerM?: number
  /** For subscriptions: monthly cost of getting the same estimated usage from the underlying model pay-as-you-go, for comparison. */
  paygoEquivalentMonthly?: number | null
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
  | 'efficiencyScore'
  | 'hfMMLU'
  | 'hfGSM8K'
  | 'hfHumanEval'
  | 'hfARC'
  | 'hfWinogrande'
  | 'hfHellaSwag'
  | 'hfTruthfulQA'
  | 'arenaElo'
  | 'arenaCodeElo'
  | 'benchlmScore'
export type CostView = 'input' | 'blended' | 'cache' | 'output' | 'task'
export type ValueScoreBase = 'intelligenceIndex' | 'codingIndex' | 'agenticIndex'

export interface EfficiencyWeights {
  value: number
  speed: number
  context: number
}

export interface ComparisonModel {
  model: Model
  rank: number | null
  valueScore: number | null
}

export interface Point {
  model: Model
  /** X-axis value: a cost (USD per the selected cost view) or any metric value. */
  x: number
  /** Y-axis value (the selected metric). */
  score: number
  /** True when the plotted score was estimated because the raw value was missing. */
  scoreEstimated?: boolean
  /** True when the plotted X-axis value (cost or metric) was estimated. */
  xEstimated?: boolean
}

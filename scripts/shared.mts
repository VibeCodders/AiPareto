export const UA = 'Mozilla/5.0 (compatible; ai-pareto-data-fetcher/0.1)'

export const CREATOR_WHITELIST = [
  'OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek', 'SpaceXAI', 'Alibaba',
  'Mistral', 'Amazon', 'NVIDIA', 'Z AI', 'MiniMax', 'StepFun', 'Tencent',
  'Baidu', 'ByteDance Seed', 'Cohere', 'AI21 Labs', 'Perplexity', 'Microsoft',
  'Naver', 'Xiaomi', 'Moonshot', 'Kimi', 'InclusionAI', 'Moonshot AI',
]

export const DEFAULT_TIMEOUT = 30_000
export const DEFAULT_RETRIES = 3
export const DEFAULT_RETRY_DELAY = 1_000
export const DEFAULT_LEADERBOARD_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const DEFAULT_DETAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

export async function get(
  url: string,
  opts: { headers?: Record<string, string>; timeout?: number; retries?: number; retryDelay?: number } = {},
): Promise<string> {
  const { headers = {}, timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, retryDelay = DEFAULT_RETRY_DELAY } = opts
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, ...headers },
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const err = new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
        // Retry only on rate-limits / server errors. 4xx (except 429) are
        // permanent, so fail fast instead of burning the remaining attempts.
        if (isRetryable(res.status) && attempt < retries) {
          await backoff(attempt, retryDelay)
          continue
        }
        throw err
      }
      return await res.text()
    } catch (e) {
      lastError = e as Error
      // Network/DNS/timeout/abort errors are transient: retry them all.
      if (attempt < retries) await backoff(attempt, retryDelay)
    }
  }
  throw lastError ?? new Error(`GET ${url} failed after ${retries} attempts`)
}

async function backoff(attempt: number, retryDelay: number): Promise<void> {
  const base = retryDelay * Math.pow(2, attempt - 1)
  const jitter = Math.random() * base * 0.5
  await new Promise((r) => setTimeout(r, base + jitter))
}

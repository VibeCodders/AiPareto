/**
 * Curated mapping from Artificial Analysis model slugs to OpenRouter model ids.
 * Effort variants of the same model (AA measures each separately) map to the
 * same OpenRouter id, since effort is a request parameter there.
 */
export const AA_TO_OR: Record<string, string> = {
  // Anthropic
  'claude-opus-5': 'anthropic/claude-opus-5',
  'claude-opus-5-high': 'anthropic/claude-opus-5',
  'claude-opus-5-medium': 'anthropic/claude-opus-5',
  'claude-opus-5-xhigh': 'anthropic/claude-opus-5',
  'claude-sonnet-5': 'anthropic/claude-sonnet-5',
  'claude-sonnet-5-high': 'anthropic/claude-sonnet-5',
  'claude-sonnet-5-medium': 'anthropic/claude-sonnet-5',
  'claude-sonnet-5-xhigh': 'anthropic/claude-sonnet-5',
  'claude-sonnet-5-non-reasoning': 'anthropic/claude-sonnet-5',
  'claude-fable-5': 'anthropic/claude-fable-5',
  'claude-4-5-haiku-reasoning': 'anthropic/claude-haiku-4.5',
  'claude-4-5-haiku': 'anthropic/claude-haiku-4.5',

  // OpenAI
  'gpt-5-6-sol': 'openai/gpt-5.6-sol',
  'gpt-5-6-sol-high': 'openai/gpt-5.6-sol',
  'gpt-5-6-sol-medium': 'openai/gpt-5.6-sol',
  'gpt-5-6-sol-xhigh': 'openai/gpt-5.6-sol',
  'gpt-5-6-sol-low': 'openai/gpt-5.6-sol',
  'gpt-5-6-sol-non-reasoning': 'openai/gpt-5.6-sol',
  'gpt-5-6-terra': 'openai/gpt-5.6-terra',
  'gpt-5-6-terra-high': 'openai/gpt-5.6-terra',
  'gpt-5-6-terra-medium': 'openai/gpt-5.6-terra',
  'gpt-5-6-terra-xhigh': 'openai/gpt-5.6-terra',
  'gpt-5-6-terra-low': 'openai/gpt-5.6-terra',
  'gpt-5-6-terra-non-reasoning': 'openai/gpt-5.6-terra',
  'gpt-5-6-luna': 'openai/gpt-5.6-luna',
  'gpt-5-6-luna-high': 'openai/gpt-5.6-luna',
  'gpt-5-6-luna-medium': 'openai/gpt-5.6-luna',
  'gpt-5-6-luna-xhigh': 'openai/gpt-5.6-luna',
  'gpt-5-6-luna-low': 'openai/gpt-5.6-luna',
  'gpt-5-6-luna-non-reasoning': 'openai/gpt-5.6-luna',
  'gpt-5-5-pro': 'openai/gpt-5.5-pro',
  'gpt-5-5-instant-06-26': 'openai/gpt-5.5',
  'gpt-5-3-codex': 'openai/gpt-5.3-codex',
  'gpt-oss-120b': 'openai/gpt-oss-120b',
  'gpt-oss-120b-low': 'openai/gpt-oss-120b',
  'gpt-oss-20b': 'openai/gpt-oss-20b',
  'gpt-oss-20b-low': 'openai/gpt-oss-20b',
  o3: 'openai/o3',

  // Google
  'gemini-3-7-flash': 'google/gemini-3.7-flash',
  'gemini-3-7-flash-medium': 'google/gemini-3.7-flash',
  'gemini-3-7-flash-low': 'google/gemini-3.7-flash',
  'gemini-3-6-flash': 'google/gemini-3.6-flash',
  'gemini-3-5-flash-medium': 'google/gemini-3.5-flash',
  'gemini-3-5-flash-minimal': 'google/gemini-3.5-flash',
  'gemini-3-5-flash-lite': 'google/gemini-3.5-flash-lite',
  'gemini-3-1-pro-preview': 'google/gemini-3.1-pro-preview',
  'gemma-4-31b': 'google/gemma-4-31b-it',
  'gemma-4-31b-non-reasoning': 'google/gemma-4-31b-it',
  'gemma-4-26b-a4b': 'google/gemma-4-26b-a4b-it',
  'gemma-4-26b-a4b-non-reasoning': 'google/gemma-4-26b-a4b-it',
  'gemma-4-12b': 'google/gemma-4-12b-it',
  'gemma-4-12b-non-reasoning': 'google/gemma-4-12b-it',
  'gemma-4-e4b': 'google/gemma-4-e4b-it',
  'gemma-4-e4b-non-reasoning': 'google/gemma-4-e4b-it',
  'gemma-4-e2b': 'google/gemma-4-e2b-it',
  'gemma-4-e2b-non-reasoning': 'google/gemma-4-e2b-it',

  // DeepSeek
  'deepseek-v4-pro-0424': 'deepseek/deepseek-v4-pro',
  'deepseek-v4-pro-0424-high': 'deepseek/deepseek-v4-pro',
  'deepseek-v4-pro-0424-non-reasoning': 'deepseek/deepseek-v4-pro',
  'deepseek-v4-pro': 'deepseek/deepseek-v4-pro-0813',
  'deepseek-v4-flash': 'deepseek/deepseek-v4-flash-0731',
  'deepseek-v4-flash-non-reasoning': 'deepseek/deepseek-v4-flash-0731',

  // Meta
  'muse-spark-1-2': 'meta/muse-spark-1.2',
  'muse-glimmer': 'meta/muse-glimmer-30b',
  'llama-4-maverick': 'meta-llama/llama-4-maverick',
  'llama-4-scout': 'meta-llama/llama-4-scout',

  // xAI
  'grok-4-6': 'x-ai/grok-4.6',
  'grok-4-5': 'x-ai/grok-4.5',
  'grok-4-3-medium': 'x-ai/grok-4.3',
  'grok-4-3-low': 'x-ai/grok-4.3',
  'grok-4-3-non-reasoning': 'x-ai/grok-4.3',

  // Alibaba / Qwen
  'qwen3-8-max': 'qwen/qwen3.8-max',
  'qwen3-8-2-4t-a95b': 'qwen/qwen3.8-2.4t-a95b',
  'qwen3-7-plus': 'qwen/qwen3.7-plus',
  'qwen3-6-27b': 'qwen/qwen3.6-27b',
  'qwen3-6-27b-non-reasoning': 'qwen/qwen3.6-27b',
  'qwen3-6-35b-a3b': 'qwen/qwen3.6-35b-a3b',
  'qwen3-6-35b-a3b-non-reasoning': 'qwen/qwen3.6-35b-a3b',
  'qwen3-5-397b-a17b': 'qwen/qwen3.5-397b-a17b',
  'qwen3-5-397b-a17b-non-reasoning': 'qwen/qwen3.5-397b-a17b',
  'qwen3-5-122b-a10b': 'qwen/qwen3.5-122b-a10b',
  'qwen3-5-122b-a10b-non-reasoning': 'qwen/qwen3.5-122b-a10b',
  'qwen3-5-35b-a3b-non-reasoning': 'qwen/qwen3.5-35b-a3b',
  'qwen3-5-9b': 'qwen/qwen3.5-9b',
  'qwen3-5-9b-non-reasoning': 'qwen/qwen3.5-9b',
  'qwen3-coder-next': 'qwen/qwen3-coder-next',
  'qwen3-next-80b-a3b-instruct': 'qwen/qwen3-next-80b-a3b-instruct',

  // Mistral
  'mistral-medium-3-5': 'mistralai/mistral-medium-3-5',
  'mistral-large-3': 'mistralai/mistral-large-2512',
  'mistral-small-4': 'mistralai/mistral-small-2603',
  'mistral-small-4-non-reasoning': 'mistralai/mistral-small-2603',
  'ministral-3-14b': 'mistralai/ministral-14b-2512',
  'ministral-3-8b': 'mistralai/ministral-8b-2512',
  'ministral-3-3b': 'mistralai/ministral-3b-2512',

  // Amazon
  'nova-premier': 'amazon/nova-premier-v1',

  // NVIDIA
  'nemotron-3-5-lightning': 'nvidia/nemotron-3.5-lightning',
  'nvidia-nemotron-3-super-120b-a12b': 'nvidia/nemotron-3-super-120b-a12b',
  'nvidia-nemotron-3-ultra-550b-a55b': 'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia-nemotron-3-nano-30b-a3b': 'nvidia/nemotron-3-nano-30b-a3b',
  'nvidia-nemotron-3-nano-30b-a3b-reasoning': 'nvidia/nemotron-3-nano-30b-a3b',

  // Z AI
  'glm-5-2': 'z-ai/glm-5.2',
  'glm-5-2-non-reasoning': 'z-ai/glm-5.2',

  // Moonshot / Kimi
  'kimi-k3': 'moonshotai/kimi-k3',
  'kimi-k3-low': 'moonshotai/kimi-k3',
  'kimi-k2-7-code': 'moonshotai/kimi-k2.7-code',

  // MiniMax
  'minimax-m3': 'minimax/minimax-m3',

  // StepFun
  'step-3-7-flash': 'stepfun/step-3.7-flash',

  // Tencent
  hy3: 'tencent/hy3',

  // Cohere
  'command-a': 'cohere/command-a',

  // Xiaomi
  'mimo-v2-5-0424': 'xiaomi/mimo-v2.5',
  'mimo-v2-5-pro': 'xiaomi/mimo-v2.5-pro',
  'mimo-v2-5-pro-non-reasoning': 'xiaomi/mimo-v2.5-pro',

  // InclusionAI
  'ling-3-0-flash': 'inclusionai/ling-3.0-flash',
  'ring-2-6-1t': 'inclusionai/ring-2.6-1t',

  // Thinking Machines
  inkling: 'thinkingmachines/inkling',
}

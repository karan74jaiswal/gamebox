import type { LanguageModelUsage } from "ai"
import { DEFAULT_MODEL_ID, type ModelId } from "@/lib/ai/models"

export interface ModelPricing {
  /** Cost per million fresh (non-cached) input tokens in USD */
  freshInput: number
  /** Cost per million cached input (read) tokens in USD */
  cacheInput: number
  /** Cost per million cached input (write) tokens in USD */
  cacheWrites: number
  /** Cost per million output tokens in USD */
  output: number
  /** Aliases for convenience */
  input?: number
  cacheRead?: number
  cacheWrite?: number
}

/**
 * Pricing rates per million tokens in USD, keyed by the model IDs we already have.
 * Fresh input, cache input, cache writes and output are priced differently.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "google/gemini-3.8-flash": {
    freshInput: 0.15,
    cacheInput: 0.0375,
    cacheWrites: 0.0375,
    output: 0.6,
    input: 0.15,
    cacheRead: 0.0375,
    cacheWrite: 0.0375,
  },
  "xai/grok-4.6": {
    freshInput: 2.0,
    cacheInput: 0.5,
    cacheWrites: 2.0,
    output: 10.0,
    input: 2.0,
    cacheRead: 0.5,
    cacheWrite: 2.0,
  },
  "anthropic/claude-opus-5": {
    freshInput: 15.0,
    cacheInput: 1.5,
    cacheWrites: 18.75,
    output: 75.0,
    input: 15.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "anthropic/claude-fable-5-1": {
    freshInput: 3.0,
    cacheInput: 0.3,
    cacheWrites: 3.75,
    output: 15.0,
    input: 3.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  // Internal fallback models
  "google/gemini-2.5-flash": {
    freshInput: 0.15,
    cacheInput: 0.0375,
    cacheWrites: 0.0375,
    output: 0.6,
    input: 0.15,
    cacheRead: 0.0375,
    cacheWrite: 0.0375,
  },
  "google/gemini-2.5-pro": {
    freshInput: 1.25,
    cacheInput: 0.3125,
    cacheWrites: 0.3125,
    output: 5.0,
    input: 1.25,
    cacheRead: 0.3125,
    cacheWrite: 0.3125,
  },
}

/**
 * Resolves pricing for a given model ID, supporting unprefixed aliases
 * (e.g. "gemini-3.8-flash" -> "google/gemini-3.8-flash").
 */
export function getModelPricing(modelId?: string | ModelId): ModelPricing {
  if (!modelId) {
    return MODEL_PRICING[DEFAULT_MODEL_ID]!
  }

  // Exact match
  if (MODEL_PRICING[modelId]) {
    return MODEL_PRICING[modelId]!
  }

  // Check prefix match or stripped provider match
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId === key || modelId.endsWith(`/${key}`) || key.endsWith(`/${modelId}`)) {
      return pricing
    }
  }

  return MODEL_PRICING[DEFAULT_MODEL_ID]!
}

export interface StepUsageLike {
  usage?: LanguageModelUsage | {
    inputTokens?: number
    inputTokenDetails?: {
      noCacheTokens?: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
    }
    outputTokens?: number
    outputTokenDetails?: {
      textTokens?: number
      reasoningTokens?: number
    }
    totalTokens?: number
  }
  model?: {
    provider?: string
    modelId?: string
  }
}

/**
 * Turns one step's token usage into an amount in nano-dollars (billionths of a dollar).
 *
 * 1 dollar = 1,000,000,000 nano-dollars (billionths).
 * Rates are in USD per 1,000,000 tokens.
 * Nano-dollars per token = (pricePerMillion / 1,000,000) * 1,000,000,000 = pricePerMillion * 1,000.
 */
export function calculateStepAmount(
  stepOrUsage: StepUsageLike | LanguageModelUsage | undefined | null,
  modelIdOverride?: string
): bigint {
  if (!stepOrUsage) return BigInt(0)

  const usage =
    "usage" in stepOrUsage && stepOrUsage.usage
      ? stepOrUsage.usage
      : (stepOrUsage as LanguageModelUsage)

  if (!usage) return BigInt(0)

  const modelId =
    modelIdOverride ||
    ("model" in stepOrUsage && stepOrUsage.model?.modelId) ||
    DEFAULT_MODEL_ID

  const pricing = getModelPricing(modelId)

  const totalInputTokens = usage.inputTokens ?? 0
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0
  const explicitNoCacheTokens = usage.inputTokenDetails?.noCacheTokens

  // When noCacheTokens is explicitly provided, use it;
  // otherwise calculate fresh input as totalInput minus cached reads and writes.
  const freshInputTokens =
    explicitNoCacheTokens !== undefined
      ? explicitNoCacheTokens
      : Math.max(0, totalInputTokens - cacheReadTokens - cacheWriteTokens)

  const outputTokens = usage.outputTokens ?? 0

  // Cost in nano-dollars (billionths of a dollar)
  const freshCost = freshInputTokens * pricing.freshInput * 1000
  const cacheInputCost = cacheReadTokens * pricing.cacheInput * 1000
  const cacheWriteCost = cacheWriteTokens * pricing.cacheWrites * 1000
  const outputCost = outputTokens * pricing.output * 1000

  const totalNanoDollars = Math.round(
    freshCost + cacheInputCost + cacheWriteCost + outputCost
  )

  return BigInt(totalNanoDollars)
}

export { calculateStepAmount as calculateStepCost }
export { calculateStepAmount as getStepAmount }

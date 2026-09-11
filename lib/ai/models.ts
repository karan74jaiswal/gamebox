import { z } from "zod"

export const modelIdSchema = z.enum([
  "google/gemini-3.8-flash",
  "xai/grok-4.6",
  "anthropic/claude-opus-5",
  "anthropic/claude-fable-5-1",
])
export type ModelId = z.infer<typeof modelIdSchema>

export interface AIModelOption {
  id: ModelId
  label: string
  provider: "google" | "xai" | "anthropic"
  description: string
  badge?: string
}

export const AVAILABLE_MODELS: AIModelOption[] = [
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    provider: "google",
    description: "Next-gen ultra-fast frontier Flash model (Global)",
  },
  {
    id: "xai/grok-4.6",
    label: "Grok 4.6",
    provider: "xai",
    description: "xAI state-of-the-art flagship intelligence (Global)",
  },
  {
    id: "anthropic/claude-opus-5",
    label: "Claude Opus 5",
    provider: "anthropic",
    description: "Anthropic premier deep reasoning & architecture (Global)",
  },
  {
    id: "anthropic/claude-fable-5-1",
    label: "Claude Fable 5.1",
    provider: "anthropic",
    description: "Anthropic latest specialized reasoning & coding model (Global)",
  },
]

export const DEFAULT_MODEL_ID: ModelId = "google/gemini-3.8-flash"

const MODEL_MAP = new Map<ModelId, AIModelOption>(
  AVAILABLE_MODELS.map((m) => [m.id, m])
)

/**
 * Resolves a model option strictly by exact ID using Zod validation.
 * If invalid or omitted, falls back to the default model option.
 */
export function resolveModel(identifier?: unknown): AIModelOption {
  const result = modelIdSchema.safeParse(identifier)
  if (result.success) {
    const matched = MODEL_MAP.get(result.data)
    if (matched) return matched
  }

  return MODEL_MAP.get(DEFAULT_MODEL_ID)!
}

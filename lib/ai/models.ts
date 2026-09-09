export interface AIModelOption {
  id: string
  label: string
  provider: "moonshotai" | "openai" | "anthropic" | "google" | "deepseek"
  description: string
  badge?: string
}

export const AVAILABLE_MODELS: AIModelOption[] = [
  {
    id: "moonshotai/kimi-k3",
    label: "Kimi K3",
    provider: "moonshotai",
    description: "Moonshot AI flagship reasoning model",
  },
  {
    id: "moonshotai/kimi-k3-fast",
    label: "Kimi K3 Fast",
    provider: "moonshotai",
    description: "Ultra-fast Kimi model for instant iterations",
  },
  {
    id: "moonshotai/kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    provider: "moonshotai",
    description: "Specialized for game code & logic generation",
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    description: "OpenAI flagship multimodal intelligence",
  },
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    description: "Fast, lightweight everyday model",
  },
  {
    id: "openai/o3-mini",
    label: "o3-mini",
    provider: "openai",
    description: "High-reasoning STEM and coding model",
  },
  {
    id: "anthropic/claude-opus-4.5",
    label: "Claude Opus 4.5",
    provider: "anthropic",
    description: "Anthropic premier deep reasoning and coding",
  },
  {
    id: "anthropic/claude-opus-4",
    label: "Claude Opus 4",
    provider: "anthropic",
    description: "Anthropic heavyweight intelligence & architecture",
  },
  {
    id: "anthropic/claude-3-7-sonnet",
    label: "Claude 3.7 Sonnet",
    provider: "anthropic",
    description: "Hybrid reasoning and coding model",
  },
  {
    id: "anthropic/claude-3-5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "anthropic",
    description: "High-intelligence creative & game designer",
  },
  {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    provider: "google",
    description: "Next-gen ultra-fast frontier Flash model",
  },
  {
    id: "google/gemini-3.7-flash",
    label: "Gemini 3.7 Flash",
    provider: "google",
    description: "High-speed reasoning & multimodal generation",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "google",
    description: "Fast, high-efficiency multimodal model",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "google",
    description: "Frontier complex multimodal problem solver",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    description: "Ultra-fast response with high quality",
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    description: "Advanced complex problem-solving model",
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1",
    provider: "deepseek",
    description: "Open-weights reasoning & chain-of-thought",
  },
]

export const DEFAULT_MODEL_ID = "google/gemini-2.5-flash"

/**
 * Finds a model by its ID or friendly label, falling back to the default model.
 */
export function resolveModel(identifier?: string): AIModelOption {
  const defaultOption =
    AVAILABLE_MODELS.find((m) => m.id === DEFAULT_MODEL_ID) ||
    AVAILABLE_MODELS[0]

  if (!identifier) {
    return defaultOption
  }

  const clean = identifier.trim().toLowerCase()

  // Match exact ID
  const byId = AVAILABLE_MODELS.find((m) => m.id.toLowerCase() === clean)
  if (byId) return byId

  // Match exact label
  const byLabel = AVAILABLE_MODELS.find((m) => m.label.toLowerCase() === clean)
  if (byLabel) return byLabel

  // Fuzzy match (e.g. "kimi", "gpt-4o", "claude 3.7", "gemini 2.5")
  const byPartial = AVAILABLE_MODELS.find(
    (m) =>
      m.id.toLowerCase().includes(clean) ||
      m.label.toLowerCase().includes(clean) ||
      clean.includes(m.label.toLowerCase())
  )
  if (byPartial) return byPartial

  return defaultOption
}

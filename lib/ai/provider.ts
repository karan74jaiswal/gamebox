import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"
import { createGoogleVertexXai } from "@ai-sdk/google-vertex/xai"
import { openai } from "@ai-sdk/openai"
import { gateway, type LanguageModel } from "ai"

import { resolveModel, DEFAULT_MODEL_ID } from "./models"
import { vertexFetchWithSseFilter } from "./vertex-fetch"

let vertexInstance: ReturnType<typeof createVertex> | null = null
let vertexAnthropicInstance: ReturnType<typeof createVertexAnthropic> | null = null
let vertexXaiInstance: ReturnType<typeof createGoogleVertexXai> | null = null

function getVertexAuthOptions() {
  if (
    process.env.GOOGLE_VERTEX_PRIVATE_KEY &&
    process.env.GOOGLE_VERTEX_CLIENT_EMAIL
  ) {
    return {
      credentials: {
        client_email: process.env.GOOGLE_VERTEX_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_VERTEX_PRIVATE_KEY.replace(
          /\\n/g,
          "\n"
        ),
      },
    }
  }
  return undefined
}

function hasVertexCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GOOGLE_VERTEX_PROJECT ||
    process.env.GOOGLE_VERTEX_CLIENT_EMAIL
  )
}

function getVertex(): ReturnType<typeof createVertex> {
  if (vertexInstance) return vertexInstance

  const project =
    process.env.GOOGLE_VERTEX_PROJECT || "gen-lang-client-0841656997"
  const location = process.env.GOOGLE_VERTEX_LOCATION || "global"
  const googleAuthOptions = getVertexAuthOptions()

  vertexInstance = createVertex({
    project,
    location,
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  })

  return vertexInstance
}

function getVertexAnthropic(): ReturnType<typeof createVertexAnthropic> {
  if (vertexAnthropicInstance) return vertexAnthropicInstance

  const project =
    process.env.GOOGLE_VERTEX_PROJECT || "gen-lang-client-0841656997"
  const location = process.env.GOOGLE_VERTEX_LOCATION || "global"
  const googleAuthOptions = getVertexAuthOptions()

  vertexAnthropicInstance = createVertexAnthropic({
    project,
    location,
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  })

  return vertexAnthropicInstance
}

function getVertexXai(): ReturnType<typeof createGoogleVertexXai> {
  if (vertexXaiInstance) return vertexXaiInstance

  const project =
    process.env.GOOGLE_VERTEX_PROJECT || "gen-lang-client-0841656997"
  const location = process.env.GOOGLE_VERTEX_LOCATION || "global"
  const googleAuthOptions = getVertexAuthOptions()

  vertexXaiInstance = createGoogleVertexXai({
    project,
    location,
    fetch: vertexFetchWithSseFilter,
    ...(googleAuthOptions ? { googleAuthOptions } : {}),
  })

  return vertexXaiInstance
}

interface ProviderHandler {
  hasOwnKey: () => boolean
  createDirect: (modelName: string) => LanguageModel
  gatewayId: (modelName: string) => string
}

const PROVIDER_HANDLERS: Record<string, ProviderHandler> = {
  google: {
    hasOwnKey: () =>
      Boolean(
        hasVertexCredentials() ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GOOGLE_API_KEY
      ),
    createDirect: (modelName: string) => {
      // Prioritize Google Cloud Vertex AI (uses GCP promotional credits)
      if (hasVertexCredentials()) {
        return getVertex()(modelName)
      }
      return google(modelName)
    },
    gatewayId: (modelName: string) => `google/${modelName}`,
  },
  xai: {
    hasOwnKey: () => Boolean(process.env.XAI_API_KEY || hasVertexCredentials()),
    createDirect: (modelName: string) => {
      if (hasVertexCredentials()) {
        const fullModelId = modelName.startsWith("xai/")
          ? modelName
          : `xai/${modelName}`
        return getVertexXai()(fullModelId)
      }
      return gateway(`xai/${modelName}`)
    },
    gatewayId: (modelName: string) => `xai/${modelName}`,
  },
  anthropic: {
    hasOwnKey: () =>
      Boolean(process.env.ANTHROPIC_API_KEY || hasVertexCredentials()),
    createDirect: (modelName: string) => {
      if (process.env.ANTHROPIC_API_KEY) {
        return anthropic(modelName)
      }
      if (hasVertexCredentials()) {
        return getVertexAnthropic()(modelName)
      }
      return anthropic(modelName)
    },
    gatewayId: (modelName: string) => `anthropic/${modelName}`,
  },
  openai: {
    hasOwnKey: () => Boolean(process.env.OPENAI_API_KEY),
    createDirect: (modelName: string) => openai(modelName),
    gatewayId: (modelName: string) => `openai/${modelName}`,
  },
  moonshotai: {
    hasOwnKey: () => Boolean(process.env.MOONSHOT_API_KEY),
    createDirect: (modelName: string) => gateway(`moonshotai/${modelName}`),
    gatewayId: (modelName: string) => `moonshotai/${modelName}`,
  },
  deepseek: {
    hasOwnKey: () => Boolean(process.env.DEEPSEEK_API_KEY),
    createDirect: (modelName: string) => gateway(`deepseek/${modelName}`),
    gatewayId: (modelName: string) => `deepseek/${modelName}`,
  },
}

/**
 * Resolves a language model instance using the canonical model definitions in lib/ai/models.ts.
 * Checks for direct provider credentials (e.g. Vertex AI), falling back
 * to Vercel AI Gateway when direct keys are not set.
 */
export function getLanguageModel(
  modelOrProvider?: string,
  modelOverride?: string
): LanguageModel {
  const target =
    modelOverride && modelOrProvider && !modelOverride.includes("/")
      ? `${modelOrProvider}/${modelOverride}`
      : modelOverride || modelOrProvider || DEFAULT_MODEL_ID

  // Internal support for dedicated background title generation / utilities
  if (
    target === "google/gemini-2.5-flash" ||
    target === "gemini-2.5-flash" ||
    target === "google/gemini-2.5-pro" ||
    target === "gemini-2.5-pro"
  ) {
    const modelName = target.includes("/") ? target.split("/")[1] : target
    const handler = PROVIDER_HANDLERS.google
    return handler.hasOwnKey()
      ? handler.createDirect(modelName)
      : gateway(`google/${modelName}`)
  }

  const modelOption = resolveModel(target)
  const handler = PROVIDER_HANDLERS[modelOption.provider]

  const modelName = modelOption.id.includes("/")
    ? modelOption.id.split("/")[1]
    : modelOption.id

  if (!handler) {
    return gateway(modelOption.id)
  }

  if (handler.hasOwnKey()) {
    return handler.createDirect(modelName)
  }

  return gateway(handler.gatewayId(modelName))
}

import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { openai } from "@ai-sdk/openai"
import { gateway, type LanguageModel } from "ai"

import { resolveModel, DEFAULT_MODEL_ID } from "./models"

let vertexInstance: ReturnType<typeof createVertex> | null = null

function getVertex(): ReturnType<typeof createVertex> {
  if (vertexInstance) return vertexInstance

  const project =
    process.env.GOOGLE_VERTEX_PROJECT || "gen-lang-client-0841656997"
  const location = process.env.GOOGLE_VERTEX_LOCATION || "global"

  if (
    process.env.GOOGLE_VERTEX_PRIVATE_KEY &&
    process.env.GOOGLE_VERTEX_CLIENT_EMAIL
  ) {
    vertexInstance = createVertex({
      project,
      location,
      googleAuthOptions: {
        credentials: {
          client_email: process.env.GOOGLE_VERTEX_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_VERTEX_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
      },
    })
  } else {
    vertexInstance = createVertex({
      project,
      location,
    })
  }

  return vertexInstance
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
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
          process.env.GOOGLE_VERTEX_PROJECT ||
          process.env.GOOGLE_VERTEX_CLIENT_EMAIL ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          process.env.GOOGLE_API_KEY
      ),
    createDirect: (modelName: string) => {
      // Prioritize Google Cloud Vertex AI (uses GCP promotional credits)
      if (
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.GOOGLE_VERTEX_PROJECT ||
        process.env.GOOGLE_VERTEX_CLIENT_EMAIL
      ) {
        return getVertex()(modelName)
      }
      return google(modelName)
    },
    gatewayId: (modelName: string) => `google/${modelName}`,
  },
  openai: {
    hasOwnKey: () => Boolean(process.env.OPENAI_API_KEY),
    createDirect: (modelName: string) => openai(modelName),
    gatewayId: (modelName: string) => `openai/${modelName}`,
  },
  anthropic: {
    hasOwnKey: () => Boolean(process.env.ANTHROPIC_API_KEY),
    createDirect: (modelName: string) => {
      if (modelName === "claude-3-5-sonnet")
        return anthropic("claude-3-5-sonnet-latest")
      if (modelName === "claude-3-7-sonnet")
        return anthropic("claude-3-7-sonnet-latest")
      return anthropic(modelName)
    },
    gatewayId: (modelName: string) => `anthropic/${modelName}`,
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
 * Checks for direct provider credentials (e.g. Vertex AI, OpenAI, Anthropic), falling back
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

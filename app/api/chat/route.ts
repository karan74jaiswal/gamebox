import { auth } from "@clerk/nextjs/server"
import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  gateway,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from "ai"

import { getMessagesByChatId, saveMessages } from "@/lib/db/messages"
import { resolveModel } from "@/lib/ai/models"

// Allow streaming responses up to 60 seconds
export const maxDuration = 60

/**
 * Resolves the language model based on provider or model identifier,
 * supporting Moonshot (Kimi), OpenAI, Anthropic, Google, DeepSeek via Vercel AI Gateway
 * or direct provider keys.
 */
function getLanguageModel(provider?: string, model?: string): LanguageModel {
  const p = provider?.toLowerCase().trim()
  const m = model?.trim()
  const mLower = m?.toLowerCase()

  const hasGatewayKey = Boolean(process.env.AI_GATEWAY_API_KEY)
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY)
  const hasGoogleKey = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY
  )

  // 1. Explicit provider selection
  if (p === "moonshot" || p === "moonshotai") {
    if (hasGatewayKey) {
      return gateway(`moonshotai/${m || "kimi-k3"}`)
    }
  }
  if (p === "deepseek") {
    if (hasGatewayKey) {
      return gateway(`deepseek/${m || "deepseek-r1"}`)
    }
  }
  if (p === "openai") {
    if (!hasOpenAIKey && hasGatewayKey) {
      return gateway(`openai/${m || "gpt-4o-mini"}`)
    }
    return openai(m || "gpt-4o-mini")
  }
  if (p === "anthropic") {
    if (!hasAnthropicKey && hasGatewayKey) {
      return gateway(`anthropic/${m || "claude-3-5-sonnet"}`)
    }
    return anthropic(m || "claude-3-5-sonnet-latest")
  }
  if (p === "google") {
    if (!hasGoogleKey && hasGatewayKey) {
      return gateway(`google/${m || "gemini-2.5-flash"}`)
    }
    return google(m || "gemini-2.5-flash")
  }

  // 2. Gateway prefixed model ID (e.g. "moonshotai/kimi-k3", "deepseek/deepseek-r1", "openai/gpt-4o")
  if (m?.startsWith("moonshotai/")) {
    if (hasGatewayKey) return gateway(m)
  }
  if (m?.startsWith("deepseek/")) {
    if (hasGatewayKey) return gateway(m)
  }
  if (m?.startsWith("openai/")) {
    if (hasGatewayKey) return gateway(m)
    const modelId = m.replace(/^openai\//, "")
    return openai(modelId)
  }
  if (m?.startsWith("anthropic/")) {
    if (hasGatewayKey) return gateway(m)
    const modelId = m.replace(/^anthropic\//, "")
    return anthropic(modelId)
  }
  if (m?.startsWith("google/")) {
    if (hasGatewayKey) return gateway(m)
    const modelId = m.replace(/^google\//, "")
    return google(modelId)
  }

  // Any other provider/model prefix via gateway
  if (m?.includes("/") && hasGatewayKey) {
    return gateway(m)
  }

  // 3. Name-based matching (e.g. Kimi, DeepSeek, Opus, Claude, GPT, Gemini)
  if (mLower?.includes("kimi")) {
    if (hasGatewayKey) {
      if (mLower.includes("fast")) return gateway("moonshotai/kimi-k3-fast")
      if (mLower.includes("code") || mLower.includes("2.7"))
        return gateway("moonshotai/kimi-k2.7-code")
      return gateway("moonshotai/kimi-k3")
    }
  }

  if (mLower?.includes("deepseek")) {
    if (hasGatewayKey) {
      if (mLower.includes("r1")) return gateway("deepseek/deepseek-r1")
      return gateway("deepseek/deepseek-v3.2")
    }
  }

  if (mLower?.includes("opus")) {
    if (hasGatewayKey) {
      if (mLower.includes("4.5")) return gateway("anthropic/claude-opus-4.5")
      if (mLower.includes("5")) return gateway("anthropic/claude-opus-5")
      return gateway("anthropic/claude-opus-4")
    }
    return anthropic("claude-3-opus-latest")
  }

  if (mLower?.includes("claude")) {
    const is37 = mLower.includes("3.7") || mLower.includes("sonnet-4")
    if (hasGatewayKey) {
      return gateway(
        is37 ? "anthropic/claude-3-7-sonnet" : "anthropic/claude-3-5-sonnet"
      )
    }
    return anthropic(
      is37 ? "claude-3-7-sonnet-latest" : "claude-3-5-sonnet-latest"
    )
  }

  if (mLower?.includes("gpt")) {
    const isMini = mLower.includes("4o-mini") || mLower.includes("mini")
    if (hasGatewayKey && !hasOpenAIKey) {
      return gateway(isMini ? "openai/gpt-4o-mini" : "openai/gpt-4o")
    }
    return openai(isMini ? "gpt-4o-mini" : "gpt-4o")
  }

  if (mLower?.includes("gemini")) {
    if (hasGatewayKey) {
      if (mLower.includes("3.8")) return gateway("google/gemini-3.8-flash")
      if (mLower.includes("3.7")) return gateway("google/gemini-3.7-flash")
      if (mLower.includes("3.5")) return gateway("google/gemini-3.5-flash")
      if (mLower.includes("3.1")) return gateway("google/gemini-3.1-pro-preview")
      if (mLower.includes("pro")) return gateway("google/gemini-2.5-pro")
      return gateway("google/gemini-2.5-flash")
    }
    const isPro = mLower.includes("pro")
    return google(isPro ? "gemini-2.5-pro" : "gemini-2.5-flash")
  }

  // 4. Resolve via model catalog
  if (m) {
    const resolved = resolveModel(m)
    if (resolved.provider === "moonshotai" && hasGatewayKey) {
      return gateway(resolved.id)
    }
    if (resolved.provider === "deepseek" && hasGatewayKey) {
      return gateway(resolved.id)
    }
    if (resolved.provider === "openai") {
      if (hasOpenAIKey) return openai(resolved.id.replace(/^openai\//, ""))
      if (hasGatewayKey) return gateway(resolved.id)
    }
    if (resolved.provider === "anthropic") {
      if (hasAnthropicKey)
        return anthropic(resolved.id.replace(/^anthropic\//, ""))
      if (hasGatewayKey) return gateway(resolved.id)
    }
    if (resolved.provider === "google") {
      if (hasGoogleKey) return google(resolved.id.replace(/^google\//, ""))
      if (hasGatewayKey) return gateway(resolved.id)
    }
  }

  // 5. Default based on available environment API keys
  if (hasGatewayKey) {
    return gateway("moonshotai/kimi-k3")
  }
  if (hasGoogleKey) {
    return google("gemini-2.5-flash")
  }
  if (hasOpenAIKey) {
    return openai("gpt-4o-mini")
  }
  if (hasAnthropicKey) {
    return anthropic("claude-3-5-sonnet-latest")
  }

  // Fallback default
  return google(m || "gemini-2.5-flash")
}

export async function POST(req: Request) {
  // 1. Auth gate with Clerk SDK
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  // 2. Parse request body sent by useChat
  const {
    messages,
    id,
    chatId,
    model,
    provider,
  }: {
    messages?: UIMessage[]
    id?: string
    chatId?: string
    model?: string
    provider?: string
  } = await req.json()

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages array is required", { status: 400 })
  }

  const effectiveChatId = chatId || id || "default"

  // 3. Persist incoming browser history immediately so user messages are never lost
  await saveMessages({
    chatId: effectiveChatId,
    userId,
    messages,
  })

  // 4. Select provider & model (Google, OpenAI, or Anthropic)
  const selectedModel = getLanguageModel(provider, model)

  // 5. Stream response using AI SDK
  const result = streamText({
    model: selectedModel,
    messages: await convertToModelMessages(messages),
  })

  // Ensure stream runs to completion even if client disconnects
  result.consumeStream()

  // 6. Return streaming response compatible with useChat, saving full messages upon completion
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: (error) => {
        if (error == null) return "An error occurred."
        if (typeof error === "string") return error
        if (error instanceof Error) return error.message
        return JSON.stringify(error)
      },
      onEnd: async ({ messages: completedMessages }) => {
        try {
          await saveMessages({
            chatId: effectiveChatId,
            userId,
            messages: completedMessages,
          })
        } catch (error) {
          console.error("Failed to persist completed chat messages:", error)
        }
      },
    }),
  })
}

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const chatId = searchParams.get("chatId") || searchParams.get("id")
  if (!chatId) {
    return new Response("chatId or id query parameter is required", { status: 400 })
  }

  const history = await getMessagesByChatId(chatId)
  return Response.json(history)
}

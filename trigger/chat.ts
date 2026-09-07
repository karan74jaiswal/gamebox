import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import { locals } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { gateway, streamText, type LanguageModel, type UIMessage } from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { resolveModel, DEFAULT_MODEL_ID } from "@/lib/ai/models"
import { sanitizeErrorMessage } from "@/lib/ai/errors"
import { db, games } from "@/lib/db"

/**
 * Resolves the language model based on provider or model identifier,
 * supporting Moonshot (Kimi), OpenAI, Anthropic, Google, DeepSeek via Vercel AI Gateway
 * or direct provider keys.
 */
function getLanguageModel(provider?: string, model?: string): LanguageModel {
  const p = provider?.toLowerCase().trim()
  const m = (model || DEFAULT_MODEL_ID).trim()
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
      if (mLower.includes("3.1"))
        return gateway("google/gemini-3.1-pro-preview")
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
    return gateway(m || DEFAULT_MODEL_ID)
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

const streamErrorKey = locals.create<string>("game-chat.streamError")
const tools = {}

export const gameChat = chat.agent({
  id: "game-chat",
  tools,
  clientDataSchema: z.object({
    model: z.string().optional(),
    provider: z.string().optional(),
  }),
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const [record] = await db
      .select({ messages: games.messages })
      .from(games)
      .where(eq(games.id, chatId))
      .limit(1)
    const stored = (record?.messages as UIMessage[]) ?? []

    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      await db
        .update(games)
        .set({ messages: stored, updatedAt: new Date() })
        .where(eq(games.id, chatId))
    }

    return stored
  },
  uiMessageStreamOptions: {
    onError: (error) => {
      const message = sanitizeErrorMessage(error)
      locals.set(streamErrorKey, message)
      return message
    },
  },
  onTurnStart: async ({ chatId, uiMessages, clientData }) => {
    await db
      .update(games)
      .set({
        messages: uiMessages,
        ...(clientData?.model ? { model: clientData.model } : {}),
        updatedAt: new Date(),
      })
      .where(eq(games.id, chatId))
  },
  onTurnComplete: async ({
    chatId,
    uiMessages,
    lastEventId,
    clientData,
    error,
    finishReason,
  }) => {
    const finalMessages = [...uiMessages]
    const streamError = locals.get(streamErrorKey)
    locals.set(streamErrorKey, undefined)

    const isFailedTurn = Boolean(error) || finishReason === "error"

    const lastIdx = finalMessages.length - 1
    const lastMsg = lastIdx >= 0 ? finalMessages[lastIdx] : undefined

    const textParts =
      lastMsg && Array.isArray(lastMsg.parts)
        ? lastMsg.parts.filter(
            (p): p is { type: "text"; text: string } =>
              p.type === "text" &&
              typeof (p as { text?: unknown }).text === "string"
          )
        : []
    const hasText = textParts.some((p) => p.text.trim().length > 0)

    // A turn needs error handling if an explicit error occurred OR if the assistant ended with no text
    if (isFailedTurn || (lastMsg?.role === "assistant" && !hasText)) {
      const sanitizedError = sanitizeErrorMessage(
        error ||
          streamError ||
          "The model failed to generate a response. Please select a different model."
      )

      if (!lastMsg || lastMsg.role === "user") {
        // No assistant message was generated at all -> append new assistant message with error metadata
        finalMessages.push({
          id: `error-${Date.now()}`,
          role: "assistant",
          metadata: {
            isError: true,
            errorText: sanitizedError,
          },
          parts: [],
        })
      } else if (lastMsg.role === "assistant") {
        // Trigger.dev created an assistant stub or turn failed mid-stream
        finalMessages[lastIdx] = {
          ...lastMsg,
          metadata: {
            ...(lastMsg.metadata as object),
            isError: true,
            errorText: sanitizedError,
          },
          parts: [],
        }
      }
    }

    await db
      .update(games)
      .set({
        messages: finalMessages,
        lastEventId: lastEventId ?? null,
        ...(clientData?.model ? { model: clientData.model } : {}),
        updatedAt: new Date(),
      })
      .where(eq(games.id, chatId))

    chat.history.set(finalMessages)
  },
  run: async ({ messages, tools, signal, clientData }) => {
    const selectedModel = getLanguageModel(
      clientData?.provider,
      clientData?.model
    )

    // Ensure alternating user/assistant roles for LLM providers (e.g. Anthropic/Gemini) that require it
    const sanitizedMessages = messages.reduce<typeof messages>(
      (acc, current) => {
        if (acc.length === 0) return [current]
        const prev = acc[acc.length - 1]
        if (prev.role === "user" && current.role === "user") {
          acc.push({
            role: "assistant",
            content: "An error occurred during the previous attempt.",
          })
        }
        acc.push(current)
        return acc
      },
      []
    )

    return streamText({
      ...chat.toStreamTextOptions({ tools }),
      model: selectedModel,
      messages: sanitizedMessages,
      abortSignal: signal,
    })
  },
})

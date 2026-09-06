import { auth } from "@clerk/nextjs/server"
import { anthropic } from "@ai-sdk/anthropic"
import { google } from "@ai-sdk/google"
import { openai } from "@ai-sdk/openai"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
} from "ai"

import { getMessagesByChatId, saveMessages } from "@/lib/db/messages"

// Allow streaming responses up to 60 seconds
export const maxDuration = 60

/**
 * Resolves the language model based on provider or model identifier,
 * supporting Google, OpenAI, and Anthropic.
 */
function getLanguageModel(provider?: string, model?: string): LanguageModel {
  const p = provider?.toLowerCase().trim()
  const m = model?.trim()
  const mLower = m?.toLowerCase()

  // 1. Explicit provider selection
  if (p === "openai") {
    return openai(m || "gpt-4o-mini")
  }
  if (p === "anthropic") {
    return anthropic(m || "claude-3-5-sonnet-latest")
  }
  if (p === "google") {
    return google(m || "gemini-2.5-flash")
  }

  // 2. Provider prefix in model ID (e.g. "google/gemini-2.5-flash", "openai/gpt-4o", "anthropic/claude-3-7-sonnet-latest")
  if (m?.startsWith("openai/")) {
    return openai(m.replace(/^openai\//, ""))
  }
  if (m?.startsWith("anthropic/")) {
    return anthropic(m.replace(/^anthropic\//, ""))
  }
  if (m?.startsWith("google/")) {
    return google(m.replace(/^google\//, ""))
  }

  // 3. Name-based matching (e.g. Claude, GPT, Gemini)
  if (mLower?.includes("claude")) {
    const modelId = mLower.includes("3.7")
      ? "claude-3-7-sonnet-latest"
      : "claude-3-5-sonnet-latest"
    return anthropic(modelId)
  }
  if (mLower?.includes("gpt")) {
    const modelId = mLower.includes("4o-mini") ? "gpt-4o-mini" : "gpt-4o"
    return openai(modelId)
  }
  if (mLower?.includes("gemini")) {
    return google(m || "gemini-2.5-flash")
  }

  // 4. Default based on available environment API keys
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY) {
    return google(m || "gemini-2.5-flash")
  }
  if (process.env.OPENAI_API_KEY) {
    return openai(m || "gpt-4o-mini")
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(m || "claude-3-5-sonnet-latest")
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

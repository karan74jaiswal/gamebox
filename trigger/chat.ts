import { locals } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { streamText, stepCountIs, type UIMessage } from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { getLanguageModel } from "@/lib/ai/provider"
import { sanitizeContext } from "@/lib/ai/sanitizer"
import { isAbortError, sanitizeErrorMessage } from "@/lib/ai/errors"
import { generateGameTitle } from "@/lib/games/title"
import { instructions } from "@/lib/games/instructions"
import { db, games } from "@/lib/db"
import { getGameSandbox } from "@/lib/daytona/utils"
import { tools, setGameChatContext } from "@/lib/games/tools"

const streamErrorKey = locals.create<string>("game-chat.streamError")

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
  onChatStart: async ({ chatId, messages, writer }) => {
    const sandbox = await getGameSandbox(chatId)
    setGameChatContext(chatId, sandbox)
    writer.write({
      type: "data-game-sandbox",
      id: "game-sandbox",
      data: { id: chatId, sandboxId: sandbox.id },
      transient: true,
    })

    const firstUserMessage = messages.find((m) => m.role === "user")
    const promptText =
      typeof firstUserMessage?.content === "string"
        ? firstUserMessage.content
        : Array.isArray(firstUserMessage?.content)
          ? firstUserMessage.content
              .filter(
                (p): p is { type: "text"; text: string } =>
                  p.type === "text" &&
                  typeof (p as { text?: unknown }).text === "string"
              )
              .map((p) => p.text)
              .join(" ")
              .trim()
          : ""

    if (promptText) {
      chat.defer(async () => {
        const generatedTitle = await generateGameTitle(promptText)
        if (generatedTitle) {
          await db
            .update(games)
            .set({
              title: generatedTitle,
              updatedAt: new Date(),
            })
            .where(eq(games.id, chatId))

          chat.response.write({
            type: "data-game-title",
            id: "game-title",
            data: { id: chatId, title: generatedTitle },
            transient: true,
          })
        }
      })
    }
  },
  onTurnStart: async ({ chatId }) => {
    setGameChatContext(chatId)
  },
  uiMessageStreamOptions: {
    onError: (error) => {
      if (isAbortError(error) || chat.isStopped()) {
        locals.set(streamErrorKey, undefined)
        return ""
      }
      const message = sanitizeErrorMessage(error)
      locals.set(streamErrorKey, message)
      return message
    },
  },

  onTurnComplete: async ({
    chatId,
    uiMessages,
    lastEventId,
    clientData,
    error,
    finishReason,
    stopped,
  }) => {
    const finalMessages = [...uiMessages]
    const streamError = locals.get(streamErrorKey)
    locals.set(streamErrorKey, undefined)

    const wasStopped =
      Boolean(stopped) || chat.isStopped() || isAbortError(error)

    const isFailedTurn =
      !wasStopped && (Boolean(error) || finishReason === "error")

    const lastIdx = finalMessages.length - 1
    const lastMsg = lastIdx >= 0 ? finalMessages[lastIdx] : undefined

    const hasContent =
      lastMsg && Array.isArray(lastMsg.parts)
        ? lastMsg.parts.some((p) => {
            if (p.type === "text")
              return (
                typeof (p as { text?: unknown }).text === "string" &&
                (p as { text: string }).text.trim().length > 0
              )
            if (p.type === "reasoning")
              return (
                typeof (p as { text?: unknown }).text === "string" &&
                (p as { text: string }).text.trim().length > 0
              )
            return true
          })
        : false

    if (wasStopped) {
      // If user stopped/cancelled the turn:
      // If the assistant message has no meaningful content, remove it so only the user message remains
      // If the assistant message has partial content, preserve it cleanly (no error banner/metadata)
      if (lastMsg?.role === "assistant" && !hasContent) {
        finalMessages.pop()
      }
    } else if (isFailedTurn || (lastMsg?.role === "assistant" && !hasContent)) {
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
  run: async ({ messages, tools, signal, clientData, chatId }) => {
    setGameChatContext(chatId)
    const selectedModel = getLanguageModel(
      clientData?.provider,
      clientData?.model
    )

    const sanitizedMessages = sanitizeContext(messages)

    return streamText({
      ...chat.toStreamTextOptions({ tools }),
      model: selectedModel,
      instructions,
      messages: sanitizedMessages,
      abortSignal: signal,
      stopWhen: stepCountIs(50),
      maxRetries: 0,
    })
  },
})

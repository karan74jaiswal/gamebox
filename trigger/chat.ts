import { locals } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { streamText, stepCountIs, type UIMessage } from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as Sentry from "@sentry/node"

import { getLanguageModel } from "@/lib/ai/provider"
import { sanitizeContext } from "@/lib/ai/sanitizer"
import { isAbortError, sanitizeErrorMessage } from "@/lib/ai/errors"
import { generateGameTitle } from "@/lib/games/title"
import { instructions } from "@/lib/games/instructions"
import { db, games } from "@/lib/db"
import { getGameSandbox } from "@/lib/daytona/utils"
import { tools, setGameChatContext } from "@/lib/games/tools"

const streamErrorKey = locals.create<string>("game-chat.streamError")
const rawStreamErrorKey = locals.create<string>("game-chat.rawStreamError")

/**
 * Executes a database operation with exponential backoff retry and full cause logging.
 * Prevents transient Neon serverless wake-up or connection timeouts from aborting active chat turns.
 */
async function withDbRetry<T>(
  operation: () => Promise<T>,
  context: string,
  retries = 3,
  delayMs = 500
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (err: unknown) {
      attempt++
      const errMsg = err instanceof Error ? err.message : String(err)
      if (attempt >= retries) {
        Sentry.logger.error("Database operation failed after all retries in chat", {
          context,
          attempt,
          maxRetries: retries,
          error: errMsg,
        })
        throw err
      }
      Sentry.logger.warn("Database operation retry in chat", {
        context,
        attempt,
        maxRetries: retries,
        error: errMsg,
      })
      await new Promise((res) =>
        setTimeout(res, delayMs * Math.pow(2, attempt - 1))
      )
    }
  }
}

function finalizeMessageParts(
  parts?: UIMessage["parts"],
  fallbackError = "Tool execution was interrupted.",
  rawError?: string
): UIMessage["parts"] {
  if (!Array.isArray(parts) || parts.length === 0) return []

  return parts.map((part) => {
    // Finalize in-flight / unfinished tool calls
    if (typeof part === "object" && part !== null && "toolCallId" in part) {
      const toolPart = part as {
        state?: string
        toolCallId: string
        errorText?: string
        rawError?: string
      }
      if (
        toolPart.state === "input-streaming" ||
        toolPart.state === "input-available"
      ) {
        return {
          ...part,
          state: "output-error",
          input:
            "input" in toolPart && toolPart.input !== undefined
              ? toolPart.input
              : {},
          errorText: fallbackError,
          ...(rawError ? { rawError } : {}),
        } as UIMessage["parts"][number]
      }
      return part
    }

    // Finalize streaming reasoning blocks
    if (
      part.type === "reasoning" &&
      (part as { state?: string }).state === "streaming"
    ) {
      return {
        ...part,
        state: "done",
      }
    }

    // Finalize streaming text parts
    if (
      part.type === "text" &&
      (part as { state?: string }).state === "streaming"
    ) {
      return {
        ...part,
        state: "done",
      }
    }

    return part
  })
}

export const gameChat = chat.agent({
  id: "game-chat",
  tools,
  clientDataSchema: z.object({
    model: z.string().optional(),
    provider: z.string().optional(),
  }),
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const [record] = await withDbRetry(
      () =>
        db
          .select({ messages: games.messages })
          .from(games)
          .where(eq(games.id, chatId))
          .limit(1),
      "hydrateMessages:select"
    )
    const stored = (record?.messages as UIMessage[]) ?? []

    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      try {
        await withDbRetry(
          () =>
            db
              .update(games)
              .set({ messages: stored, updatedAt: new Date() })
              .where(eq(games.id, chatId)),
          "hydrateMessages:update"
        )
      } catch (err) {
        Sentry.logger.error(
          "Failed to persist incoming message during hydration in chat",
          {
            chatId,
            error: err instanceof Error ? err.message : String(err),
          }
        )
      }
    }

    return stored
  },
  onChatStart: async ({ chatId, messages, writer }) => {
    Sentry.logger.info("Game chat session started", { chatId })
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
        try {
          const generatedTitle = await generateGameTitle(promptText)
          if (generatedTitle) {
            await withDbRetry(
              () =>
                db
                  .update(games)
                  .set({
                    title: generatedTitle,
                    updatedAt: new Date(),
                  })
                  .where(eq(games.id, chatId)),
              "onChatStart:updateTitle"
            )

            chat.response.write({
              type: "data-game-title",
              id: "game-title",
              data: { id: chatId, title: generatedTitle },
              transient: true,
            })
          }
        } catch (err) {
          Sentry.logger.error(
            "Failed to generate or save game title in chat session",
            {
              chatId,
              error: err instanceof Error ? err.message : String(err),
            }
          )
        }
      })
    }
  },
  onTurnStart: async ({ chatId }) => {
    setGameChatContext(chatId)
    Sentry.logger.info("Game chat turn started", { chatId })
  },
  onBeforeTurnComplete: async ({ writer, chatId, stopped, finishReason }) => {
    const streamError = locals.get(streamErrorKey)
    const wasStopped = Boolean(stopped) || chat.isStopped()
    if (!wasStopped && (Boolean(streamError) || finishReason === "error")) {
      const sanitized =
        streamError || sanitizeErrorMessage("Generation failed.")
      writer.write({
        type: "data-turn-error",
        id: "turn-error",
        data: { id: chatId, errorText: sanitized },
        transient: true,
      })
    }
  },
  uiMessageStreamOptions: {
    sendReasoning: true,

    onError: (error) => {
      if (isAbortError(error) || chat.isStopped()) {
        locals.set(streamErrorKey, undefined)
        locals.set(rawStreamErrorKey, undefined)
        return ""
      }
      const rawErrorMessage =
        error instanceof Error
          ? error.stack || error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error)

      // Capture model stream errors in Sentry as tracked issues
      Sentry.captureException(error, {
        tags: {
          location: "game-chat.uiMessageStreamOptions.onError",
        },
        extra: {
          rawError: rawErrorMessage,
        },
      })
      Sentry.logger.error("Game chat model stream error", {
        error: rawErrorMessage,
      })
      const message = sanitizeErrorMessage(error)
      locals.set(streamErrorKey, message)
      locals.set(rawStreamErrorKey, rawErrorMessage)
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
    const rawStreamError = locals.get(rawStreamErrorKey)
    locals.set(streamErrorKey, undefined)
    locals.set(rawStreamErrorKey, undefined)

    const wasStopped =
      Boolean(stopped) || chat.isStopped() || isAbortError(error)

    const isFailedTurn =
      !wasStopped &&
      (Boolean(error) || Boolean(streamError) || finishReason === "error")

    // If turn failed and error was not already captured by onError, capture it in Sentry now
    if (isFailedTurn && !rawStreamError) {
      const turnErr =
        error instanceof Error
          ? error
          : new Error(
              typeof error === "string"
                ? error
                : `Chat turn failed (finishReason: ${finishReason || "unknown"})`
            )
      Sentry.captureException(turnErr, {
        tags: {
          location: "game-chat.onTurnComplete",
          finishReason: finishReason ?? "unknown",
        },
        extra: {
          chatId,
          model: clientData?.model,
          rawError: error instanceof Error ? error.message : String(error),
        },
      })
      Sentry.logger.error("Game chat turn completed with error", {
        chatId,
        finishReason: finishReason ?? "unknown",
        error: error instanceof Error ? error.message : String(error),
      })
    }

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
      // If the assistant message has partial content, preserve it cleanly
      if (lastMsg?.role === "assistant") {
        if (!hasContent) {
          finalMessages.pop()
        } else {
          finalMessages[lastIdx] = {
            ...lastMsg,
            parts: finalizeMessageParts(
              lastMsg.parts,
              "Generation was cancelled."
            ),
          }
        }
      }
    } else if (isFailedTurn || (lastMsg?.role === "assistant" && !hasContent)) {
      const sanitizedError = sanitizeErrorMessage(
        error ||
          streamError ||
          "The model failed to generate a response. Please select a different model."
      )
      const rawErrorDetail =
        rawStreamError ||
        (error instanceof Error
          ? error.message
          : error
            ? String(error)
            : finishReason === "error"
              ? "Stream ended with finishReason: error"
              : undefined)

      if (!lastMsg || lastMsg.role === "user") {
        // No assistant message was generated at all -> append new assistant message with error metadata
        finalMessages.push({
          id: `error-${Date.now()}`,
          role: "assistant",
          metadata: {
            isError: true,
            errorText: sanitizedError,
            ...(rawErrorDetail ? { rawError: rawErrorDetail } : {}),
          },
          parts: [],
        })
      } else if (lastMsg.role === "assistant") {
        if (!hasContent) {
          finalMessages[lastIdx] = {
            ...lastMsg,
            metadata: {
              ...(lastMsg.metadata as object),
              isError: true,
              errorText: sanitizedError,
              ...(rawErrorDetail ? { rawError: rawErrorDetail } : {}),
            },
            parts: [],
          }
        } else {
          // Preserve all accumulated parts and finalize any in-flight ones
          finalMessages[lastIdx] = {
            ...lastMsg,
            metadata: {
              ...(lastMsg.metadata as object),
              isError: true,
              errorText: sanitizedError,
              ...(rawErrorDetail ? { rawError: rawErrorDetail } : {}),
            },
            parts: finalizeMessageParts(
              lastMsg.parts,
              sanitizedError,
              rawErrorDetail
            ),
          }
        }
      }
    }

    await withDbRetry(
      () =>
        db
          .update(games)
          .set({
            messages: finalMessages,
            lastEventId: lastEventId ?? null,
            ...(clientData?.model ? { model: clientData.model } : {}),
            updatedAt: new Date(),
          })
          .where(eq(games.id, chatId)),
      "onTurnComplete:update"
    )

    chat.history.set(finalMessages)

    Sentry.logger.info("Game chat turn completed", {
      chatId,
      finishReason: finishReason || "unknown",
      wasStopped,
      isFailedTurn,
      messageCount: finalMessages.length,
    })
  },
  run: async ({ messages, tools, signal, clientData, chatId }) => {
    setGameChatContext(chatId)

    Sentry.logger.info("Game chat model stream initiated", {
      chatId,
      messageCount: messages.length,
      model: clientData?.model || "default",
      provider: clientData?.provider || "default",
    })

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
      maxRetries: 2,
      providerOptions: {
        vertex: {
          thinkingConfig: {
            includeThoughts: true,
          },
          streamFunctionCallArguments: true,
        },

        google: {
          thinkingConfig: {
            includeThoughts: true,
          },
        },
      },
    })
  },
})

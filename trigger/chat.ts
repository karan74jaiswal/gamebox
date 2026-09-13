import { locals, logger } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { streamText, stepCountIs, type UIMessage } from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as Sentry from "@sentry/node"

import { getLanguageModel } from "@/lib/ai/provider"
import { sanitizeContext, sanitizeStep } from "@/lib/ai/sanitizer"
import { isAbortError, type ResolvedError } from "@/lib/ai/errors"
import { resolveError } from "@/lib/ai/errors.server"
import { generateGameTitle } from "@/lib/games/title"
import { instructions } from "@/lib/games/instructions"
import { db, games } from "@/lib/db"
import { getGameSandbox } from "@/lib/daytona/utils"
import { tools, setGameChatContext } from "@/lib/games/tools"

const streamErrorKey = locals.create<string>("game-chat.streamError")
const rawStreamErrorKey = locals.create<string>("game-chat.rawStreamError")
const resolvedErrorKey = locals.create<ResolvedError>("game-chat.resolvedError")

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
        Sentry.logger.error(
          "Database operation failed after all retries in chat",
          {
            context,
            attempt,
            maxRetries: retries,
            error: errMsg,
          }
        )
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
        type?: string
        toolName?: string
        state?: string
        toolCallId: string
        errorText?: string
        rawError?: string
        output?: unknown
      }

      // Do not convert ask_player into output-error if it already has an answer or if waiting for answer
      const isAskPlayer =
        toolPart.type === "tool-ask_player" ||
        toolPart.toolName === "ask_player" ||
        (typeof part === "object" &&
          "input" in part &&
          typeof part.input === "object" &&
          part.input !== null &&
          "dimension" in (part.input as Record<string, unknown>))

      if (isAskPlayer) {
        if (
          toolPart.output !== undefined ||
          toolPart.state === "output-available"
        ) {
          return part
        }
        if (toolPart.state === "input-available") {
          return part
        }
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
    locals.set(streamErrorKey, undefined)
    locals.set(rawStreamErrorKey, undefined)
    locals.set(resolvedErrorKey, undefined)
    setGameChatContext(chatId)
    Sentry.logger.info("Game chat turn started", { chatId })
  },
  onBeforeTurnComplete: async ({
    writer,
    chatId,
    stopped,
    finishReason,
    error,
  }) => {
    const streamError = locals.get(streamErrorKey)
    const storedResolved = locals.get(resolvedErrorKey)
    const wasStopped = Boolean(stopped) || chat.isStopped()
    const isAbnormalFinish =
      finishReason === "error" ||
      finishReason === "length" ||
      finishReason === "content-filter" ||
      finishReason === "other"
    if (!wasStopped && (Boolean(error) || isAbnormalFinish)) {
      const resolved =
        (error ? resolveError(error, finishReason) : undefined) ??
        storedResolved ??
        resolveError(streamError || undefined, finishReason)
      writer.write({
        type: "data-turn-error",
        id: "turn-error",
        data: {
          id: chatId,
          errorText: resolved.userMessage,
          category: resolved.category,
          errorType: resolved.errorType,
          statusCode: resolved.statusCode,
          code: resolved.code,
        },
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
        locals.set(resolvedErrorKey, undefined)
        return ""
      }
      const resolved = resolveError(error)
      locals.set(resolvedErrorKey, resolved)
      locals.set(streamErrorKey, resolved.userMessage)
      locals.set(rawStreamErrorKey, resolved.rawMessage)

      // Capture model stream errors in Sentry as tracked issues
      Sentry.captureException(error, {
        tags: {
          location: "game-chat.uiMessageStreamOptions.onError",
          category: resolved.category,
          errorType: resolved.errorType,
          statusCode: String(resolved.statusCode ?? "unknown"),
          code: resolved.code ?? "none",
        },
        extra: {
          rawError: resolved.rawMessage,
          details: resolved.details,
        },
      })
      Sentry.logger.error("Game chat model stream error", {
        category: resolved.category,
        errorType: resolved.errorType,
        statusCode: resolved.statusCode,
        code: resolved.code,
        error: resolved.rawMessage,
      })
      return resolved.userMessage
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
    const storedResolvedError = locals.get(resolvedErrorKey)
    locals.set(streamErrorKey, undefined)
    locals.set(rawStreamErrorKey, undefined)
    locals.set(resolvedErrorKey, undefined)

    const wasStopped =
      Boolean(stopped) || chat.isStopped() || isAbortError(error)

    const isAbnormalFinish =
      finishReason === "error" ||
      finishReason === "length" ||
      finishReason === "content-filter" ||
      finishReason === "other"

    const isFailedTurn = !wasStopped && (Boolean(error) || isAbnormalFinish)

    // If turn failed, capture structured diagnostic in Sentry and Trigger logger
    if (isFailedTurn) {
      const resolved =
        (error ? resolveError(error, finishReason) : undefined) ??
        storedResolvedError ??
        resolveError(rawStreamError || streamError || undefined, finishReason)

      const turnErr =
        error instanceof Error
          ? error
          : new Error(
              typeof error === "string"
                ? error
                : `Chat turn failed (${resolved.errorType}: ${resolved.code ?? finishReason ?? "unknown"})`
            )
      Sentry.captureException(turnErr, {
        tags: {
          location: "game-chat.onTurnComplete",
          finishReason: finishReason ?? "unknown",
          category: resolved.category,
          errorType: resolved.errorType,
          statusCode: String(resolved.statusCode ?? "unknown"),
          code: resolved.code ?? "none",
        },
        extra: {
          chatId,
          model: clientData?.model,
          rawError: resolved.rawMessage,
          details: resolved.details,
        },
      })
      logger.error(
        `==================== [TURN FAILED: ${resolved.category.toUpperCase()}] (Chat: ${chatId}) ====================`,
        {
          chatId,
          category: resolved.category,
          errorType: resolved.errorType,
          statusCode: resolved.statusCode,
          code: resolved.code,
          rawError: resolved.rawMessage,
          details: resolved.details,
          userMessage: resolved.userMessage,
        }
      )
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
      const resolved =
        (error ? resolveError(error, finishReason) : undefined) ??
        storedResolvedError ??
        resolveError(rawStreamError || streamError || undefined, finishReason)

      const errorMetadata = {
        isError: true,
        errorText: resolved.userMessage,
        errorCategory: resolved.category,
        errorType: resolved.errorType,
        ...(resolved.statusCode !== undefined
          ? { statusCode: resolved.statusCode }
          : {}),
        ...(resolved.code ? { errorCode: resolved.code } : {}),
        rawError: resolved.rawMessage,
        ...(resolved.details ? { errorDetails: resolved.details } : {}),
      }

      if (!lastMsg || lastMsg.role === "user") {
        // No assistant message was generated at all -> append new assistant message with error metadata
        finalMessages.push({
          id: `error-${Date.now()}`,
          role: "assistant",
          metadata: errorMetadata,
          parts: [],
        })
      } else if (lastMsg.role === "assistant") {
        if (!hasContent) {
          finalMessages[lastIdx] = {
            ...lastMsg,
            metadata: {
              ...(lastMsg.metadata as object),
              ...errorMetadata,
            },
            parts: [],
          }
        } else {
          // Preserve all accumulated parts and finalize any in-flight ones
          finalMessages[lastIdx] = {
            ...lastMsg,
            metadata: {
              ...(lastMsg.metadata as object),
              ...errorMetadata,
            },
            parts: finalizeMessageParts(
              lastMsg.parts,
              resolved.userMessage,
              resolved.rawMessage
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
    logger.info(
      `==================== [TURN COMPLETE] (Chat: ${chatId} | Finish: ${finishReason || "unknown"}) ====================`
    )
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
    logger.info(
      `==================== [TURN START: LLM CONTEXT] (Chat: ${chatId}) ====================`,
      {
        totalMessages: sanitizedMessages.length,
        rawInputCount: messages.length,
        messages: sanitizedMessages,
      }
    )
    return streamText({
      ...chat.toStreamTextOptions({ tools }),
      model: selectedModel,
      instructions,
      messages: sanitizedMessages,
      abortSignal: signal,

      stopWhen: stepCountIs(50),
      maxRetries: 4,

      prepareStep: async ({ messages: stepMessages, steps }) => {
        const sanitized = sanitizeStep(stepMessages, { windowSteps: 20 })
        const stepNum = steps.length + 1

        logger.info(
          `-------------------- [STEP ${stepNum}: LLM PAYLOAD] (Turn Steps: ${steps.length}) --------------------`,
          {
            stepNumber: stepNum,
            totalMessages: sanitized.length,
            rawStepMessagesCount: stepMessages.length,
            messages: sanitized,
          }
        )

        return {
          messages: sanitized,
        }
      },

      providerOptions: {
        vertex: {
          thinkingConfig: {
            includeThoughts: true,
          },

          // streamFunctionCallArguments: true,
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

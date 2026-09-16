import { locals, logger } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { streamText, stepCountIs, type UIMessage } from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as Sentry from "@sentry/node"

import { getLanguageModel } from "@/lib/ai/provider"
import { sanitizeContext } from "@/lib/ai/sanitizer"
import { isAbortError, type ResolvedError } from "@/lib/ai/errors"
import { resolveError } from "@/lib/ai/errors.server"
import { DEFAULT_MODEL_ID } from "@/lib/ai/models"
import { checkAndSyncOrgCredits, OUT_OF_CREDITS_MESSAGE } from "@/lib/credits"
import { getInitialPromptText } from "@/lib/games/title"
import { instructions } from "@/lib/games/instructions"
import { db, games, withDbRetry } from "@/lib/db"
import { getGameSandbox } from "@/lib/daytona/utils"
import { tools, setGameChatContext } from "@/lib/games/tools"
import { reconcileTurnMessages } from "@/lib/ai/messages"
import {
  chargeStepCredits,
  generateAndPersistGameTitle,
  logTurnFailure,
  prepareStepContext,
} from "./chat-helpers"

const streamErrorKey = locals.create<string>("game-chat.streamError")
const rawStreamErrorKey = locals.create<string>("game-chat.rawStreamError")
const resolvedErrorKey = locals.create<ResolvedError>("game-chat.resolvedError")
const orgIdKey = locals.create<string>("game-chat.orgId")

export const gameChat = chat.agent({
  id: "game-chat",
  tools,
  clientDataSchema: z.object({
    model: z.string().optional(),
    provider: z.string().optional(),
    orgId: z.string().optional(),
  }),
  hydrateMessages: async ({
    chatId,
    trigger,
    incomingMessages,
    clientData,
  }) => {
    const orgId = clientData?.orgId || locals.get(orgIdKey)
    if (!orgId) {
      throw new Error(
        `Cannot run chat turn: Missing organization ID for game ${chatId}`
      )
    }

    locals.set(orgIdKey, orgId)
    const creditCheck = await checkAndSyncOrgCredits(orgId)
    if (!creditCheck.allowed) {
      logger.warn(
        `==================== [TURN BLOCKED: OUT OF CREDITS] (Chat: ${chatId} | Org: ${orgId} | Balance: ${creditCheck.balance.toString()} nano-dollars) ====================`
      )
      Sentry.logger.info(
        "Game chat turn blocked in hydrateMessages: org out of credits",
        {
          chatId,
          orgId,
          balance: creditCheck.balance.toString(),
          synced: creditCheck.synced,
        }
      )
      throw new Error(`OUT_OF_CREDITS: ${OUT_OF_CREDITS_MESSAGE}`)
    }

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

    const promptText = getInitialPromptText(messages)
    if (promptText) {
      chat.defer(() => generateAndPersistGameTitle(chatId, promptText))
    }
  },
  onTurnStart: async ({ chatId, clientData }) => {
    locals.set(streamErrorKey, undefined)
    locals.set(rawStreamErrorKey, undefined)
    locals.set(resolvedErrorKey, undefined)
    setGameChatContext(chatId)

    const orgId = clientData?.orgId || locals.get(orgIdKey)
    if (orgId) {
      locals.set(orgIdKey, orgId)
    }

    Sentry.logger.info("Game chat turn started", {
      chatId,
      orgId: locals.get(orgIdKey),
    })
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

    let resolvedError: ResolvedError | undefined
    if (isFailedTurn) {
      resolvedError =
        (error ? resolveError(error, finishReason) : undefined) ??
        storedResolvedError ??
        resolveError(rawStreamError || streamError || undefined, finishReason)

      logTurnFailure({
        chatId,
        error,
        finishReason,
        resolved: resolvedError,
        clientData,
      })
    }

    const finalMessages = reconcileTurnMessages({
      uiMessages,
      wasStopped,
      isFailedTurn,
      resolvedError,
    })

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

    const orgId = clientData?.orgId || locals.get(orgIdKey)
    if (!orgId) {
      throw new Error(
        `Cannot run chat turn: Missing organization ID for game ${chatId}`
      )
    }

    const modelId = clientData?.model || DEFAULT_MODEL_ID

    Sentry.logger.info("Game chat model stream initiated", {
      chatId,
      orgId,
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

      stopWhen: stepCountIs(100),
      maxRetries: 4,

      prepareStep: async ({ messages: stepMessages, steps }) =>
        prepareStepContext(stepMessages, steps.length + 1),

      onStepFinish: async (step) =>
        chargeStepCredits(step, { orgId, chatId, modelId }),

      providerOptions: {
        vertex: {
          thinkingConfig: {
            includeThoughts: true,
          },
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

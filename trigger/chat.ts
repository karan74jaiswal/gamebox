import { locals, logger } from "@trigger.dev/sdk"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import {
  convertToModelMessages,
  isToolUIPart,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as Sentry from "@sentry/node"

import { getLanguageModel } from "@/lib/ai/provider"
import { sanitizeContext } from "@/lib/ai/sanitizer"
import {
  isAbortError,
  isRetryableQuotaError,
  type ResolvedError,
} from "@/lib/ai/errors"
import { resolveError } from "@/lib/ai/errors.server"
import { DEFAULT_MODEL_ID } from "@/lib/ai/models"
import { checkAndSyncOrgCredits, OUT_OF_CREDITS_MESSAGE } from "@/lib/credits"
import { getInitialPromptText } from "@/lib/games/title"
import { instructions } from "@/lib/games/instructions"
import { db, games, withDbRetry } from "@/lib/db"
import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"
import { tools, setGameChatContext } from "@/lib/games/tools"
import { reconcileTurnMessages, upsertMessage } from "@/lib/ai/messages"
import { getGameSkills } from "./game-skills"
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

/**
 * Prepares the model messages and response state for retrying a turn after a mid-stream failure.
 * Crucially guarantees that the conversation strictly terminates with a user or tool turn.
 * Google Gemini / Vertex AI strictly rejects requests ending with an assistant (model) turn:
 * "Requests ending with a model turn are not supported."
 */
async function prepareRetryContext(params: {
  sanitizedMessages: ModelMessage[]
  lastResponseMessage?: UIMessage
  tools?: ToolSet
}): Promise<{
  modelMessages: ModelMessage[]
  retryMessage?: UIMessage
}> {
  const { sanitizedMessages, lastResponseMessage, tools } = params

  if (
    !lastResponseMessage ||
    !Array.isArray(lastResponseMessage.parts) ||
    lastResponseMessage.parts.length === 0
  ) {
    return {
      modelMessages: sanitizedMessages,
      retryMessage: undefined,
    }
  }

  // Find the index of the last completed tool invocation (state === "output-available")
  let lastCompletedToolIdx = -1
  for (let i = lastResponseMessage.parts.length - 1; i >= 0; i--) {
    const p = lastResponseMessage.parts[i]
    if (isToolUIPart(p) && p.state === "output-available") {
      lastCompletedToolIdx = i
      break
    }
  }

  // If no tools completed in this turn, discard the partial assistant message
  // and retry cleanly from the start of the turn (sanitizedMessages).
  if (lastCompletedToolIdx === -1) {
    return {
      modelMessages: sanitizedMessages,
      retryMessage: undefined,
    }
  }

  // Keep only the parts up to the last completed tool
  const trimmedMessage: UIMessage = {
    ...lastResponseMessage,
    parts: lastResponseMessage.parts.slice(0, lastCompletedToolIdx + 1),
  }

  const converted = await convertToModelMessages([trimmedMessage], {
    ignoreIncompleteToolCalls: true,
    ...(tools ? { tools } : {}),
  })

  // Strip any trailing assistant messages so the request strictly ends with role: "tool"
  while (
    converted.length > 0 &&
    converted[converted.length - 1].role === "assistant"
  ) {
    converted.pop()
  }

  return {
    modelMessages: [...sanitizedMessages, ...converted],
    retryMessage: trimmedMessage,
  }
}

export const gameChat = chat.agent({
  id: "game-chat",
  tools,

  compaction: {
    shouldCompact: ({ totalTokens }) => (totalTokens ?? 0) > 60_000,
    summarize: async ({ chatId }) => {
      try {
        if (!chatId) {
          return "Game development turn completed. Code state persisted in sandbox."
        }
        const sandbox = await getGameSandbox(chatId)
        const gitStatus = await sandbox.git.status(GAME_DIR)
        const modifiedFiles = gitStatus.fileStatus?.map((f) => f.name) ?? []

        let activePlanSummary = ""
        try {
          const planBuf = await sandbox.fs.downloadFile(
            `${GAME_DIR}/artifacts/game-plan.md`
          )
          const planText = planBuf.toString("utf-8")
          if (planText) {
            activePlanSummary = `\n- Active Plan: ${planText.slice(0, 500)}...`
          }
        } catch {
          // Plan file might not exist yet in turn 1
        }

        return [
          "### Verified Turn Summary (Grounded via Daytona Git & FS)",
          modifiedFiles.length > 0
            ? `- Files Modified/Created: ${modifiedFiles.join(", ")}`
            : "- Files on disk verified and unchanged.",
          "- Working directory: /home/daytona/game",
          activePlanSummary,
        ]
          .filter(Boolean)
          .join("\n")
      } catch {
        return "Game development turn completed. Code state persisted in Daytona sandbox."
      }
    },
  },

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
  onTurnStart: async ({ chatId, uiMessages, clientData }) => {
    locals.set(streamErrorKey, undefined)
    locals.set(rawStreamErrorKey, undefined)
    locals.set(resolvedErrorKey, undefined)
    setGameChatContext(chatId)

    const resolvedSkills = await getGameSkills()
    chat.skills.set(resolvedSkills)

    const orgId = clientData?.orgId || locals.get(orgIdKey)
    if (orgId) {
      locals.set(orgIdKey, orgId)
    }

    // Persist full accumulated history (including user message or answered tool output)
    // before the model runs, guaranteeing that a mid-stream refresh reads the updated state.
    await withDbRetry(
      () =>
        db
          .update(games)
          .set({ messages: uiMessages, updatedAt: new Date() })
          .where(eq(games.id, chatId)),
      "onTurnStart:update"
    )

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

    // Checkpoint turn changes in Git so status reflects only current-turn modifications
    try {
      const sandbox = await getGameSandbox(chatId)
      const status = await sandbox.git.status(GAME_DIR)
      const hasChanges = Boolean(
        status.fileStatus && status.fileStatus.length > 0
      )
      if (hasChanges) {
        await sandbox.git.add(GAME_DIR, ["."])
        const commitRes = await sandbox.git.commit(
          GAME_DIR,
          `Turn checkpoint: ${finishReason || "completed"}`,
          "Gamebox",
          "bot@gamebox.dev",
          false
        )
        logger.info(
          `Git checkpoint committed for game ${chatId}: ${commitRes.sha}`
        )
      }
    } catch (gitErr) {
      logger.warn(`Turn git checkpoint skipped or failed for game ${chatId}`, {
        error: gitErr instanceof Error ? gitErr.message : String(gitErr),
      })
    }

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

  run: async ({ messages, tools, signal, clientData, chatId, streamText }) => {
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

    const activeSkills = chat.skills()
    logger.info(
      `==================== [TRIGGER.DEV SKILLS ACTIVE] (Chat: ${chatId}) ====================`,
      {
        skillCount: activeSkills?.length ?? 0,
        skills: activeSkills?.map((s) => ({
          id: s.id,
          name: s.frontmatter.name,
          description: s.frontmatter.description,
        })),
      }
    )

    const MAX_TURN_RETRIES = 3
    let currentModelMessages = sanitizedMessages
    let lastError: unknown
    let lastResponseMessage: UIMessage | undefined

    for (let attempt = 0; attempt < MAX_TURN_RETRIES; attempt++) {
      if (signal?.aborted) {
        break
      }

      try {
        const result = streamText({
          model: selectedModel,
          tools,
          instructions,
          messages: currentModelMessages,
          abortSignal: signal,

          onLanguageModelCallStart: (event) => {
            const rawInstructions = event.instructions
            const systemPromptText =
              typeof rawInstructions === "string"
                ? rawInstructions
                : Array.isArray(rawInstructions)
                  ? rawInstructions
                      .map((m) =>
                        typeof m === "object" && m && "content" in m
                          ? String(m.content)
                          : JSON.stringify(m)
                      )
                      .join("\n\n---\n\n")
                  : typeof rawInstructions === "object" &&
                      rawInstructions &&
                      "content" in rawInstructions
                    ? String((rawInstructions as { content: unknown }).content)
                    : JSON.stringify(rawInstructions)

            const toolNames = event.tools
              ? event.tools
                  .map((t) => (t as { name?: string }).name)
                  .filter(Boolean)
              : []

            logger.info(
              `==================== [LLM CALL: ACTUAL RUNTIME PROMPT & TOOLS] (Chat: ${chatId} | Attempt: ${attempt + 1}) ====================`,
              {
                attempt: attempt + 1,
                provider: event.provider,
                modelId: event.modelId,
                callId: event.callId,
                systemPrompt: systemPromptText,
                rawInstructions,
                toolNames,
                toolsCount: toolNames.length,
                messagesCount: event.messages?.length ?? 0,
              }
            )
          },

          stopWhen: stepCountIs(100),
          maxRetries: 4,

          prepareStep: async ({ messages: stepMessages, steps }) =>
            prepareStepContext({ messages: stepMessages, steps, chatId }),

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

        const pipeResult = await chat.pipeAndCapture(result, {
          signal,
          originalMessages: lastResponseMessage
            ? upsertMessage(chat.history.all(), lastResponseMessage)
            : chat.history.all(),
        })

        if (pipeResult.message) {
          lastResponseMessage = pipeResult.message
        }

        // Check if user manually stopped or aborted the turn
        if (
          signal?.aborted ||
          chat.isStopped() ||
          pipeResult.status === "aborted"
        ) {
          if (lastResponseMessage) {
            chat.history.set(
              upsertMessage(chat.history.all(), lastResponseMessage)
            )
          }
          return
        }

        // Detect whether the turn encountered an error (even if pipeResult.status was "complete"
        // because toUIMessageStream absorbed the error via uiMessageStreamOptions.onError)
        const streamError = locals.get(streamErrorKey)
        const rawStreamError = locals.get(rawStreamErrorKey)
        const storedResolvedError = locals.get(resolvedErrorKey)

        const isErrorFinish =
          pipeResult.status === "error" ||
          pipeResult.finishReason === "error" ||
          pipeResult.finishReason === "other" ||
          Boolean(pipeResult.error) ||
          Boolean(streamError) ||
          Boolean(storedResolvedError)

        if (!isErrorFinish && pipeResult.status === "complete") {
          // True successful completion!
          if (lastResponseMessage) {
            chat.history.set(
              upsertMessage(chat.history.all(), lastResponseMessage)
            )
          }
          return
        }

        // An error occurred during streaming (e.g. Vertex AI mid-stream quota cut)
        lastError =
          pipeResult.error ||
          rawStreamError ||
          streamError ||
          (pipeResult.finishReason
            ? new Error(
                `Stream terminated prematurely with finishReason: ${pipeResult.finishReason}`
              )
            : new Error("Stream interrupted"))

        const isQuotaOrInterrupted =
          isRetryableQuotaError(lastError, pipeResult.finishReason) ||
          storedResolvedError?.category === "rate_limit"

        if (!isQuotaOrInterrupted || attempt >= MAX_TURN_RETRIES - 1) {
          if (lastResponseMessage) {
            const cleaned = chat.cleanupAbortedParts(lastResponseMessage)
            chat.history.set(upsertMessage(chat.history.all(), cleaned))
          }
          if (lastError) throw lastError
          return
        }

        // Clear error locals so the retry attempt starts with a clean slate
        locals.set(streamErrorKey, undefined)
        locals.set(rawStreamErrorKey, undefined)
        locals.set(resolvedErrorKey, undefined)

        // Mid-stream quota exhaustion or stream interruption encountered!
        const waitSec = 20 + attempt * 5
        logger.warn(
          `Vertex AI mid-stream rate-limit/interruption encountered (attempt ${attempt + 1}/${MAX_TURN_RETRIES}). Pausing ${waitSec}s to replenish quota before automatically continuing...`,
          {
            chatId,
            attempt: attempt + 1,
            finishReason: pipeResult.finishReason,
            error:
              lastError instanceof Error
                ? lastError.message
                : String(lastError),
          }
        )

        // Show user-friendly status in UI without exposing quota/rate-limit internals
        chat.response.write({
          type: "data-step-status",
          id: "step-status",
          data: {
            text: "Preparing next step...",
          },
          transient: true,
        })

        await new Promise((r) => setTimeout(r, waitSec * 1000))

        const { modelMessages, retryMessage } = await prepareRetryContext({
          sanitizedMessages,
          lastResponseMessage,
          tools,
        })
        lastResponseMessage = retryMessage
        currentModelMessages = modelMessages
      } catch (err) {
        lastError = err
        if (signal?.aborted) break
        const isQuotaOrInterrupted = isRetryableQuotaError(err)
        if (!isQuotaOrInterrupted || attempt >= MAX_TURN_RETRIES - 1) {
          throw err
        }

        // Clear error locals on retry
        locals.set(streamErrorKey, undefined)
        locals.set(rawStreamErrorKey, undefined)
        locals.set(resolvedErrorKey, undefined)

        const waitSec = 20 + attempt * 5
        logger.warn(
          `Vertex AI call threw retryable error (attempt ${attempt + 1}/${MAX_TURN_RETRIES}). Waiting ${waitSec}s...`,
          { error: err instanceof Error ? err.message : String(err) }
        )

        chat.response.write({
          type: "data-step-status",
          id: "step-status",
          data: {
            text: "Preparing next step...",
          },
          transient: true,
        })

        await new Promise((r) => setTimeout(r, waitSec * 1000))

        const { modelMessages, retryMessage } = await prepareRetryContext({
          sanitizedMessages,
          lastResponseMessage,
          tools,
        })
        lastResponseMessage = retryMessage
        currentModelMessages = modelMessages
      }
    }

    if (lastError) {
      throw lastError
    }
  },
})

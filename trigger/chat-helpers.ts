import { locals, logger } from "@trigger.dev/sdk"
import { chat } from "@trigger.dev/sdk/ai"
import type { FinishReason, ModelMessage, StepResult } from "ai"
import { eq } from "drizzle-orm"
import * as Sentry from "@sentry/node"

import { db, games, withDbRetry } from "@/lib/db"
import { chargeStep, getFormattedOrgBalance } from "@/lib/credits/ledger"
import { calculateStepAmount } from "@/lib/credits/pricing"
import { sanitizeStep } from "@/lib/ai/sanitizer"
import { generateGameTitle } from "@/lib/games/title"
import type { ResolvedError } from "@/lib/ai/errors"

/**
 * Generates a game title asynchronously, persists it to the database,
 * and streams the updated title to the client without blocking the chat turn.
 */
export async function generateAndPersistGameTitle(
  chatId: string,
  promptText: string
): Promise<void> {
  try {
    const generatedTitle = await generateGameTitle(promptText)
    if (!generatedTitle) return

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
  } catch (err) {
    Sentry.logger.error(
      "Failed to generate or save game title in chat session",
      {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      }
    )
  }
}

/**
 * Captures diagnostic telemetry in Sentry and Trigger logger when a turn fails.
 */
export function logTurnFailure(params: {
  chatId: string
  error: unknown
  finishReason?: FinishReason
  resolved: ResolvedError
  clientData?: { model?: string; provider?: string; orgId?: string }
}): void {
  const { chatId, error, finishReason, resolved, clientData } = params

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

export interface TurnTokenMetrics {
  cumulativeInputTokens: number
  cumulativeOutputTokens: number
  cumulativeTotalTokens: number
  stepCount: number
}

/**
 * Run-scoped token metrics key using Trigger.dev locals.
 * Scoped strictly to the active run and automatically garbage-collected upon turn completion.
 */
export const turnTokensKey = locals.create<TurnTokenMetrics>(
  "game-chat.turnTokens"
)

const WRITE_TOOLS = new Set([
  "write_file",
  "update_file",
  "replace_text",
  "delete_file",
  "execute_command",
  "bash",
])

/**
 * Sanitizes and logs the message context window for each execution step,
 * pacing consecutive multi-step calls adaptively based on AI SDK StepResult.
 */
export async function prepareStepContext(params: {
  messages: ModelMessage[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: StepResult<any>[]
  chatId?: string
}): Promise<{ messages: ModelMessage[] }> {
  const { messages: stepMessages, steps, chatId } = params
  const stepNumber = steps.length + 1

  const sanitized = sanitizeStep(stepMessages, { windowSteps: 25 })

  let totalChars = 0
  for (const m of sanitized) {
    totalChars +=
      typeof m.content === "string"
        ? m.content.length
        : JSON.stringify(m.content).length
  }
  const estimatedInputTokens = Math.round(totalChars / 4)

  // Adaptive pacing between consecutive multi-step tool calls:
  // Scales with payload size to prevent exhausting Vertex AI rolling 60s TPM quota:
  // - Base: 1500ms after writes, 800ms after reads
  // - Heavy payloads (>20k tokens): 2000ms; (>35k tokens): 3000ms to allow quota window to drain
  let pacingMs = 0
  if (steps.length > 0) {
    const lastStep = steps[steps.length - 1]
    const isWrite =
      lastStep?.toolCalls?.some((tc) => WRITE_TOOLS.has(tc.toolName)) ?? false
    pacingMs = isWrite ? 1500 : 800

    if (estimatedInputTokens > 35000) {
      pacingMs = Math.max(pacingMs, 3000)
    } else if (estimatedInputTokens > 20000) {
      pacingMs = Math.max(pacingMs, 2000)
    }

    await new Promise((resolve) => setTimeout(resolve, pacingMs))
  }

  logger.info(
    `-------------------- [STEP ${stepNumber}: PRE-CALL CONTEXT & TOKEN ESTIMATE] (Chat: ${chatId || "unknown"}) --------------------`,
    {
      stepNumber,
      pacingMs,
      totalMessages: sanitized.length,
      rawStepMessagesCount: stepMessages.length,
      payloadChars: totalChars,
      estimatedInputTokens,
      chatId,
    }
  )

  return {
    messages: sanitized,
  }
}

/**
 * Calculates step token cost, records it in the credit ledger, tracks cumulative tokens
 * via Trigger.dev run-scoped locals, and emits real-time credit updates to the client.
 */
export async function chargeStepCredits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  step: StepResult<any>,
  params: {
    orgId: string
    chatId: string
    modelId: string
  }
): Promise<void> {
  const { orgId, chatId, modelId } = params
  const stepResponseId = step.response?.id
  if (!stepResponseId) {
    logger.warn("Step has no response id, skipping credit charge", {
      stepNumber: step.stepNumber,
    })
    return
  }

  const { usage } = step
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? 0
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0

  // Track cumulative token totals for the turn using Trigger.dev run-scoped locals
  let turnTotals = locals.get(turnTokensKey)
  if (!turnTotals || step.stepNumber === 0) {
    turnTotals = {
      cumulativeInputTokens: 0,
      cumulativeOutputTokens: 0,
      cumulativeTotalTokens: 0,
      stepCount: 0,
    }
  }

  turnTotals = {
    cumulativeInputTokens: turnTotals.cumulativeInputTokens + inputTokens,
    cumulativeOutputTokens: turnTotals.cumulativeOutputTokens + outputTokens,
    cumulativeTotalTokens: turnTotals.cumulativeTotalTokens + totalTokens,
    stepCount: step.stepNumber + 1,
  }
  locals.set(turnTokensKey, turnTotals)

  const stepAmount = calculateStepAmount(step, modelId)

  logger.info(
    `==================== [STEP ${step.stepNumber + 1} TOKEN METRICS] (Chat: ${chatId}) ====================`,
    {
      step: step.stepNumber + 1,
      modelId,
      stepInputTokens: inputTokens,
      stepOutputTokens: outputTokens,
      stepReasoningTokens: reasoningTokens,
      stepCacheReadTokens: cacheReadTokens,
      stepCacheWriteTokens: cacheWriteTokens,
      stepTotalTokens: totalTokens,
      cumulativeTurnTokens: turnTotals.cumulativeTotalTokens,
      cumulativeInputTokens: turnTotals.cumulativeInputTokens,
      cumulativeOutputTokens: turnTotals.cumulativeOutputTokens,
      costNanoDollars: stepAmount.toString(),
      stepResponseId,
    }
  )

  if (stepAmount <= BigInt(0)) {
    return
  }

  try {
    await withDbRetry(
      () =>
        chargeStep({
          orgId,
          stepResponseId,
          amount: stepAmount,
        }),
      "onStepFinish:chargeStep"
    )

    const formattedBalance = await getFormattedOrgBalance(orgId)

    chat.response.write({
      type: "data-credits",
      id: "credits-update",
      data: {
        credits: formattedBalance,
        stepResponseId,
        amount: stepAmount.toString(),
        tokens: {
          step: step.stepNumber + 1,
          inputTokens,
          outputTokens,
          reasoningTokens,
          totalTokens,
          cumulativeTokens: turnTotals.cumulativeTotalTokens,
        },
      },
      transient: true,
    })
  } catch (chargeErr) {
    Sentry.logger.error("Failed to charge step in game chat", {
      chatId,
      orgId,
      stepResponseId,
      error: chargeErr instanceof Error ? chargeErr.message : String(chargeErr),
    })
    logger.error("Failed to charge step in game chat", {
      error: chargeErr,
    })
  }
}

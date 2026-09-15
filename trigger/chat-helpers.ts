import { logger } from "@trigger.dev/sdk"
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

/**
 * Sanitizes and logs the message context window for each execution step.
 */
export function prepareStepContext(
  stepMessages: ModelMessage[],
  stepNumber: number
): { messages: ModelMessage[] } {
  const sanitized = sanitizeStep(stepMessages, { windowSteps: 25 })

  logger.info(
    `-------------------- [STEP ${stepNumber}: LLM PAYLOAD] (Turn Step: ${stepNumber}) --------------------`,
    {
      stepNumber,
      totalMessages: sanitized.length,
      rawStepMessagesCount: stepMessages.length,
      messages: sanitized,
    }
  )

  return {
    messages: sanitized,
  }
}

/**
 * Calculates step token cost, records it in the credit ledger, and emits
 * real-time credit updates to the connected client.
 */
export async function chargeStepCredits(
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

  const stepAmount = calculateStepAmount(step, modelId)
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
      },
      transient: true,
    })

    logger.info(
      `Charged step ${step.stepNumber + 1} (${stepResponseId}): cost = ${stepAmount.toString()} nano-dollars, new balance = ${formattedBalance}`
    )
  } catch (chargeErr) {
    Sentry.logger.error("Failed to charge step in game chat", {
      chatId,
      orgId,
      stepResponseId,
      error:
        chargeErr instanceof Error ? chargeErr.message : String(chargeErr),
    })
    logger.error("Failed to charge step in game chat", {
      error: chargeErr,
    })
  }
}

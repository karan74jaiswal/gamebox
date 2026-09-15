import {
  isToolUIPart,
  isTextUIPart,
  isReasoningUIPart,
  getToolName,
  type UIMessage,
} from "ai"
import type { ResolvedError } from "@/lib/ai/errors"
import type { MessageErrorMetadata } from "@/lib/db"

/**
 * Normalizes in-flight message parts during interrupted turns (cancelled or errored).
 * Ensures unfinished tools, reasoning blocks, and text streams transition to complete/closed states.
 */
export function finalizeMessageParts(
  parts?: UIMessage["parts"],
  fallbackError = "Tool execution was interrupted.",
  rawError?: string
): UIMessage["parts"] {
  if (!Array.isArray(parts) || parts.length === 0) return []

  return parts.map((part) => {
    // Finalize in-flight / unfinished tool calls
    if (isToolUIPart(part)) {
      // Interactive ask_player tool: preserve if answered or waiting for player input
      if (getToolName(part) === "ask_player") {
        if (
          part.state === "output-available" ||
          part.state === "input-available"
        ) {
          return part
        }
      }

      if (
        part.state === "input-streaming" ||
        part.state === "input-available"
      ) {
        return {
          ...part,
          state: "output-error",
          input: part.input ?? {},
          errorText: fallbackError,
          ...(rawError ? { rawError } : {}),
        }
      }
      return part
    }

    // Finalize streaming reasoning blocks
    if (isReasoningUIPart(part) && part.state === "streaming") {
      return {
        ...part,
        state: "done",
      }
    }

    // Finalize streaming text parts
    if (isTextUIPart(part) && part.state === "streaming") {
      return {
        ...part,
        state: "done",
      }
    }

    return part
  })
}

/**
 * Maps a resolved turn error into structured, type-safe MessageErrorMetadata.
 */
export function buildErrorMetadata(
  resolved: ResolvedError
): MessageErrorMetadata {
  return {
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
}

/**
 * Reconciles the in-memory UI messages at the end of a turn based on whether
 * the generation was cancelled/stopped or encountered an error.
 */
export function reconcileTurnMessages(params: {
  uiMessages: UIMessage[]
  wasStopped: boolean
  isFailedTurn: boolean
  resolvedError?: ResolvedError
}): UIMessage[] {
  const { uiMessages, wasStopped, isFailedTurn, resolvedError } = params
  const finalMessages = [...uiMessages]
  const lastIdx = finalMessages.length - 1
  const lastMsg = lastIdx >= 0 ? finalMessages[lastIdx] : undefined

  const hasContent =
    lastMsg && Array.isArray(lastMsg.parts)
      ? lastMsg.parts.some((p) => {
          if (isTextUIPart(p)) return p.text.trim().length > 0
          if (isReasoningUIPart(p)) return p.text.trim().length > 0
          return true
        })
      : false

  if (wasStopped) {
    // If user stopped/cancelled the turn:
    // If assistant message has no meaningful content, remove it so only the user message remains
    // If assistant message has partial content, preserve it cleanly
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
    if (!resolvedError) return finalMessages

    const errorMetadata = buildErrorMetadata(resolvedError)

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
            resolvedError.userMessage,
            resolvedError.rawMessage
          ),
        }
      }
    }
  }

  return finalMessages
}

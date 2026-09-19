"use client"

import * as React from "react"
import { isToolUIPart, type UIMessage } from "ai"

type UIMessagePart = NonNullable<UIMessage["parts"]>[number]

/**
 * Reconciles the parts of an assistant message between its baseline (from initialMessages/database)
 * and its streaming state (from useChat/reconnectToStream).
 *
 * Why this is needed:
 * In @ai-sdk/react, when reconnecting to an active stream (trigger === 'resume-stream'),
 * createStreamingUIMessageState sets lastMessage to undefined, initializing an empty parts buffer ([]).
 * When incoming chunks for the active assistant message arrive, AI SDK replaces the existing
 * assistant message with the streaming buffer. In multi-step or human-in-the-loop (HITL) flows,
 * this wipes out earlier completed steps (like answered `ask_player` tool calls) from the UI
 * until the turn completes and a full page reload occurs.
 *
 * This function preserves all earlier parts from the baseline message that are not present
 * in the active streaming message, ensuring answered questions and prior steps remain visible.
 */
export function reconcileAssistantParts(
  initialParts: UIMessagePart[] | undefined,
  streamParts: UIMessagePart[] | undefined
): UIMessagePart[] {
  if (!initialParts || initialParts.length === 0) {
    return streamParts ? [...streamParts] : []
  }
  if (!streamParts || streamParts.length === 0) {
    return [...initialParts]
  }

  // Collect all toolCallIds currently present in streamParts
  const streamToolCallIds = new Set<string>()
  for (const part of streamParts) {
    if (isToolUIPart(part) && part.toolCallId) {
      streamToolCallIds.add(part.toolCallId)
    }
  }

  // Collect all data part IDs present in streamParts
  const streamDataPartIds = new Set<string>()
  for (const part of streamParts) {
    if (
      part.type.startsWith("data-") &&
      "id" in part &&
      typeof (part as { id?: unknown }).id === "string"
    ) {
      streamDataPartIds.add((part as { id: string }).id)
    }
  }

  // Find parts from initialParts that were completed in earlier steps and are missing from streamParts
  const missingPriorParts: UIMessagePart[] = []
  for (const part of initialParts) {
    if (isToolUIPart(part) && part.toolCallId) {
      if (!streamToolCallIds.has(part.toolCallId)) {
        missingPriorParts.push(part)
      }
    } else if (
      part.type.startsWith("data-") &&
      "id" in part &&
      typeof (part as { id?: unknown }).id === "string"
    ) {
      if (!streamDataPartIds.has((part as { id: string }).id)) {
        missingPriorParts.push(part)
      }
    } else if (part.type === "text") {
      const textVal = (part as { text?: string }).text ?? ""
      const hasMatchingText = streamParts.some(
        (sp) => sp.type === "text" && (sp as { text?: string }).text === textVal
      )
      // Only keep prior text part if it's not already in streamParts and there are other
      // new streaming parts indicating the stream moved on to later steps
      if (
        !hasMatchingText &&
        (streamToolCallIds.size > 0 || streamParts.length > 0)
      ) {
        missingPriorParts.push(part)
      }
    } else if (part.type === "reasoning") {
      const reasoningVal =
        (part as { reasoning?: string }).reasoning ??
        (part as { text?: string }).text ??
        ""
      const hasMatchingReasoning = streamParts.some((sp) => {
        if (sp.type !== "reasoning") return false
        const r =
          (sp as { reasoning?: string }).reasoning ??
          (sp as { text?: string }).text ??
          ""
        return r === reasoningVal
      })
      if (
        !hasMatchingReasoning &&
        (streamToolCallIds.size > 0 || streamParts.length > 0)
      ) {
        missingPriorParts.push(part)
      }
    }
  }

  if (missingPriorParts.length === 0) {
    return streamParts
  }

  return [...missingPriorParts, ...streamParts]
}

/**
 * Reconciles the full message array from useChat against initialMessages.
 */
export function reconcileMessages(
  liveMessages: UIMessage[],
  initialMessages?: UIMessage[]
): UIMessage[] {
  if (!initialMessages || initialMessages.length === 0) {
    return liveMessages
  }

  const initialMessagesMap = new Map<string, UIMessage>()
  for (const msg of initialMessages) {
    if (msg.id) {
      initialMessagesMap.set(msg.id, msg)
    }
  }

  let hasChanges = false
  const reconciled = liveMessages.map((msg) => {
    if (msg.role !== "assistant") {
      return msg
    }

    const initialMatch = initialMessagesMap.get(msg.id)
    if (!initialMatch || initialMatch.role !== "assistant") {
      return msg
    }

    const mergedParts = reconcileAssistantParts(initialMatch.parts, msg.parts)
    if (mergedParts === msg.parts) {
      return msg
    }

    hasChanges = true
    return {
      ...msg,
      parts: mergedParts,
    }
  })

  return hasChanges ? reconciled : liveMessages
}

/**
 * React hook that memoizes the reconciled messages between useChat's live state
 * and initialMessages loaded from the database.
 */
export function useReconciledMessages(
  liveMessages: UIMessage[],
  initialMessages?: UIMessage[]
): UIMessage[] {
  return React.useMemo(() => {
    return reconcileMessages(liveMessages, initialMessages)
  }, [liveMessages, initialMessages])
}

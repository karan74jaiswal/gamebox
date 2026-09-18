"use client"

import * as React from "react"
import { isToolUIPart, getToolName, type UIMessage } from "ai"
import { getToolStatus } from "@/components/tool-call"

export interface UseCodeWatcherOptions {
  id?: string
  messages: UIMessage[]
}

const CODE_MODIFYING_TOOLS = new Set([
  "write_file",
  "update_file",
  "replace_text",
  "delete_file",
])

export function useCodeWatcher({ id, messages }: UseCodeWatcherOptions) {
  const refreshedToolCallsRef = React.useRef<Set<string>>(new Set())
  const refreshDebounceTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  // Reset tracked completed tools if the game ID changes
  React.useEffect(() => {
    refreshedToolCallsRef.current.clear()
    if (refreshDebounceTimerRef.current) {
      clearTimeout(refreshDebounceTimerRef.current)
      refreshDebounceTimerRef.current = null
    }
  }, [id])

  // Detect completed file-modifying tools and dispatch game-code-updated
  React.useEffect(() => {
    let hasNewCodeChanges = false

    for (const message of messages) {
      if (message.role !== "assistant" || !Array.isArray(message.parts)) {
        continue
      }

      for (const part of message.parts) {
        if (isToolUIPart(part)) {
          const name = getToolName(part)
          if (CODE_MODIFYING_TOOLS.has(name)) {
            const toolCallId = part.toolCallId
            const toolStatus = getToolStatus(part)

            if (
              toolCallId &&
              toolStatus === "done" &&
              !refreshedToolCallsRef.current.has(toolCallId)
            ) {
              refreshedToolCallsRef.current.add(toolCallId)
              hasNewCodeChanges = true
            }
          }
        }
      }
    }

    if (hasNewCodeChanges) {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current)
      }
      refreshDebounceTimerRef.current = setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("game-code-updated", {
            detail: { id },
          })
        )
      }, 500)
    }
  }, [messages, id])

  const flushCodeUpdate = React.useCallback(() => {
    if (refreshDebounceTimerRef.current) {
      clearTimeout(refreshDebounceTimerRef.current)
      refreshDebounceTimerRef.current = null
      window.dispatchEvent(
        new CustomEvent("game-code-updated", {
          detail: { id },
        })
      )
    }
  }, [id])

  React.useEffect(() => {
    return () => {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current)
      }
    }
  }, [])

  return {
    flushCodeUpdate,
  }
}

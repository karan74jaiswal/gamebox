"use client"

import type { UIMessage } from "ai"

export interface HandleChatDataPartOptions {
  dataPart: unknown
  id?: string
  onSandboxReady?: (sandboxId: string) => void
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>
}

export function handleChatDataPart({
  dataPart,
  id,
  onSandboxReady,
  setMessages,
}: HandleChatDataPartOptions) {
  const part = dataPart as { type?: string; data?: unknown }
  if (!part || typeof part !== "object") return

  if (
    part.type === "data-credits" &&
    typeof part.data === "object" &&
    part.data !== null
  ) {
    const payload = part.data as { credits?: string }
    if (payload.credits) {
      window.dispatchEvent(
        new CustomEvent("credits-updated", {
          detail: { credits: payload.credits },
        })
      )
    }
  }

  if (
    part.type === "data-game-title" &&
    typeof part.data === "object" &&
    part.data !== null
  ) {
    const payload = part.data as { id?: string; title?: string }
    if (payload.title) {
      window.dispatchEvent(
        new CustomEvent("game-title-updated", {
          detail: { id: payload.id || id, title: payload.title },
        })
      )
    }
  }

  if (
    part.type === "data-game-sandbox" &&
    typeof part.data === "object" &&
    part.data !== null
  ) {
    const payload = part.data as { id?: string; sandboxId?: string }
    if (payload.sandboxId) {
      onSandboxReady?.(payload.sandboxId)
      window.dispatchEvent(
        new CustomEvent("game-sandbox-updated", {
          detail: { id: payload.id || id, sandboxId: payload.sandboxId },
        })
      )
    }
  }

  if (
    part.type === "data-turn-error" &&
    typeof part.data === "object" &&
    part.data !== null
  ) {
    const payload = part.data as { errorText?: string }
    if (payload.errorText) {
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const lastIdx = prev.length - 1
        const lastMsg = prev[lastIdx]
        if (lastMsg.role !== "assistant") return prev
        return [
          ...prev.slice(0, lastIdx),
          {
            ...lastMsg,
            metadata: {
              ...(lastMsg.metadata as object),
              isError: true,
              errorText: payload.errorText,
            },
          },
        ]
      })
    }
  }
}

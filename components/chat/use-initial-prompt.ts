"use client"

import * as React from "react"
import type { UIMessage } from "ai"

export interface UseInitialPromptOptions {
  id?: string
  orgId?: string
  initialPrompt?: string
  initialIsOutOfCredits?: boolean
  selectedModel: string
  messagesLength: number
  sendMessage: (
    message: { text: string },
    options?: {
      metadata?: Record<string, unknown>
      body?: Record<string, unknown>
    }
  ) => void
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>
  setIsOutOfCredits: React.Dispatch<React.SetStateAction<boolean>>
}

export function useInitialPrompt({
  id,
  orgId,
  initialPrompt,
  initialIsOutOfCredits,
  selectedModel,
  messagesLength,
  sendMessage,
  setMessages,
  setIsOutOfCredits,
}: UseInitialPromptOptions) {
  const [isInitialPromptStopped, setIsInitialPromptStopped] =
    React.useState(false)

  const selectedModelRef = React.useRef(selectedModel)
  React.useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])

  const hasSentInitialPrompt = React.useRef(false)

  const isSubmittingInitialPrompt = Boolean(
    initialPrompt && messagesLength === 0 && !isInitialPromptStopped
  )

  React.useEffect(() => {
    if (
      initialPrompt &&
      !hasSentInitialPrompt.current &&
      messagesLength === 0
    ) {
      if (!orgId) {
        return
      }

      hasSentInitialPrompt.current = true

      // Clean up search params from the browser URL so refreshes don't re-trigger
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        url.searchParams.delete("prompt")
        url.searchParams.delete("model")
        window.history.replaceState(
          {},
          "",
          url.pathname + (url.search ? url.search : "")
        )
      }

      if (initialIsOutOfCredits) {
        setIsOutOfCredits(true)
        setMessages([
          {
            id: `prompt-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text: initialPrompt }],
          },
        ])
        return
      }

      const modelToUse = selectedModelRef.current

      sendMessage(
        { text: initialPrompt },
        {
          metadata: {
            model: modelToUse,
            orgId,
          },
          body: {
            id,
            model: modelToUse,
            orgId,
          },
        }
      )
    }
  }, [
    initialPrompt,
    id,
    orgId,
    initialIsOutOfCredits,
    messagesLength,
    sendMessage,
    setMessages,
    setIsOutOfCredits,
  ])

  return {
    isSubmittingInitialPrompt,
    isInitialPromptStopped,
    setIsInitialPromptStopped,
  }
}

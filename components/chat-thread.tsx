"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { useChat } from "@ai-sdk/react"
import {
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai"

import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"

import type { gameChat } from "@/trigger/chat"
import { mintChatAccessToken, startChatSession } from "@/app/actions"
import { saveGameMessages } from "@/lib/games/actions"
import { DEFAULT_MODEL_ID } from "@/lib/ai/models"
import {
  isAbortError,
  sanitizeErrorMessage,
  resolveError,
  OUT_OF_CREDITS_MESSAGE,
} from "@/lib/ai/errors"
import * as Sentry from "@sentry/nextjs"

import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import { ChatComposer } from "@/components/chat-composer"
import { getToolStatus } from "@/components/tool-call"
import { cn } from "@/lib/utils"

import {
  ChatMessageItem,
  hasVisibleAssistantContent,
} from "./chat-message-item"
import {
  ChatEmptyState,
  ChatPendingPrompt,
  ChatLoadingBubbles,
  ChatErrorMessage,
} from "./chat-thread-placeholders"

export {
  AskPlayerQuestionnaire,
  type AskPlayerInput,
  type AskPlayerOutput,
  type AskPlayerQuestionnaireProps,
  DIMENSION_CONFIG,
} from "./ask-player-questionnaire"
export {
  ChatMessageItem,
  type ChatMessageItemProps,
  hasVisibleAssistantContent,
} from "./chat-message-item"
export {
  ChatEmptyState,
  ChatPendingPrompt,
  ChatLoadingBubbles,
  ChatErrorMessage,
} from "./chat-thread-placeholders"

export interface ChatThreadProps {
  id?: string
  orgId?: string
  className?: string
  initialMessages?: UIMessage[]
  initialPrompt?: string
  initialModel?: string
  initialLastEventId?: string
  initialPublicAccessToken?: string
  initialIsOutOfCredits?: boolean
  onSandboxReady?: (sandboxId: string) => void
}

export function ChatThread({
  id,
  orgId,
  className,
  initialMessages,
  initialPrompt,
  initialModel,
  initialLastEventId,
  initialPublicAccessToken,
  initialIsOutOfCredits = false,
  onSandboxReady,
}: ChatThreadProps) {
  const router = useRouter()
  const [selectedModel, setSelectedModel] = React.useState<string>(
    initialModel || DEFAULT_MODEL_ID
  )
  const [isOutOfCredits, setIsOutOfCredits] = React.useState(
    Boolean(initialIsOutOfCredits)
  )

  React.useEffect(() => {
    if (initialIsOutOfCredits !== undefined) {
      setIsOutOfCredits(initialIsOutOfCredits)
    }
  }, [initialIsOutOfCredits])

  React.useEffect(() => {
    const handleCreditsUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ credits?: string }>).detail
      if (detail?.credits) {
        const numericValue = parseFloat(detail.credits.replace(/[^0-9.-]/g, ""))
        if (!isNaN(numericValue) && numericValue > 0) {
          setIsOutOfCredits(false)
        }
      }
    }
    window.addEventListener("credits-updated", handleCreditsUpdate)
    return () => {
      window.removeEventListener("credits-updated", handleCreditsUpdate)
    }
  }, [])

  const [isInitialPromptStopped, setIsInitialPromptStopped] =
    React.useState(false)

  const selectedModelRef = React.useRef(selectedModel)
  React.useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])

  const lastKnownEventIdRef = React.useRef<string | undefined>(
    initialLastEventId
  )

  const baseTransport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({
        chatId,
        clientData: {
          ...clientData,
          orgId,
        },
      }),
    clientData: {
      model: selectedModel,
      orgId,
    },
    sessions:
      id &&
      initialMessages &&
      initialMessages.length > 0 &&
      initialPublicAccessToken
        ? {
            [id]: {
              publicAccessToken: initialPublicAccessToken,
              lastEventId: initialLastEventId,
            },
          }
        : undefined,
    onSessionChange: (chatId, session) => {
      if (session) {
        if (session.lastEventId) {
          lastKnownEventIdRef.current = session.lastEventId
        } else if (lastKnownEventIdRef.current) {
          session.lastEventId = lastKnownEventIdRef.current
        }
      }
    },
  })

  // Patch reconnectToStream to safely handle React Strict Mode remounts in Next.js dev.
  // In dev mode, React unmounts and remounts components on load. Trigger's reconnectToStream
  // returns null if activeStreams.has(chatId). Because Mount 1's abort teardown is async,
  // Mount 2 sees activeStreams.has(chatId) === true and drops the stream.
  // Aborting and removing any stale controller allows Mount 2 to attach to the live SSE stream.
  const transport = React.useMemo(() => {
    const transportInstance = baseTransport as unknown as {
      __reconnectPatched?: boolean
      activeStreams?: Map<string, AbortController>
      reconnectToStream: typeof baseTransport.reconnectToStream
    }

    if (!transportInstance.__reconnectPatched) {
      transportInstance.__reconnectPatched = true
      const originalReconnect =
        baseTransport.reconnectToStream.bind(baseTransport)

      baseTransport.reconnectToStream = async (options) => {
        const existing = transportInstance.activeStreams?.get(options.chatId)
        if (existing) {
          existing.abort()
          transportInstance.activeStreams?.delete(options.chatId)
        }
        return originalReconnect(options)
      }
    }

    return baseTransport
  }, [baseTransport])

  const refreshedToolCallsRef = React.useRef<Set<string>>(new Set())
  const refreshDebounceTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  // Reset tracked completed tools if the game ID changes
  React.useEffect(() => {
    refreshedToolCallsRef.current.clear()
  }, [id])

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    clearError,
    setMessages,
    addToolOutput,
  } = useChat({
    id,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    resume: Boolean(initialMessages && initialMessages.length > 0),
    onError: (err) => {
      Sentry.logger.error("Client chat turn error", {
        chatId: id || "unknown",
        error: err.message,
      })

      const resolved = resolveError(err)
      if (
        resolved.category === "insufficient_credits" ||
        err.message?.includes("OUT_OF_CREDITS")
      ) {
        setIsOutOfCredits(true)
        clearError()
      }
    },
    onFinish: () => {
      Sentry.logger.info("Client chat turn finished", {
        chatId: id || "unknown",
      })
      // If a code refresh was debounced, flush it promptly on turn completion
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current)
        refreshDebounceTimerRef.current = null
        window.dispatchEvent(
          new CustomEvent("game-code-updated", {
            detail: { id },
          })
        )
      }
      router.refresh()
    },
    onData: (dataPart) => {
      const part = dataPart as { type?: string; data?: unknown }
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
    },
  })

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
          const isCodeModifying =
            name === "write_file" ||
            name === "update_file" ||
            name === "replace_text" ||
            name === "delete_file"

          if (isCodeModifying) {
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

  React.useEffect(() => {
    return () => {
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current)
      }
    }
  }, [])

  const isSubmittingInitialPrompt = Boolean(
    initialPrompt && messages.length === 0 && !isInitialPromptStopped
  )

  const handleStop = React.useCallback(() => {
    setIsInitialPromptStopped(true)
    if (id) {
      void transport.stopGeneration(id)
    }
    stop()
    clearError()
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last && last.role === "assistant") {
        const textParts =
          last.parts && Array.isArray(last.parts)
            ? last.parts.filter(
                (p): p is { type: "text"; text: string } =>
                  p.type === "text" &&
                  typeof (p as { text?: unknown }).text === "string"
              )
            : []
        const hasText = textParts.some((p) => p.text.trim().length > 0)
        const hasToolParts =
          last.parts &&
          Array.isArray(last.parts) &&
          last.parts.some((p) => isToolUIPart(p))
        if (!hasText && !hasToolParts) {
          return prev.slice(0, -1)
        }
      }
      return prev
    })
  }, [id, transport, stop, clearError, setMessages])

  const hasSentInitialPrompt = React.useRef(false)

  React.useEffect(() => {
    if (
      initialPrompt &&
      !hasSentInitialPrompt.current &&
      messages.length === 0
    ) {
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

      if (!orgId) {
        return
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
  }, [initialPrompt, id, messages.length, sendMessage])

  const isWaitingForPlayerAnswer = React.useMemo(() => {
    if (messages.length === 0 || error) return false
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role !== "assistant" || !lastMessage.parts) return false

    return lastMessage.parts.some((part) => {
      if (!isToolUIPart(part)) return false
      if (getToolName(part) !== "ask_player") return false

      const isAnswered =
        part.state === "output-available" ||
        part.state === "output-error" ||
        part.state === "output-denied" ||
        Boolean("output" in part && part.output)

      return !isAnswered
    })
  }, [messages, error])

  const handleSendMessage = (value: string, options?: { model?: string }) => {
    if (!orgId || isWaitingForPlayerAnswer || isOutOfCredits) {
      return
    }

    const modelToUse = options?.model || selectedModel
    if (options?.model && options.model !== selectedModel) {
      setSelectedModel(options.model)
    }

    if (error && !isAbortError(error) && messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      const errorText = sanitizeErrorMessage(error.message || error)
      if (lastMsg.role === "user") {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            metadata: {
              isError: true,
              errorText,
            },
            parts: [],
          },
        ])
      } else if (lastMsg.role === "assistant") {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            ...lastMsg,
            metadata: {
              ...(lastMsg.metadata as object),
              isError: true,
              errorText,
            },
            parts: lastMsg.parts || [],
          },
        ])
      }
    }

    if (id && lastKnownEventIdRef.current) {
      const currentSession = transport.getSession(id)
      if (currentSession && !currentSession.lastEventId) {
        transport.setSession(id, {
          ...currentSession,
          lastEventId: lastKnownEventIdRef.current,
        })
      }
    }

    clearError()
    sendMessage(
      { text: value },
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

  const handleAnswerPlayer = React.useCallback(
    (
      toolCallId: string,
      output: { id: string; label: string; description: string }
    ) => {
      const modelToUse = selectedModelRef.current
      addToolOutput({
        tool: "ask_player",
        toolCallId,
        output,
        options: {
          metadata: {
            model: modelToUse,
            orgId,
          },
          body: {
            id,
            model: modelToUse,
            orgId,
          },
        },
      })
    },
    [addToolOutput, id, orgId]
  )

  const isGenerating =
    status === "streaming" ||
    status === "submitted" ||
    isSubmittingInitialPrompt

  React.useEffect(() => {
    if (status === "ready" && !isGenerating) {
      const spacer = document.querySelector<HTMLElement>(
        "[data-message-scroller-spacer]"
      )
      if (spacer) {
        spacer.style.height = "0px"
        spacer.style.marginTop = ""
        spacer.hidden = true
      }
    }
  }, [status, isGenerating])

  return (
    <div className={cn("flex size-full min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider>
          <MessageScroller className="size-full">
            <MessageScrollerViewport>
              <MessageScrollerContent
                spacerClassName={
                  !isGenerating && status === "ready"
                    ? "!h-0 !hidden !m-0"
                    : undefined
                }
                className="mx-auto w-full max-w-3xl gap-6 px-4 py-6"
              >
                {messages.length === 0 &&
                  status === "ready" &&
                  !initialPrompt &&
                  !isSubmittingInitialPrompt && <ChatEmptyState />}

                {messages.length === 0 &&
                  isSubmittingInitialPrompt &&
                  initialPrompt && (
                    <ChatPendingPrompt initialPrompt={initialPrompt} />
                  )}

                {messages.map((message, index) => (
                  <ChatMessageItem
                    key={message.id}
                    message={message}
                    isLast={index === messages.length - 1}
                    isGenerating={isGenerating}
                    handleAnswerPlayer={handleAnswerPlayer}
                  />
                ))}

                {(() => {
                  const lastMessage = messages[messages.length - 1]
                  const isWaitingForFirstToken =
                    !error &&
                    !isOutOfCredits &&
                    (isSubmittingInitialPrompt ||
                      status === "submitted" ||
                      (status === "streaming" &&
                        (!lastMessage ||
                          lastMessage.role === "user" ||
                          !hasVisibleAssistantContent(lastMessage))))

                  return isWaitingForFirstToken ? <ChatLoadingBubbles /> : null
                })()}

                {error &&
                  !(
                    messages.length > 0 &&
                    messages[messages.length - 1]?.role === "assistant" &&
                    (
                      messages[messages.length - 1]?.metadata as {
                        isError?: boolean
                      }
                    )?.isError
                  ) && (
                    <ChatErrorMessage
                      error={error}
                      isGenerating={isGenerating}
                    />
                  )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <div className="mx-auto w-full max-w-3xl p-4">
        {isOutOfCredits && (
          <div className="mb-3 rounded-2xl border border-white/10 bg-zinc-900/90 p-4 shadow-lg backdrop-blur">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-white/80" />
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-semibold text-white">
                  Out of credits
                </h4>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Building a game spends credits, and this organization has none
                  left.{" "}
                  <Link
                    href="/billing"
                    className="font-medium text-zinc-200 underline underline-offset-4 hover:text-white"
                  >
                    Add more from the billing page
                  </Link>{" "}
                  to pick this game back up.
                </p>
              </div>
            </div>
          </div>
        )}

        <ChatComposer
          placeholder={
            !orgId
              ? "Select an organization to continue"
              : isOutOfCredits
                ? "Out of credits"
                : isWaitingForPlayerAnswer
                  ? "Please choose an option in the questionnaire above to continue..."
                  : "Ask a follow up or describe changes..."
          }
          disabled={!orgId || isWaitingForPlayerAnswer || isOutOfCredits}
          isOutOfCredits={isOutOfCredits}
          sendMessage={handleSendMessage}
          status={
            isSubmittingInitialPrompt && !isOutOfCredits ? "submitted" : status
          }
          onStop={handleStop}
          onCancel={handleStop}
          model={selectedModel}
          onModelChange={setSelectedModel}
        />
      </div>
    </div>
  )
}

export default ChatThread

"use client"

import * as React from "react"
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
import { DEFAULT_MODEL_ID } from "@/lib/ai/models"
import { isAbortError, sanitizeErrorMessage } from "@/lib/ai/errors"
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
  className?: string
  initialMessages?: UIMessage[]
  initialPrompt?: string
  initialModel?: string
  initialLastEventId?: string
  initialPublicAccessToken?: string
  onSandboxReady?: (sandboxId: string) => void
}

export function ChatThread({
  id,
  className,
  initialMessages,
  initialPrompt,
  initialModel,
  initialLastEventId,
  initialPublicAccessToken,
  onSandboxReady,
}: ChatThreadProps) {
  const [selectedModel, setSelectedModel] = React.useState<string>(
    initialModel || DEFAULT_MODEL_ID
  )

  const [isInitialPromptStopped, setIsInitialPromptStopped] =
    React.useState(false)

  const selectedModelRef = React.useRef(selectedModel)
  React.useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])

  const lastKnownEventIdRef = React.useRef<string | undefined>(
    initialLastEventId
  )

  const transport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    clientData: {
      model: selectedModel,
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
              isStreaming: false,
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
    },
    onData: (dataPart) => {
      const part = dataPart as { type?: string; data?: unknown }
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

      const modelToUse = selectedModelRef.current

      sendMessage(
        { text: initialPrompt },
        {
          metadata: {
            model: modelToUse,
          },
          body: {
            id,
            model: modelToUse,
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
    if (isWaitingForPlayerAnswer) {
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
        },
        body: {
          id,
          model: modelToUse,
        },
      }
    )
  }

  const handleAnswerPlayer = React.useCallback(
    (toolCallId: string, output: { id: string; label: string }) => {
      const modelToUse = selectedModelRef.current
      addToolOutput({
        tool: "ask_player",
        toolCallId,
        output,
        options: {
          metadata: {
            model: modelToUse,
          },
          body: {
            id,
            model: modelToUse,
          },
        },
      })
    },
    [addToolOutput, id]
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
                    (messages[messages.length - 1]?.metadata as { isError?: boolean })?.isError
                  ) && (
                    <ChatErrorMessage error={error} isGenerating={isGenerating} />
                  )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <div className="mx-auto w-full max-w-3xl p-4">
        <ChatComposer
          placeholder={
            isWaitingForPlayerAnswer
              ? "Please choose an option in the questionnaire above to continue..."
              : "Ask a follow up or describe changes..."
          }
          disabled={isWaitingForPlayerAnswer}
          sendMessage={handleSendMessage}
          status={isSubmittingInitialPrompt ? "submitted" : status}
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

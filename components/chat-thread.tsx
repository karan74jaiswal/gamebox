"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import {
  isToolUIPart,
  getToolName,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai"
import * as Sentry from "@sentry/nextjs"

import { DEFAULT_MODEL_ID } from "@/lib/ai/models"
import { isAbortError, sanitizeErrorMessage, resolveError } from "@/lib/ai/errors"
import { cn } from "@/lib/utils"

import { ChatComposer } from "@/components/chat-composer"
import {
  ChatCreditsBanner,
  ChatMessageList,
  handleChatDataPart,
  useChatCredits,
  useChatTransport,
  useCodeWatcher,
  useInitialPrompt,
} from "./chat"

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

  const selectedModelRef = React.useRef(selectedModel)
  React.useEffect(() => {
    selectedModelRef.current = selectedModel
  }, [selectedModel])

  const { isOutOfCredits, setIsOutOfCredits } = useChatCredits({
    initialIsOutOfCredits,
  })

  const {
    transport,
    syncSessionLastEventId,
    stopGeneration,
  } = useChatTransport({
    id,
    orgId,
    selectedModel,
    initialPublicAccessToken,
    initialLastEventId,
  })

  // Watch for completed code-modifying tools and debounce preview refresh
  // Reference will be populated once messages are defined below
  const flushCodeUpdateRef = React.useRef<() => void>(() => {})

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
      flushCodeUpdateRef.current()
      router.refresh()
    },
    onData: (dataPart) => {
      handleChatDataPart({
        dataPart,
        id,
        onSandboxReady,
        setMessages,
      })
    },
  })

  const { flushCodeUpdate } = useCodeWatcher({ id, messages })
  React.useEffect(() => {
    flushCodeUpdateRef.current = flushCodeUpdate
  }, [flushCodeUpdate])

  const {
    isSubmittingInitialPrompt,
    setIsInitialPromptStopped,
  } = useInitialPrompt({
    id,
    orgId,
    initialPrompt,
    initialIsOutOfCredits,
    selectedModel,
    messagesLength: messages.length,
    sendMessage,
    setMessages,
    setIsOutOfCredits,
  })

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

    syncSessionLastEventId(id)
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

  const handleStop = React.useCallback(() => {
    setIsInitialPromptStopped(true)
    stopGeneration(id)
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
  }, [id, stopGeneration, stop, clearError, setMessages, setIsInitialPromptStopped])

  const isGenerating =
    status === "streaming" ||
    status === "submitted" ||
    isSubmittingInitialPrompt

  return (
    <div className={cn("flex size-full min-h-0 flex-col", className)}>
      <ChatMessageList
        messages={messages}
        status={status}
        isGenerating={isGenerating}
        initialPrompt={initialPrompt}
        isSubmittingInitialPrompt={isSubmittingInitialPrompt}
        isOutOfCredits={isOutOfCredits}
        error={error}
        handleAnswerPlayer={handleAnswerPlayer}
      />

      <div className="mx-auto w-full max-w-3xl p-4">
        <ChatCreditsBanner isOutOfCredits={isOutOfCredits} />

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

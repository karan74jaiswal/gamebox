"use client"

import * as React from "react"
import type { UIMessage } from "ai"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import {
  ChatMessageItem,
  hasVisibleAssistantContent,
} from "@/components/chat-message-item"
import {
  ChatEmptyState,
  ChatPendingPrompt,
  ChatLoadingBubbles,
  ChatErrorMessage,
} from "@/components/chat-thread-placeholders"

export interface ChatMessageListProps {
  messages: UIMessage[]
  status: string
  isGenerating: boolean
  initialPrompt?: string
  isSubmittingInitialPrompt: boolean
  isOutOfCredits: boolean
  error?: Error | { message?: string }
  handleAnswerPlayer: (
    toolCallId: string,
    output: { id: string; label: string; description: string }
  ) => void
}

export function ChatMessageList({
  messages,
  status,
  isGenerating,
  initialPrompt,
  isSubmittingInitialPrompt,
  isOutOfCredits,
  error,
  handleAnswerPlayer,
}: ChatMessageListProps) {
  // Reset spacer element height when generation completes
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

  const shouldShowFloatingError =
    Boolean(error) &&
    !(
      messages.length > 0 &&
      lastMessage?.role === "assistant" &&
      (
        lastMessage?.metadata as {
          isError?: boolean
        }
      )?.isError
    )

  return (
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
                  key={`${message.id}-${index}`}
                  message={message}
                  isLast={index === messages.length - 1}
                  isGenerating={isGenerating}
                  handleAnswerPlayer={handleAnswerPlayer}
                />
              ))}

              {isWaitingForFirstToken && <ChatLoadingBubbles />}

              {shouldShowFloatingError && error && (
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
  )
}

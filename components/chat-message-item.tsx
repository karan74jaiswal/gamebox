"use client"

import * as React from "react"
import Image from "next/image"
import {
  isToolUIPart,
  isReasoningUIPart,
  getToolName,
  type UIMessage,
} from "ai"

import { AlertCircle, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Markdown } from "@/components/ui/markdown"
import { ToolCall, getToolStatus } from "@/components/tool-call"
import { Reasoning } from "@/components/reasoning"
import { AskPlayerQuestionnaire } from "@/components/ask-player-questionnaire"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"

export function hasVisibleAssistantContent(message?: UIMessage) {
  if (!message || message.role !== "assistant") return false

  const isErrorMessage = Boolean(
    (message.metadata as { isError?: boolean } | undefined)?.isError
  )
  if (isErrorMessage) return true

  const textParts =
    message.parts && Array.isArray(message.parts)
      ? message.parts.filter(
          (p): p is { type: "text"; text: string } =>
            p.type === "text" &&
            typeof (p as { text?: unknown }).text === "string"
        )
      : []
  const hasText = textParts.some((p) => p.text.trim().length > 0)

  const hasToolParts =
    message.parts &&
    Array.isArray(message.parts) &&
    message.parts.some((p) => isToolUIPart(p))

  const hasReasoningParts =
    message.parts &&
    Array.isArray(message.parts) &&
    message.parts.some(
      (p) =>
        isReasoningUIPart(p) &&
        (p.text.trim().length > 0 || p.state === "streaming")
    )

  return hasText || hasToolParts || hasReasoningParts
}

export interface ChatMessageItemProps {
  message: UIMessage
  isLast: boolean
  isGenerating: boolean
  handleAnswerPlayer: (
    toolCallId: string,
    output: { id: string; label: string }
  ) => void
}

export function ChatMessageItem({
  message,
  isLast,
  isGenerating,
  handleAnswerPlayer,
}: ChatMessageItemProps) {
  const isAssistant = message.role === "assistant"

  const isErrorMessage = Boolean(
    (message.metadata as { isError?: boolean } | undefined)?.isError
  )
  const errorText =
    (message.metadata as { errorText?: string } | undefined)?.errorText ||
    "The model failed to generate a response. Please try again or select a different model."

  const textParts =
    message.parts && Array.isArray(message.parts)
      ? message.parts.filter(
          (p): p is { type: "text"; text: string } =>
            p.type === "text" &&
            typeof (p as { text?: unknown }).text === "string"
        )
      : []

  const textContent = textParts.map((p) => p.text).join("")

  const hasParts =
    (message.parts && message.parts.length > 0) || Boolean(textContent.trim())

  const isLastPartStreaming = React.useMemo(() => {
    if (!isGenerating || !isLast || !message.parts || message.parts.length === 0) {
      return false
    }
    const lastPart = message.parts[message.parts.length - 1]
    if (isReasoningUIPart(lastPart)) {
      return (
        lastPart.state === "streaming" ||
        (lastPart as { state?: string }).state === undefined
      )
    }
    if (isToolUIPart(lastPart)) {
      const toolName = getToolName(lastPart)
      if (toolName === "ask_player") {
        return false
      }
      return getToolStatus(lastPart, true) === "active"
    }
    if (lastPart.type === "text") {
      return (lastPart as { state?: string }).state === "streaming"
    }
    return false
  }, [isGenerating, isLast, message.parts])

  if (isErrorMessage && !hasParts) {
    return (
      <MessageScrollerItem
        key={message.id}
        messageId={message.id}
        scrollAnchor={isLast && isGenerating}
      >
        <Message align="start">
          <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
            <Image
              src="/logo.svg"
              alt="Assistant"
              width={32}
              height={32}
              className="size-8"
            />
          </MessageAvatar>
          <MessageContent className="justify-center">
            <Bubble variant="destructive" align="start">
              <BubbleContent className="text-sm">{errorText}</BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      </MessageScrollerItem>
    )
  }

  // If this is an assistant message with no visible content yet, don't show empty bubble
  if (isAssistant && !hasVisibleAssistantContent(message)) {
    return null
  }

  return (
    <MessageScrollerItem
      key={message.id}
      messageId={message.id}
      scrollAnchor={isLast && isGenerating}
    >
      <Message align={isAssistant ? "start" : "end"}>
        {isAssistant && (
          <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
            <Image
              src="/logo.svg"
              alt="Assistant"
              width={32}
              height={32}
              className="size-8"
            />
          </MessageAvatar>
        )}
        <MessageContent className="justify-center">
          <Bubble
            variant={isAssistant ? "ghost" : "secondary"}
            align={isAssistant ? "start" : "end"}
            className={isAssistant ? "w-full max-w-full" : undefined}
          >
            <BubbleContent
              className={cn(
                "text-sm leading-relaxed",
                isAssistant && "w-full max-w-full"
              )}
            >
              {isAssistant ? (
                <div className="flex w-full flex-col gap-2.5">
                  {message.parts && message.parts.length > 0 ? (
                    message.parts.map((part, partIndex) => {
                      if (isReasoningUIPart(part)) {
                        const isLastPart =
                          partIndex === message.parts.length - 1
                        return (
                          <Reasoning
                            key={
                              part.id
                                ? `reasoning-${partIndex}-${part.id}`
                                : `reasoning-${partIndex}`
                            }
                            part={part}
                            isStreaming={
                              part.state === "streaming" ||
                              (isGenerating && isLast && isLastPart)
                            }
                          />
                        )
                      }

                      if (part.type === "text") {
                        const text = (part as { text?: string }).text
                        if (!text || !text.trim()) return null
                        const isLastPart =
                          partIndex === message.parts.length - 1
                        return (
                          <Markdown
                            key={`text-${partIndex}`}
                            content={text}
                            isStreaming={isGenerating && isLast && isLastPart}
                          />
                        )
                      }

                      if (isToolUIPart(part)) {
                        const toolName = getToolName(part)
                        if (toolName === "ask_player") {
                          return (
                            <AskPlayerQuestionnaire
                              key={part.toolCallId || `ask-player-${partIndex}`}
                              part={part}
                              onAnswer={(output) =>
                                handleAnswerPlayer(part.toolCallId, output)
                              }
                            />
                          )
                        }

                        return (
                          <ToolCall
                            key={part.toolCallId || `tool-${partIndex}`}
                            part={part}
                            isGenerating={isGenerating && isLast}
                          />
                        )
                      }

                      return null
                    })
                  ) : textContent ? (
                    <Markdown
                      content={textContent}
                      isStreaming={isGenerating && isLast}
                    />
                  ) : null}

                  {isGenerating && isLast && !isLastPartStreaming && !isErrorMessage && (
                    <Marker className="py-0.5 text-xs animate-pulse">
                      <MarkerIcon>
                        <Loader2 className="size-3.5 animate-spin text-primary" />
                      </MarkerIcon>
                      <MarkerContent className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Preparing next action...
                        </span>
                      </MarkerContent>
                    </Marker>
                  )}

                  {isErrorMessage && (
                    <div className="mt-1 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <div className="flex-1 leading-relaxed">
                        <p className="font-semibold text-foreground">
                          Generation stopped due to an error
                        </p>
                        <p className="mt-0.5 text-muted-foreground">
                          {errorText}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="whitespace-pre-line">{textContent}</div>
              )}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}

export default ChatMessageItem

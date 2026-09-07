"use client"

import * as React from "react"
import Image from "next/image"
import { useChat } from "@ai-sdk/react"
import type { UIMessage } from "ai"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"

import type { gameChat } from "@/trigger/chat"
import { mintChatAccessToken, startChatSession } from "@/app/actions"
import { DEFAULT_MODEL_ID } from "@/lib/ai/models"
import { isAbortError, sanitizeErrorMessage } from "@/lib/ai/errors"

import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Markdown } from "@/components/ui/markdown"
import { ChatComposer } from "@/components/chat-composer"
import { cn } from "@/lib/utils"

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
      id && initialPublicAccessToken
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

  const { messages, sendMessage, status, stop, error, clearError, setMessages } = useChat({
    id,
    messages: initialMessages,
    transport,
    resume: false,
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
    },
  })

  const handleStop = React.useCallback(() => {
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
        const hasNonTextParts =
          last.parts &&
          Array.isArray(last.parts) &&
          last.parts.some((p) => p.type !== "text")
        if (!hasText && !hasNonTextParts) {
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

  const handleSendMessage = (value: string, options?: { model?: string }) => {
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
            parts: [],
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

  const isGenerating = status === "streaming" || status === "submitted"

  React.useEffect(() => {
    if (status === "ready") {
      const spacer = document.querySelector<HTMLElement>(
        "[data-message-scroller-spacer]"
      )
      if (spacer) {
        spacer.style.height = "0px"
        spacer.style.marginTop = ""
        spacer.hidden = true
      }
    }
  }, [status])

  return (
    <div className={cn("flex size-full min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider>
          <MessageScroller className="size-full">
            <MessageScrollerViewport>
              <MessageScrollerContent
                spacerClassName={
                  status === "ready" ? "!h-0 !hidden !m-0" : undefined
                }
                className="mx-auto w-full max-w-3xl gap-6 px-4 py-6"
              >
                {messages.length === 0 &&
                  status === "ready" &&
                  !initialPrompt && (
                    <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-muted-foreground">
                      <Image
                        src="/logo.svg"
                        alt="Gamebox"
                        width={40}
                        height={40}
                        className="mb-4 opacity-50"
                      />
                      <p className="text-base font-medium text-foreground">
                        What should we build for this game?
                      </p>
                      <p className="mt-1 max-w-sm text-sm">
                        Describe the world, characters, rules, or mechanics you
                        want to create.
                      </p>
                    </div>
                  )}

                {messages.map((message, index) => {
                  const isAssistant = message.role === "assistant"
                  const isLast = index === messages.length - 1

                  const isErrorMessage = Boolean(
                    (message.metadata as { isError?: boolean } | undefined)?.isError
                  )
                  const errorText =
                    (message.metadata as { errorText?: string } | undefined)?.errorText ||
                    "The model failed to generate a response. Please try again or select a different model."

                  if (isErrorMessage) {
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
                              <BubbleContent className="text-sm">
                                {errorText}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )
                  }

                  const textContent =
                    message.parts && Array.isArray(message.parts)
                      ? message.parts
                          .filter((p) => p.type === "text")
                          .map(
                            (p) => (p as { type: "text"; text: string }).text
                          )
                          .join("")
                      : ""

                  const hasNonTextParts =
                    message.parts &&
                    Array.isArray(message.parts) &&
                    message.parts.some((p) => p.type !== "text")

                  // If this is an assistant message with no text and no other parts, don't show empty bubble
                  if (!textContent.trim() && !hasNonTextParts && isAssistant) {
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
                          >
                            <BubbleContent className="text-sm leading-relaxed">
                              {isAssistant ? (
                                <Markdown
                                  content={textContent}
                                  isStreaming={isGenerating && isLast}
                                />
                              ) : (
                                <div className="whitespace-pre-line">
                                  {textContent}
                                </div>
                              )}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )
                })}

                {(status === "submitted" ||
                  (status === "streaming" &&
                    messages.length > 0 &&
                    messages[messages.length - 1].role === "user")) && (
                  <MessageScrollerItem scrollAnchor>
                    <Message align="start">
                      <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
                        <Image
                          src="/logo.svg"
                          alt="Assistant"
                          width={32}
                          height={32}
                          className="size-8 animate-pulse"
                        />
                      </MessageAvatar>
                      <MessageContent className="justify-center">
                        <Bubble variant="ghost" align="start">
                          <BubbleContent className="flex h-8 items-center gap-1.5 overflow-visible py-0 text-sm text-muted-foreground">
                            <span className="inline-block size-2 animate-bounce rounded-full bg-muted-foreground/80" />
                            <span className="inline-block size-2 animate-bounce rounded-full bg-muted-foreground/80 [animation-delay:0.2s]" />
                            <span className="inline-block size-2 animate-bounce rounded-full bg-muted-foreground/80 [animation-delay:0.4s]" />
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )}

                {error && (
                  <MessageScrollerItem scrollAnchor={isGenerating}>
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
                          <BubbleContent className="text-sm">
                            {sanitizeErrorMessage(error.message || error)}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      </div>

      <div className="mx-auto w-full max-w-3xl p-4">
        <ChatComposer
          placeholder="Ask a follow up or describe changes..."
          sendMessage={handleSendMessage}
          status={status}
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

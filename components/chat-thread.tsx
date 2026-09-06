"use client"

import * as React from "react"
import Image from "next/image"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"

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
import { ChatComposer } from "@/components/chat-composer"
import { cn } from "@/lib/utils"

export interface ChatThreadProps {
  id?: string
  className?: string
  initialMessages?: UIMessage[]
  initialPrompt?: string
  initialModel?: string
}

export function ChatThread({
  id,
  className,
  initialMessages,
  initialPrompt,
  initialModel,
}: ChatThreadProps) {
  const { messages, sendMessage, status, stop, error } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  })

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

      sendMessage(
        { text: initialPrompt },
        {
          body: {
            id,
            model: initialModel,
          },
        }
      )
    }
  }, [initialPrompt, initialModel, id, messages.length, sendMessage])

  const handleSendMessage = (value: string, options?: { model?: string }) => {
    sendMessage(
      { text: value },
      {
        body: {
          id,
          model: options?.model,
        },
      }
    )
  }

  return (
    <div className={cn("flex size-full min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider>
          <MessageScroller className="size-full">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
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

                  const textContent =
                    message.parts && Array.isArray(message.parts)
                      ? message.parts
                          .filter((p) => p.type === "text")
                          .map(
                            (p) => (p as { type: "text"; text: string }).text
                          )
                          .join("")
                      : ""

                  // If this is an assistant message currently streaming with no text yet, don't show empty bubble
                  if (
                    !textContent &&
                    isAssistant &&
                    (status === "streaming" || status === "submitted")
                  ) {
                    return null
                  }

                  return (
                    <MessageScrollerItem key={message.id} scrollAnchor={isLast}>
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
                            <BubbleContent className="text-sm leading-relaxed whitespace-pre-line">
                              {textContent}
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
                          <BubbleContent className="flex items-center gap-1.5 py-1 text-sm text-muted-foreground">
                            <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
                            <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0.2s]" />
                            <span className="inline-block size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0.4s]" />
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )}

                {error && (
                  <MessageScrollerItem scrollAnchor>
                    <Message align="start">
                      <MessageContent>
                        <Bubble variant="destructive" align="start">
                          <BubbleContent className="text-sm">
                            {error.message ||
                              "An error occurred while generating the response."}
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
          onStop={stop}
          model={initialModel}
        />
      </div>
    </div>
  )
}

export default ChatThread

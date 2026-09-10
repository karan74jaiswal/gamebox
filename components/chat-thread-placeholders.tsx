"use client"

import * as React from "react"
import Image from "next/image"

import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { sanitizeErrorMessage } from "@/lib/ai/errors"

export function ChatEmptyState() {
  return (
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
        Describe the world, characters, rules, or mechanics you want to create.
      </p>
    </div>
  )
}

export interface ChatPendingPromptProps {
  initialPrompt: string
}

export function ChatPendingPrompt({ initialPrompt }: ChatPendingPromptProps) {
  return (
    <MessageScrollerItem messageId="initial-prompt-pending" scrollAnchor>
      <Message align="end">
        <MessageContent>
          <Bubble variant="secondary" align="end">
            <BubbleContent className="text-sm leading-relaxed whitespace-pre-line">
              {initialPrompt}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}

export function ChatLoadingBubbles() {
  return (
    <MessageScrollerItem messageId="loading-bubbles" scrollAnchor>
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
  )
}

export interface ChatErrorMessageProps {
  error: Error | { message?: string } | string
  isGenerating?: boolean
}

export function ChatErrorMessage({
  error,
  isGenerating,
}: ChatErrorMessageProps) {
  const errorMessage =
    typeof error === "string"
      ? error
      : "message" in error && error.message
        ? error.message
        : String(error)

  return (
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
              {sanitizeErrorMessage(errorMessage)}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}

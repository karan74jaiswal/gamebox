"use client"

import * as React from "react"
import { ChatThread, type ChatThreadProps } from "@/components/chat-thread"
import { ChatPreview } from "@/components/chat-preview"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/lib/utils"

export type GameChatProps = ChatThreadProps

export function GameChat({ className, ...props }: GameChatProps) {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className={cn("h-full w-full", className)}
    >
      <ResizablePanel defaultSize={50} minSize={30}>
        <ChatThread {...props} />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        defaultSize={50}
        minSize={30}
        className="flex h-full items-center justify-center p-4"
      >
        <ChatPreview />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export default GameChat

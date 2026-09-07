"use client"

import * as React from "react"
import type { GroupImperativeHandle } from "react-resizable-panels"
import { ChatThread, type ChatThreadProps } from "@/components/chat-thread"
import { ChatPreview } from "@/components/chat-preview"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/lib/utils"

export interface GameChatProps extends ChatThreadProps {
  initialSandboxId?: string | null
}

export function GameChat({
  className,
  initialSandboxId,
  ...props
}: GameChatProps) {
  const [sandboxId, setSandboxId] = React.useState<string | null>(
    initialSandboxId ?? null
  )
  const groupRef = React.useRef<GroupImperativeHandle>(null)

  React.useEffect(() => {
    setSandboxId(initialSandboxId ?? null)
  }, [props.id, initialSandboxId])

  React.useEffect(() => {
    const handleSandboxUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; sandboxId?: string }>).detail
      if (detail?.sandboxId && (!detail.id || detail.id === props.id)) {
        setSandboxId(detail.sandboxId)
      }
    }

    window.addEventListener("game-sandbox-updated", handleSandboxUpdate)
    return () => {
      window.removeEventListener("game-sandbox-updated", handleSandboxUpdate)
    }
  }, [props.id])

  React.useEffect(() => {
    if (sandboxId && groupRef.current) {
      requestAnimationFrame(() => {
        try {
          groupRef.current?.setLayout({ chat: 50, preview: 50 })
        } catch {
          // Ignore if layout is already active or panel registration is pending
        }
      })
    }
  }, [sandboxId])

  return (
    <ResizablePanelGroup
      groupRef={groupRef}
      orientation="horizontal"
      className={cn("h-full w-full", className)}
    >
      <ResizablePanel
        id="chat"
        defaultSize={sandboxId ? 50 : 100}
        minSize={30}
      >
        <ChatThread {...props} onSandboxReady={setSandboxId} />
      </ResizablePanel>
      {sandboxId && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="preview"
            defaultSize={50}
            minSize={30}
            className="flex h-full flex-col overflow-hidden"
          >
            <ChatPreview
              gameId={props.id}
              sandboxId={sandboxId}
              className="h-full w-full"
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}

export default GameChat

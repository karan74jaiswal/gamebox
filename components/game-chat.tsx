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

  const [isOpening, setIsOpening] = React.useState(Boolean(initialSandboxId))
  const animatedRef = React.useRef(false)
  const animationFrameRef = React.useRef<number | null>(null)

  const startExpansionAnimation = React.useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    setIsOpening(true)
    const DURATION = 1500 // 1.5s smooth transition
    let startTime: number | null = null

    const animate = (currentTime: number) => {
      if (!groupRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      if (startTime === null) {
        startTime = currentTime
      }

      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / DURATION, 1)

      // Smooth cubic ease-out curve
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const previewSize = Math.round(easeOut * 50 * 10) / 10
      const chatSize = Math.round((100 - previewSize) * 10) / 10

      try {
        groupRef.current.setLayout({ chat: chatSize, preview: previewSize })
      } catch {
        // Ignore if unmounted
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setIsOpening(false)
        try {
          groupRef.current.setLayout({ chat: 50, preview: 50 })
        } catch {
          // Ignore if unmounted
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [])

  React.useEffect(() => {
    // Animate whenever sandboxId is present (on navigation or when newly created)
    if (sandboxId && !animatedRef.current) {
      animatedRef.current = true
      const frame = requestAnimationFrame(() => {
        startExpansionAnimation()
      })
      return () => {
        cancelAnimationFrame(frame)
        animatedRef.current = false
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [sandboxId, startExpansionAnimation])

  return (
    <ResizablePanelGroup
      groupRef={groupRef}
      orientation="horizontal"
      className={cn("h-full w-full", className)}
    >
      <ResizablePanel
        id="chat"
        defaultSize={100}
        minSize={30}
      >
        <ChatThread {...props} onSandboxReady={setSandboxId} />
      </ResizablePanel>

      <ResizableHandle
        withHandle
        className={cn(
          !sandboxId && "hidden pointer-events-none",
          isOpening && "transition-opacity duration-700"
        )}
      />

      <ResizablePanel
        id="preview"
        defaultSize={0}
        minSize={!sandboxId || isOpening ? 0 : 30}
        collapsible={true}
        collapsedSize={0}
        className={cn(
          "flex h-full flex-col overflow-hidden",
          !sandboxId && "hidden"
        )}
      >
        {sandboxId && (
          <ChatPreview
            gameId={props.id}
            sandboxId={sandboxId}
            className="h-full w-full"
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export default GameChat

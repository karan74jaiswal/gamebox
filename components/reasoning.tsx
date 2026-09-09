"use client"

import * as React from "react"
import { type ReasoningUIPart } from "ai"
import { Brain, ChevronDown, Loader2 } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export interface ReasoningProps {
  part: ReasoningUIPart
  isStreaming?: boolean
}

/**
 * Renders a collapsible thinking/reasoning part emitted by reasoning-capable LLMs.
 * Uses the official ReasoningUIPart type from the AI SDK.
 */
export function Reasoning({ part, isStreaming }: ReasoningProps) {
  const activeStreaming = isStreaming ?? part.state === "streaming"
  const [openOverride, setOpenOverride] = React.useState<boolean | null>(null)
  const isOpen = openOverride ?? activeStreaming

  const cleanText = part.text?.trim() || ""
  if (!cleanText && !activeStreaming) return null

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setOpenOverride}
      className="my-1 w-full rounded-lg border border-border/40 bg-muted/20 text-muted-foreground transition-colors"
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
        <div className="flex items-center gap-2">
          {activeStreaming ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          ) : (
            <Brain className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              activeStreaming && "animate-pulse font-medium text-foreground"
            )}
          >
            {activeStreaming ? "Thinking..." : "Thought process"}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            isOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/20 px-3 pt-1.5 pb-2.5 text-xs leading-relaxed">
        <div className="max-h-60 overflow-y-auto font-sans whitespace-pre-wrap text-muted-foreground/90 select-text">
          {cleanText || (activeStreaming ? "Deliberating..." : "")}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

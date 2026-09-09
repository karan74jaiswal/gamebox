"use client"

import * as React from "react"
import { isToolUIPart, getToolName, type UIMessage } from "ai"
import { AlertCircle, Check, Loader2 } from "lucide-react"

import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { cn } from "@/lib/utils"

export type MessagePart = UIMessage["parts"][number]
export type ToolPart = Extract<MessagePart, { toolCallId: string }>
export type ToolStatus = "active" | "done" | "failed"

/**
 * Determines whether a tool part is active, done, or failed using official AI SDK states.
 */
export function getToolStatus(part: ToolPart): ToolStatus {
  const state = part.state
  const errorText = "errorText" in part ? part.errorText : undefined
  const output = "output" in part ? part.output : undefined

  if (
    state === "output-error" ||
    state === "output-denied" ||
    Boolean(errorText)
  ) {
    return "failed"
  }

  if (
    output &&
    typeof output === "object" &&
    output !== null &&
    "error" in output
  ) {
    const err = (output as { error?: unknown }).error
    if (Boolean(err)) {
      return "failed"
    }
  }

  if (state === "output-available") {
    return "done"
  }

  return "active"
}

/**
 * Cleans the absolute sandbox path down to a clean relative path for display.
 */
export function cleanPath(rawPath?: unknown): string {
  if (typeof rawPath !== "string" || !rawPath.trim()) return ""
  let p = rawPath.trim()
  const sandboxPrefix = "/home/daytona/game"
  if (p.startsWith(`${sandboxPrefix}/`)) {
    p = p.slice(sandboxPrefix.length + 1)
  } else if (p.startsWith(sandboxPrefix)) {
    p = p.slice(sandboxPrefix.length)
    if (p.startsWith("/")) p = p.slice(1)
  }
  return p
}

/**
 * Resolves the display text for tool actions.
 */
export function formatToolDisplay(
  toolName: string,
  status: ToolStatus,
  input?: Record<string, unknown>,
  output?: unknown
): {
  action: string
  target?: string
  suffix?: string
} {
  const filePath = cleanPath(input?.path)

  switch (toolName) {
    case "write_file": {
      if (status === "active") {
        return {
          action: filePath ? "Writing" : "Writing file",
          target: filePath,
          suffix: "...",
        }
      }
      if (status === "done") {
        return {
          action: filePath ? "Wrote" : "Wrote file",
          target: filePath,
        }
      }
      return {
        action: filePath ? "Failed to write" : "Failed to write file",
        target: filePath,
      }
    }

    case "replace_text": {
      if (status === "active") {
        return {
          action: filePath ? "Updating" : "Updating file",
          target: filePath,
          suffix: "...",
        }
      }
      if (status === "done") {
        return {
          action: filePath ? "Updated" : "Updated file",
          target: filePath,
        }
      }
      return {
        action: filePath ? "Failed to update" : "Failed to update file",
        target: filePath,
      }
    }

    case "read_file": {
      if (status === "active") {
        return {
          action: filePath ? "Reading" : "Reading file",
          target: filePath,
          suffix: "...",
        }
      }
      if (status === "done") {
        return {
          action: filePath ? "Read" : "Read file",
          target: filePath,
        }
      }
      return {
        action: filePath ? "Failed to read" : "Failed to read file",
        target: filePath,
      }
    }

    case "list_files": {
      if (status === "active") {
        return {
          action: "Listing workspace files",
          suffix: "...",
        }
      }
      if (status === "done") {
        let count = ""
        if (
          output &&
          typeof output === "object" &&
          output !== null &&
          "files" in output &&
          Array.isArray((output as { files?: unknown }).files)
        ) {
          count = ` (${(output as { files: unknown[] }).files.length} files)`
        }
        return {
          action: `Listed workspace files${count}`,
        }
      }
      return {
        action: "Failed to list files",
      }
    }

    case "delete_file": {
      if (status === "active") {
        return {
          action: filePath ? "Deleting" : "Deleting file",
          target: filePath,
          suffix: "...",
        }
      }
      if (status === "done") {
        return {
          action: filePath ? "Deleted" : "Deleted file",
          target: filePath,
        }
      }
      return {
        action: filePath ? "Failed to delete" : "Failed to delete file",
        target: filePath,
      }
    }

    default: {
      const formattedName = toolName.replace(/_/g, " ")
      if (status === "active") {
        return {
          action: `Running ${formattedName}`,
          suffix: "...",
        }
      }
      if (status === "done") {
        return {
          action: `Completed ${formattedName}`,
        }
      }
      return {
        action: `Failed ${formattedName}`,
      }
    }
  }
}

export interface ToolCallProps {
  part: MessagePart
  className?: string
}

/**
 * Renders an inline Marker indicating the status of a tool call.
 * Uses the official AI SDK `isToolUIPart` and `getToolName` APIs.
 * Does not render full code diffs or a collapsible drawer per design requirements.
 */
export function ToolCall({ part, className }: ToolCallProps) {
  if (!isToolUIPart(part)) {
    return null
  }

  const toolName = getToolName(part)
  const status = getToolStatus(part)
  const input =
    "input" in part && typeof part.input === "object" && part.input !== null
      ? (part.input as Record<string, unknown>)
      : undefined
  const output = "output" in part ? part.output : undefined
  const errorText = "errorText" in part ? part.errorText : undefined

  const { action, target, suffix } = formatToolDisplay(
    toolName,
    status,
    input,
    output
  )

  return (
    <Marker className={cn("py-0.5 text-xs", className)} title={errorText}>
      <MarkerIcon>
        {status === "active" && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
        {status === "done" && (
          <Check className="size-3.5 text-emerald-500 dark:text-emerald-400" />
        )}
        {status === "failed" && (
          <AlertCircle className="size-3.5 text-destructive" />
        )}
      </MarkerIcon>
      <MarkerContent className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            status === "failed" && "font-medium text-destructive",
            status === "active" && "font-medium text-foreground"
          )}
        >
          {action}
        </span>
        {target && (
          <code className="rounded border border-border/40 bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {target}
          </code>
        )}
        {suffix && (
          <span
            className={cn(
              status === "failed" && "text-destructive",
              status === "active" && "font-medium text-foreground"
            )}
          >
            {suffix}
          </span>
        )}
      </MarkerContent>
    </Marker>
  )
}

export default ToolCall

"use client"

import * as React from "react"
import { Streamdown, type StreamdownProps } from "streamdown"
import { cn } from "@/lib/utils"

export interface MarkdownProps extends Omit<StreamdownProps, "children"> {
  content: string
  className?: string
  isStreaming?: boolean
}

export function Markdown({
  content,
  className,
  isStreaming = false,
  caret,
  ...props
}: MarkdownProps) {
  return (
    <Streamdown
      isAnimating={isStreaming}
      caret={caret ?? (isStreaming ? "block" : undefined)}
      linkSafety={{ enabled: false }}
      className={cn(
        "w-full min-w-0 text-sm leading-relaxed break-words text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      components={{
        h1: ({ className: c, ...p }) => (
          <h1
            className={cn(
              "mt-4 mb-2 text-lg font-bold tracking-tight text-foreground sm:text-xl",
              c
            )}
            {...p}
          />
        ),
        h2: ({ className: c, ...p }) => (
          <h2
            className={cn(
              "mt-3 mb-1.5 text-base font-semibold tracking-tight text-foreground sm:text-lg",
              c
            )}
            {...p}
          />
        ),
        h3: ({ className: c, ...p }) => (
          <h3
            className={cn(
              "mt-2.5 mb-1 text-sm font-semibold tracking-tight text-foreground sm:text-base",
              c
            )}
            {...p}
          />
        ),
        p: ({ className: c, ...p }) => (
          <p className={cn("my-1.5 leading-relaxed", c)} {...p} />
        ),
        strong: ({ className: c, ...p }) => (
          <strong className={cn("font-semibold text-foreground", c)} {...p} />
        ),
        em: ({ className: c, ...p }) => (
          <em className={cn("italic", c)} {...p} />
        ),
        ul: ({ className: c, ...p }) => (
          <ul
            className={cn(
              "my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground",
              c
            )}
            {...p}
          />
        ),
        ol: ({ className: c, ...p }) => (
          <ol
            className={cn(
              "my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground",
              c
            )}
            {...p}
          />
        ),
        li: ({ className: c, ...p }) => (
          <li className={cn("leading-relaxed", c)} {...p} />
        ),
        blockquote: ({ className: c, ...p }) => (
          <blockquote
            className={cn(
              "my-2 border-l-2 border-border pl-3 text-muted-foreground italic",
              c
            )}
            {...p}
          />
        ),
        code: ({ className: c, children, ...p }) => {
          const isInline = !c || !c.includes("language-")
          if (isInline) {
            return (
              <code
                className={cn(
                  "rounded border border-border/50 bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground",
                  c
                )}
                {...p}
              >
                {children}
              </code>
            )
          }
          return (
            <code className={cn("font-mono text-xs text-foreground", c)} {...p}>
              {children}
            </code>
          )
        },
        pre: ({ className: c, ...p }) => (
          <pre
            className={cn(
              "my-3 overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-xs text-foreground",
              c
            )}
            {...p}
          />
        ),
        a: ({ className: c, ...p }) => (
          <a
            className={cn(
              "text-primary underline underline-offset-4 transition-opacity hover:opacity-80",
              c
            )}
            target="_blank"
            rel="noreferrer"
            {...p}
          />
        ),
      }}
      {...props}
    >
      {content}
    </Streamdown>
  )
}

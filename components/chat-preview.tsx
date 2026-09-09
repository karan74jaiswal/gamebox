"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import {
  RotateCw,
  ExternalLink,
  Gamepad2,
  AlertCircle,
  RefreshCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface ChatPreviewProps {
  gameId?: string
  id?: string
  sandboxId?: string | null
  className?: string
  children?: React.ReactNode
}

export function ChatPreview({
  gameId,
  id,
  sandboxId,
  className,
}: ChatPreviewProps = {}) {
  const params = useParams()
  const effectiveGameId = gameId || id || (params?.id as string | undefined)

  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [isIframeLoaded, setIsIframeLoaded] = React.useState(false)
  const [isReloading, setIsReloading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [iframeKey, setIframeKey] = React.useState(0)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  const fetchPreviewUrl = React.useCallback(
    async (signal?: AbortSignal) => {
      if (!effectiveGameId) {
        return
      }

      try {
        const response = await fetch(`/api/games/${effectiveGameId}/preview`, {
          signal,
        })
        const data = await response.json()
        setError(null)

        if (!response.ok) {
          if (response.status === 409) {
            throw new Error(data.error || "Game sandbox is not ready yet.")
          }
          if (response.status === 404) {
            throw new Error(data.error || "Game not found.")
          }
          throw new Error(
            data.error || `Failed to start game preview (${response.status})`
          )
        }

        if (!data.url) {
          throw new Error("No preview URL returned by the server.")
        }

        setPreviewUrl(data.url)
      } catch (err: unknown) {
        if (signal?.aborted) return
        const message =
          err instanceof Error ? err.message : "Failed to load game preview."
        setError(message)
      }
    },
    [effectiveGameId]
  )

  React.useEffect(() => {
    // If sandboxId is missing, don't fetch
    if (!sandboxId) {
      return
    }

    const abortController = new AbortController()
    void fetchPreviewUrl(abortController.signal)

    return () => {
      abortController.abort()
    }
  }, [effectiveGameId, sandboxId, fetchPreviewUrl])

  const reloadTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const handleReloadIframe = React.useCallback(() => {
    setIsReloading(true)
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current)
    }
    reloadTimeoutRef.current = setTimeout(() => {
      setIsReloading(false)
    }, 8000)

    if (iframeRef.current && previewUrl) {
      try {
        const url = new URL(previewUrl, window.location.origin)
        url.searchParams.set("_t", Date.now().toString())
        iframeRef.current.src = url.toString()
        return
      } catch {
        // Fallback to iframeKey remount
      }
    }

    if (!previewUrl && effectiveGameId) {
      void fetchPreviewUrl()
      return
    }

    setIframeKey((prev) => prev + 1)
  }, [previewUrl, effectiveGameId, fetchPreviewUrl])

  React.useEffect(() => {
    const handleCodeUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>
      if (
        !effectiveGameId ||
        !customEvent.detail?.id ||
        customEvent.detail.id === effectiveGameId
      ) {
        handleReloadIframe()
      }
    }

    window.addEventListener("game-code-updated", handleCodeUpdated)
    return () => {
      window.removeEventListener("game-code-updated", handleCodeUpdated)
    }
  }, [effectiveGameId, handleReloadIframe])

  React.useEffect(() => {
    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current)
      }
    }
  }, [])

  // Conditionally render nothing if sandboxId is missing
  if (!sandboxId) {
    return null
  }

  return (
    <div
      className={cn(
        "flex h-full w-full animate-in flex-col overflow-hidden bg-background text-foreground duration-700 fade-in-50",
        className
      )}
    >
      {/* Top toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3.5">
        <div className="flex items-center gap-2">
          <Gamepad2 className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-tight text-foreground">
            Preview
          </span>

          {/* Status badge */}
          {isReloading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
              Updating
            </span>
          ) : !isIframeLoaded && !error ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
              Starting
            </span>
          ) : error ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <span className="size-1.5 rounded-full bg-destructive" />
              Offline
            </span>
          ) : isIframeLoaded ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {previewUrl && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleReloadIframe}
                      aria-label="Reload preview"
                    />
                  }
                >
                  <RotateCw
                    className={cn(
                      "size-3.5 text-muted-foreground transition-transform hover:text-foreground",
                      isReloading && "animate-spin text-foreground"
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom">Reload preview</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      nativeButton={false}
                      render={
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open in new tab"
                        />
                      }
                    />
                  }
                >
                  <ExternalLink className="size-3.5 text-muted-foreground hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent side="bottom">Open in new tab</TooltipContent>
              </Tooltip>
            </>
          )}

          {error && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => fetchPreviewUrl()}
              className="gap-1 text-xs"
            >
              <RefreshCcw className="size-3" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Main preview body */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-background">
        {/* Single unified loader: stays visible until iframe actually fires onLoad */}
        {!isIframeLoaded && !error && (
          <div className="absolute inset-0 z-20 flex animate-in flex-col items-center justify-center gap-3 bg-background p-6 text-center duration-300 fade-in-50">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-primary/5 text-primary shadow-xs">
              <Spinner className="size-6 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Starting game preview...
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Spinning up your Daytona sandbox and launching the HTTP game
                server.
              </p>
            </div>
          </div>
        )}

        {error ? (
          <div className="flex max-w-sm animate-in flex-col items-center justify-center gap-3 p-6 text-center duration-300 fade-in-50">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertCircle className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Unable to load preview
              </p>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                {error}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchPreviewUrl()}
              className="mt-1 gap-1.5"
            >
              <RefreshCcw className="size-3.5" />
              Try again
            </Button>
          </div>
        ) : previewUrl ? (
          <div className="relative h-full w-full flex-1 bg-background">
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={previewUrl}
              title="Game Preview"
              className={cn(
                "h-full w-full border-0 bg-background transition-opacity duration-300",
                isIframeLoaded ? "opacity-100" : "opacity-0"
              )}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              onLoad={() => {
                if (reloadTimeoutRef.current) {
                  clearTimeout(reloadTimeoutRef.current)
                  reloadTimeoutRef.current = null
                }
                setIsIframeLoaded(true)
                setIsReloading(false)
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ChatPreview

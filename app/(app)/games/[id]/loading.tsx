import Image from "next/image"
import { Skeleton } from "@/components/ui/skeleton"

export default function GameLoading() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      {/* Scrollable messages area placeholder spanning the full viewport */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {/* Turn 1 - User message skeleton */}
          <div className="flex w-full justify-end">
            <div className="flex max-w-[75%] flex-col items-end gap-2 rounded-2xl border border-border/40 bg-muted/40 px-4 py-3 dark:border-border/30 dark:bg-muted/20">
              <Skeleton className="h-3.5 w-64 bg-muted-foreground/25 dark:bg-muted/80" />
              <Skeleton className="h-3.5 w-44 bg-muted-foreground/25 dark:bg-muted/80" />
            </div>
          </div>

          {/* Turn 1 - Assistant message skeleton */}
          <div className="flex w-full items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent">
              <Image
                src="/logo.svg"
                alt="Loading game"
                width={32}
                height={32}
                className="size-8 animate-pulse opacity-40"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>

          {/* Turn 2 - User follow-up message skeleton */}
          <div className="flex w-full justify-end">
            <div className="flex max-w-[75%] flex-col items-end gap-2 rounded-2xl border border-border/40 bg-muted/40 px-4 py-3 dark:border-border/30 dark:bg-muted/20">
              <Skeleton className="h-3.5 w-52 bg-muted-foreground/25 dark:bg-muted/80" />
              <Skeleton className="h-3.5 w-32 bg-muted-foreground/25 dark:bg-muted/80" />
            </div>
          </div>

          {/* Turn 2 - Assistant message skeleton */}
          <div className="flex w-full items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-transparent">
              <Image
                src="/logo.svg"
                alt="Loading game"
                width={32}
                height={32}
                className="size-8 animate-pulse opacity-40"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
          </div>

          {/* Turn 2 - Assistant preview / code card skeleton */}
          <div className="flex w-full items-start gap-3">
            <div className="size-8 shrink-0" aria-hidden="true" />
            <div className="flex w-full max-w-xl flex-col gap-3 rounded-xl border border-border/40 bg-muted/20 p-4 dark:border-border/30 dark:bg-muted/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
                <Skeleton className="size-5 rounded" />
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-2/3" />
              <div className="mt-1 flex gap-2">
                <Skeleton className="h-7 w-20 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Composer skeleton matching ChatComposer */}
      <div className="mx-auto w-full max-w-3xl p-4">
        <div className="flex w-full flex-col rounded-lg border border-input bg-popover p-3 shadow-xs">
          <div className="flex h-10 items-center">
            <Skeleton className="h-4 w-60 bg-muted/60" />
          </div>
          <div className="flex items-center justify-between border-t border-border/30 pt-2">
            <Skeleton className="h-7 w-32 rounded-md bg-muted/50" />
            <Skeleton className="size-7 rounded-full bg-muted/60" />
          </div>
        </div>
      </div>
    </div>
  )
}

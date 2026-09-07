"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Coins,
  MessageSquareIcon,
  PanelLeftIcon,
  SquarePen,
} from "lucide-react"
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { SidebarGame } from "@/lib/games/queries"

export type { SidebarGame }

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  games?: SidebarGame[]
  gamesPromise?: Promise<SidebarGame[]>
}

export function SidebarRecentsSkeleton() {
  return (
    <>
      {/* Expanded view skeleton */}
      <div className="group-data-[collapsible=icon]:hidden">
        <SidebarMenu className="gap-1.5">
          {["w-3/4", "w-5/6", "w-1/2", "w-2/3", "w-3/5"].map(
            (widthClass, index) => (
              <SidebarMenuItem key={index}>
                <div className="flex h-8 w-full items-center gap-2 rounded-md px-2">
                  <Skeleton className="size-4 shrink-0 rounded bg-muted/60" />
                  <Skeleton className={cn("h-3.5 bg-muted/60", widthClass)} />
                </div>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </div>

      {/* Collapsed view skeleton */}
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <div className="flex size-8 items-center justify-center rounded-md">
            <Skeleton className="size-4 rounded bg-muted/60" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}

const EMPTY_GAMES: SidebarGame[] = []

function SidebarRecentsList({
  gamesPromise,
  initialGames = EMPTY_GAMES,
}: {
  gamesPromise?: Promise<SidebarGame[]>
  initialGames?: SidebarGame[]
}) {
  const resolved = gamesPromise ? React.use(gamesPromise) : initialGames
  const pathname = usePathname()
  const router = useRouter()
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const [titleOverrides, setTitleOverrides] = React.useState<
    Record<string, string>
  >({})

  React.useEffect(() => {
    const handleTitleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string; title?: string }>
      const { id, title } = customEvent.detail || {}
      if (!id || !title) return

      setTitleOverrides((prev) => ({ ...prev, [id]: title }))
      // router.refresh()
    }

    window.addEventListener("game-title-updated", handleTitleUpdate)
    return () => {
      window.removeEventListener("game-title-updated", handleTitleUpdate)
    }
  }, [router])

  const gamesList = React.useMemo(() => {
    return resolved.map((game) =>
      titleOverrides[game.id]
        ? { ...game, title: titleOverrides[game.id] }
        : game
    )
  }, [resolved, titleOverrides])

  return (
    <>
      {/* Expanded view */}
      <div className="group-data-[collapsible=icon]:hidden">
        {gamesList.length === 0 ? (
          <Empty className="border border-dashed p-2">
            <EmptyDescription className="text-xs">
              Your games will live here.
            </EmptyDescription>
          </Empty>
        ) : (
          <SidebarMenu className="gap-1.5">
            {gamesList.map((game) => (
              <SidebarMenuItem key={game.id}>
                <SidebarMenuButton
                  isActive={pathname === `/games/${game.id}`}
                  tooltip={game.title}
                  render={<Link href={`/games/${game.id}`} />}
                >
                  <MessageSquareIcon />
                  <span>{game.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </div>

      {/* Collapsed view with Popover */}
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger
              render={
                <SidebarMenuButton tooltip="Recents">
                  <MessageSquareIcon />
                  <span>Recents</span>
                </SidebarMenuButton>
              }
            />
            <PopoverContent side="right" align="start" className="w-64 p-2">
              <PopoverHeader>
                <PopoverTitle className="text-xs font-semibold text-muted-foreground">
                  Recents
                </PopoverTitle>
              </PopoverHeader>
              {gamesList.length === 0 ? (
                <Empty className="border border-dashed p-2">
                  <EmptyDescription className="text-xs">
                    Your games will live here.
                  </EmptyDescription>
                </Empty>
              ) : (
                <SidebarMenu className="max-h-80 gap-1.5 overflow-y-auto">
                  {gamesList.map((game) => (
                    <SidebarMenuItem key={game.id}>
                      <SidebarMenuButton
                        isActive={pathname === `/games/${game.id}`}
                        render={<Link href={`/games/${game.id}`} />}
                        onClick={() => setPopoverOpen(false)}
                      >
                        <MessageSquareIcon />
                        <span>{game.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}

export function AppSidebar({ games, gamesPromise, ...props }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
            <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
              <Image
                src="/logo.svg"
                alt="Gamebox"
                width={20}
                height={20}
                className="size-5"
              />
              <span className="font-logo text-base">Gamebox</span>
            </div>
            <SidebarTrigger>
              <PanelLeftIcon />
            </SidebarTrigger>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  render={<Link href="/" />}
                >
                  <SquarePen />
                  <span>New game</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recents</SidebarGroupLabel>
          <SidebarGroupContent>
            <React.Suspense fallback={<SidebarRecentsSkeleton />}>
              <SidebarRecentsList
                gamesPromise={gamesPromise}
                initialGames={games}
              />
            </React.Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Coins />
              <span>Credits</span>
            </SidebarMenuButton>
            <SidebarMenuBadge>$1.00</SidebarMenuBadge>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex min-w-0 items-center justify-between gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden [&_.cl-organizationPreview]:max-w-full [&_.cl-organizationPreview]:min-w-0 [&_.cl-organizationPreview]:overflow-hidden [&_.cl-organizationPreviewMainIdentifier]:truncate [&_.cl-organizationPreviewTextContainer]:max-w-full [&_.cl-organizationPreviewTextContainer]:min-w-0 [&_.cl-organizationPreviewTextContainer]:overflow-hidden [&_.cl-organizationSwitcherTrigger]:w-full [&_.cl-organizationSwitcherTrigger]:max-w-full [&_.cl-organizationSwitcherTrigger]:min-w-0 [&_.cl-organizationSwitcherTrigger]:justify-between [&_.cl-organizationSwitcherTrigger]:overflow-hidden [&_.cl-organizationSwitcherTriggerIcon]:shrink-0 [&_.cl-rootBox]:w-full [&_.cl-rootBox]:max-w-full [&_.cl-rootBox]:min-w-0 [&_.cl-userPreview]:max-w-full [&_.cl-userPreview]:min-w-0 [&_.cl-userPreview]:overflow-hidden [&_.cl-userPreviewMainIdentifier]:truncate [&_.cl-userPreviewTextContainer]:max-w-full [&_.cl-userPreviewTextContainer]:min-w-0 [&_.cl-userPreviewTextContainer]:overflow-hidden">
            <OrganizationSwitcher
              appearance={{
                elements: {
                  rootBox: "w-full min-w-0 max-w-full",
                  organizationSwitcherTrigger:
                    "w-full min-w-0 max-w-full justify-between overflow-hidden",
                  organizationPreview: "min-w-0 max-w-full overflow-hidden",
                  organizationPreviewTextContainer:
                    "min-w-0 max-w-full overflow-hidden text-left",
                  organizationPreviewMainIdentifier: "truncate text-left",
                  organizationSwitcherTriggerIcon: "shrink-0",
                  userPreview: "min-w-0 max-w-full overflow-hidden",
                  userPreviewTextContainer:
                    "min-w-0 max-w-full overflow-hidden text-left",
                  userPreviewMainIdentifier: "truncate text-left",
                },
              }}
            />
          </div>
          <div className="flex shrink-0 items-center">
            <UserButton />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar

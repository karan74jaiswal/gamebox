"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
            <Empty className="border border-dashed p-2 group-data-[collapsible=icon]:hidden">
              <EmptyDescription className="text-xs">
                Your games will live here.
              </EmptyDescription>
            </Empty>
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Recents">
                  <MessageSquareIcon />
                  <span>Recents</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
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

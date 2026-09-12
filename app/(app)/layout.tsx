import { auth } from "@clerk/nextjs/server"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { listGames } from "@/lib/games/queries"
import { getFormattedOrgBalance } from "@/lib/credits/ledger"

export async function AppLayout({ children }: { children: React.ReactNode }) {
  const { orgId } = await auth.protect({ unauthenticatedUrl: "/sign-in" })
  const gamesPromise = listGames()
  const creditsPromise = orgId
    ? getFormattedOrgBalance(orgId)
    : Promise.resolve("$1.00")

  return (
    <SidebarProvider>
      <AppSidebar gamesPromise={gamesPromise} creditsPromise={creditsPromise} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}

export default AppLayout

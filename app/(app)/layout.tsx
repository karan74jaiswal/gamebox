import { auth } from "@clerk/nextjs/server"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { listGames } from "@/lib/games/queries"

export async function AppLayout({ children }: { children: React.ReactNode }) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })
  const games = await listGames()

  return (
    <SidebarProvider>
      <AppSidebar games={games} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}

export default AppLayout


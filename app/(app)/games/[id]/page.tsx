import { auth } from "@clerk/nextjs/server"
import { ChatThread } from "@/components/chat-thread"

interface GamePageProps {
  params: Promise<{
    id: string
  }>
}

export default async function GamePage({ params }: GamePageProps) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await params

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <ChatThread id={id} />
    </div>
  )
}

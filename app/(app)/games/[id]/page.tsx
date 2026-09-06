import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import type { UIMessage } from "ai"

import { ChatThread } from "@/components/chat-thread"
import { getGame } from "@/lib/games/queries"

interface GamePageProps {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    prompt?: string
    model?: string
  }>
}

export default async function GamePage({ params, searchParams }: GamePageProps) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await params
  const game = await getGame(id)
  if (!game) {
    notFound()
  }

  const { prompt, model } = await searchParams
  const initialMessages: UIMessage[] = (game.messages as UIMessage[]) ?? []

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <ChatThread
        id={id}
        initialMessages={initialMessages}
        initialPrompt={prompt}
        initialModel={model}
      />
    </div>
  )
}

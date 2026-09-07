import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import type { UIMessage } from "ai"

import { GameChat } from "@/components/game-chat"
import { getGame } from "@/lib/games/queries"
import { mintChatAccessToken } from "@/app/actions"

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
  const initialModel = model || game.model || undefined

  let initialPublicAccessToken: string | undefined
  try {
    initialPublicAccessToken = await mintChatAccessToken(id)
  } catch (error) {
    console.error("Failed to mint initial chat access token:", error)
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <GameChat
        key={id}
        id={id}
        initialMessages={initialMessages}
        initialPrompt={prompt}
        initialModel={initialModel}
        initialLastEventId={game.lastEventId ?? undefined}
        initialPublicAccessToken={initialPublicAccessToken}
        initialSandboxId={game.sandboxId}
      />
    </div>
  )
}


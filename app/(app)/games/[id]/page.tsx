import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import type { UIMessage } from "ai"
import * as Sentry from "@sentry/nextjs"

import { GameChat } from "@/components/game-chat"
import {
  GameHeaderTitle,
  GameHeaderActions,
} from "@/components/game-header-actions"
import { getGame } from "@/lib/games/queries"
import { mintChatAccessToken } from "@/app/actions"
import { checkAndSyncOrgCredits } from "@/lib/credits"

interface GamePageProps {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    prompt?: string
    model?: string
  }>
}

export default async function GamePage({
  params,
  searchParams,
}: GamePageProps) {
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
  if (initialMessages.length > 0) {
    try {
      initialPublicAccessToken = await mintChatAccessToken(id)
    } catch (error) {
      Sentry.logger.error("Failed to mint initial chat access token", {
        gameId: id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  let initialIsOutOfCredits = false
  try {
    const creditCheck = await checkAndSyncOrgCredits(game.orgId)
    initialIsOutOfCredits = !creditCheck.allowed
  } catch (error) {
    Sentry.logger.error("Failed to check initial org credits on game page", {
      gameId: id,
      orgId: game.orgId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  Sentry.logger.info("Game page loaded", {
    gameId: id,
    hasSandbox: Boolean(game.sandboxId),
    messageCount: initialMessages.length,
    initialIsOutOfCredits,
  })

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      {/* Top Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 px-6">
        <GameHeaderTitle id={id} initialTitle={game.title} />
        <GameHeaderActions
          id={id}
          initialTitle={game.title}
          hasSandbox={Boolean(game.sandboxId)}
        />
      </header>

      <div className="min-h-0 flex-1">
        <GameChat
          key={id}
          id={id}
          orgId={game.orgId}
          initialMessages={initialMessages}
          initialPrompt={prompt}
          initialModel={initialModel}
          initialLastEventId={game.lastEventId ?? undefined}
          initialPublicAccessToken={initialPublicAccessToken}
          initialSandboxId={game.sandboxId}
          initialIsOutOfCredits={initialIsOutOfCredits}
        />
      </div>
    </div>
  )
}

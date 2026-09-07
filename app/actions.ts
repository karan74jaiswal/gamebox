"use server"

import { auth as clerkAuth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, type ChatStartSessionParams } from "@trigger.dev/sdk/ai"

import { getGame } from "@/lib/games/queries"
import type { gameChat } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof gameChat>("game-chat")

export async function startChatSession(params: ChatStartSessionParams<typeof gameChat>) {
  const { userId, orgId } = await clerkAuth()
  if (!userId || !orgId) {
    throw new Error("Unauthorized")
  }

  const game = await getGame(params.chatId)
  if (!game) {
    throw new Error("Game not found or unauthorized")
  }

  return startSession(params)
}

export async function mintChatAccessToken(chatId: string) {
  const { userId, orgId } = await clerkAuth()
  if (!userId || !orgId) {
    throw new Error("Unauthorized")
  }

  const game = await getGame(chatId)
  if (!game) {
    throw new Error("Game not found or unauthorized")
  }

  return triggerAuth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  })
}

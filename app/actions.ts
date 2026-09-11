"use server"

import { auth as clerkAuth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, type ChatStartSessionParams } from "@trigger.dev/sdk/ai"
import * as Sentry from "@sentry/nextjs"

import { getGame } from "@/lib/games/queries"
import type { gameChat } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof gameChat>("game-chat")

export async function startChatSession(
  params: ChatStartSessionParams<typeof gameChat>
) {
  Sentry.getIsolationScope().setAttributes({
    action: "startChatSession",
    chatId: params.chatId,
  })

  const { userId, orgId } = await clerkAuth()
  if (!userId || !orgId) {
    Sentry.logger.warn("Unauthorized startChatSession attempt", {
      chatId: params.chatId,
    })
    throw new Error("Unauthorized")
  }

  const game = await getGame(params.chatId)
  if (!game) {
    Sentry.logger.warn("Game not found or unauthorized during startChatSession", {
      chatId: params.chatId,
      userId,
      orgId,
    })
    throw new Error("Game not found or unauthorized")
  }

  try {
    Sentry.logger.info("Starting chat session", {
      chatId: params.chatId,
      userId,
      orgId,
    })
    return await startSession(params)
  } catch (error) {
    Sentry.logger.error("Failed to start chat session", {
      chatId: params.chatId,
      userId,
      orgId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function mintChatAccessToken(chatId: string) {
  Sentry.getIsolationScope().setAttributes({
    action: "mintChatAccessToken",
    chatId,
  })

  const { userId, orgId } = await clerkAuth()
  if (!userId || !orgId) {
    Sentry.logger.warn("Unauthorized mintChatAccessToken attempt", { chatId })
    throw new Error("Unauthorized")
  }

  const game = await getGame(chatId)
  if (!game) {
    Sentry.logger.warn("Game not found or unauthorized during mintChatAccessToken", {
      chatId,
      userId,
      orgId,
    })
    throw new Error("Game not found or unauthorized")
  }

  try {
    const token = await triggerAuth.createPublicToken({
      scopes: {
        read: { sessions: chatId },
        write: { sessions: chatId },
      },
      expirationTime: "1h",
    })

    Sentry.logger.info("Minted chat access token", {
      chatId,
      userId,
      orgId,
    })

    return token
  } catch (error) {
    Sentry.logger.error("Failed to mint chat access token", {
      chatId,
      userId,
      orgId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { generateId, type UIMessage } from "ai"
import * as Sentry from "@sentry/nextjs"

import { db, games, type Game } from "@/lib/db"

import { DEFAULT_MODEL_ID } from "@/lib/ai/models"

export type CreateGameInput =
  { title?: string; prompt?: string; model?: string } | string | FormData

export async function createGame(input: CreateGameInput): Promise<Game> {
  let promptText = ""
  let modelChoice: string | undefined

  if (typeof input === "string") {
    promptText = input
  } else if (input instanceof FormData) {
    promptText =
      input.get("prompt")?.toString() || input.get("title")?.toString() || ""
    modelChoice = input.get("model")?.toString()
  } else if (input && typeof input === "object") {
    promptText =
      ("prompt" in input && input.prompt) ||
      ("title" in input && input.title) ||
      ""
    modelChoice = input.model
  }

  promptText = promptText.trim()
  if (!promptText) {
    throw new Error("Prompt is required to create a game")
  }

  const { orgId } = await auth()
  if (!orgId) {
    Sentry.logger.warn("Unauthorized game creation attempt without orgId")
    throw new Error("Unauthorized: Organization ID is required")
  }

  Sentry.getIsolationScope().setAttributes({
    action: "createGame",
    orgId,
  })

  Sentry.logger.info("Creating new game", {
    orgId,
    model: modelChoice || DEFAULT_MODEL_ID,
  })

  try {
    // 1. Insert immediately with a quick initial title so client navigates in ~10ms
    const initialTitle =
      promptText.length > 30 ? `${promptText.slice(0, 27)}...` : promptText

    const [newGame] = await db
      .insert(games)
      .values({
        title: initialTitle,
        orgId,
        model: modelChoice || DEFAULT_MODEL_ID,
      })
      .returning()

    // Refresh app/(app)/layout.tsx server component layout tag
    revalidatePath("/", "layout")

    Sentry.logger.info("Game created successfully", {
      gameId: newGame.id,
      orgId,
      title: newGame.title,
      model: newGame.model || DEFAULT_MODEL_ID,
    })

    return newGame
  } catch (error) {
    Sentry.logger.error("Failed to create game in database", {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function saveGameMessages(
  gameId: string,
  messages: UIMessage[],
  orgId?: string | null
): Promise<void> {
  const effectiveOrgId = orgId !== undefined ? orgId : (await auth()).orgId

  const sanitizedMessages = messages.map((m) =>
    m.id && m.id.trim() !== "" ? m : { ...m, id: generateId() }
  )

  Sentry.logger.info("Saving game messages", {
    gameId,
    messageCount: sanitizedMessages.length,
  })

  try {
    await db
      .update(games)
      .set({
        messages: sanitizedMessages,
        updatedAt: new Date(),
      })
      .where(
        effectiveOrgId
          ? and(eq(games.id, gameId), eq(games.orgId, effectiveOrgId))
          : eq(games.id, gameId)
      )
  } catch (error) {
    Sentry.logger.error("Failed to save game messages in database", {
      gameId,
      messageCount: sanitizedMessages.length,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { generateId, type UIMessage } from "ai"

import { db, games, type Game } from "@/lib/db"

import { DEFAULT_MODEL_ID } from "@/lib/ai/models"

export type CreateGameInput =
  | { title?: string; prompt?: string; model?: string }
  | string
  | FormData

export async function createGame(input: CreateGameInput): Promise<Game> {
  let promptText = ""
  let modelChoice: string | undefined

  if (typeof input === "string") {
    promptText = input
  } else if (input instanceof FormData) {
    promptText =
      input.get("prompt")?.toString() ||
      input.get("title")?.toString() ||
      ""
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
    throw new Error("Unauthorized: Organization ID is required")
  }

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

  return newGame
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
}


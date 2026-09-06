"use server"

import { after } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { gateway, generateId, generateText, type UIMessage } from "ai"
import { google } from "@ai-sdk/google"

import { db, games, type Game } from "@/lib/db"

export type CreateGameInput =
  | { title?: string; prompt?: string }
  | string
  | FormData

export async function createGame(input: CreateGameInput): Promise<Game> {
  let promptText = ""

  if (typeof input === "string") {
    promptText = input
  } else if (input instanceof FormData) {
    promptText =
      input.get("prompt")?.toString() ||
      input.get("title")?.toString() ||
      ""
  } else if (input && typeof input === "object") {
    promptText =
      ("prompt" in input && input.prompt) ||
      ("title" in input && input.title) ||
      ""
  }

  promptText = promptText.trim()
  if (!promptText) {
    throw new Error("Prompt is required to create a game")
  }

  const { orgId } = await auth()
  if (!orgId) {
    throw new Error("Unauthorized: Organization ID is required")
  }

  // 1. Insert immediately with a quick initial title so client navigates in ~20ms
  const initialTitle =
    promptText.length > 30 ? `${promptText.slice(0, 27)}...` : promptText

  const [newGame] = await db
    .insert(games)
    .values({
      title: initialTitle,
      orgId,
    })
    .returning()

  // Refresh app/(app)/layout.tsx server component layout tag
  revalidatePath("/", "layout")

  // 2. Run AI title generation in the background out-of-band using after()
  after(async () => {
    try {
      const model = process.env.AI_GATEWAY_API_KEY
        ? gateway("google/gemini-2.5-flash")
        : google("gemini-2.5-flash")

      const { text } = await generateText({
        model,
        system:
          "You are a creative game title generator. Generate a concise, catchy game title (2 to 5 words) for the provided game description. Output ONLY the title, with no quotes, markdown formatting, or ending punctuation.",
        prompt: `Game description: ${promptText}`,
      })

      const generatedTitle = text
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/[.]+$/, "")
        .trim()

      if (generatedTitle) {
        await db
          .update(games)
          .set({
            title: generatedTitle,
            updatedAt: new Date(),
          })
          .where(and(eq(games.id, newGame.id), eq(games.orgId, orgId)))

        revalidatePath("/", "layout")
      }
    } catch (error) {
      console.error("Background title generation failed:", error)
    }
  })

  // 3. Return newGame immediately
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


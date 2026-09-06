"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { db, games, type Game } from "@/lib/db"

export type CreateGameInput = { title: string } | string | FormData

export async function createGame(input: CreateGameInput): Promise<Game> {
  let title = ""

  if (typeof input === "string") {
    title = input
  } else if (input instanceof FormData) {
    title = input.get("title")?.toString() || ""
  } else if (input && typeof input === "object" && "title" in input) {
    title = input.title || ""
  }

  title = title.trim()
  if (!title) {
    throw new Error("Title is required")
  }

  const { orgId } = await auth()
  if (!orgId) {
    throw new Error("Unauthorized: Organization ID is required")
  }

  const [newGame] = await db
    .insert(games)
    .values({
      title,
      orgId,
    })
    .returning()

  // Refresh app/(app)/layout.tsx server component layout tag
  revalidatePath("/", "layout")

  return newGame
}

import { asc, eq, sql } from "drizzle-orm"
import type { UIMessage } from "ai"

import { db, messages as messagesTable } from "@/lib/db"

export interface SaveMessagesOptions {
  chatId: string
  userId?: string | null
  messages: UIMessage[]
}

/**
 * Persists chat messages to the database.
 * Upserts messages by ID, preserving and updating parts/metadata.
 */
export async function saveMessages({
  chatId,
  userId,
  messages,
}: SaveMessagesOptions): Promise<void> {
  if (!messages || messages.length === 0) {
    return
  }

  // Deduplicate messages by id in case client sent duplicates in the same batch
  const uniqueMessages = Array.from(
    new Map(messages.map((m) => [m.id, m])).values()
  )

  await db
    .insert(messagesTable)
    .values(
      uniqueMessages.map((m) => ({
        id: m.id,
        chatId,
        userId: userId ?? null,
        role: m.role,
        parts: m.parts,
        metadata: (m.metadata as Record<string, unknown>) ?? null,
      }))
    )
    .onConflictDoUpdate({
      target: messagesTable.id,
      set: {
        parts: sql`excluded.parts`,
        metadata: sql`excluded.metadata`,
      },
    })
}

/**
 * Retrieves chat messages by chatId ordered by creation time.
 */
export async function getMessagesByChatId(chatId: string) {
  return db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.chatId, chatId))
    .orderBy(asc(messagesTable.createdAt))
}

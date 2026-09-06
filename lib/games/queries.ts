import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"

import { db, games, type Game } from "@/lib/db"

export type { Game }

export async function listGames(): Promise<Game[]> {
  const { orgId } = await auth()

  if (!orgId) {
    return []
  }

  return await db
    .select()
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(desc(games.createdAt))
}

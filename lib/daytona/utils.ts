import path from "node:path"
import { DaytonaError } from "@daytona/sdk"
import { eq } from "drizzle-orm"
import { daytona } from "./client"
import { db, games } from "@/lib/db"

export const GAME_DIR = process.env.GAME_DIR || "/home/daytona/game"

/**
 * Creates a Daytona sandbox for a game, seeds $GAME_DIR/index.html
 * with "New game", and stores the sandboxId on the game record.
 */
export async function createGameSandbox(id: string) {
  const gameDir = process.env.GAME_DIR || "/home/daytona/game"

  // Check if a sandbox is already assigned to this game
  const [existingGame] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, id))
    .limit(1)

  if (existingGame?.sandboxId) {
    try {
      return await daytona.get(existingGame.sandboxId)
    } catch (error) {
      // If retrieval fails (e.g., sandbox was deleted or not found), create a new one
      if (error instanceof DaytonaError) {
        console.warn(
          `Sandbox ${existingGame.sandboxId} not found, creating a new one:`,
          error.message
        )
      } else {
        throw error
      }
    }
  }

  // 1. Create the sandbox
  const sandbox = await daytona.create({
    labels: { gameId: id },
  })

  // 2. Seed index.html in the official game directory
  try {
    await sandbox.fs.createFolder(gameDir, "755")
  } catch {
    try {
      await sandbox.process.executeCommand(`mkdir -p ${gameDir}`)
    } catch {
      // Ignore if directory already exists
    }
  }

  const indexPath = path.posix.join(gameDir, "index.html")
  await sandbox.fs.uploadFile(Buffer.from("New game"), indexPath)

  // 3. Save the sandboxId on the game record
  await db
    .update(games)
    .set({
      sandboxId: sandbox.id,
      updatedAt: new Date(),
    })
    .where(eq(games.id, id))

  return sandbox
}

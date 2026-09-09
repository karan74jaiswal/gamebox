import path from "node:path"
import type { Sandbox } from "@daytona/sdk"
import { eq } from "drizzle-orm"
import { daytona } from "./client"
import { db, games } from "@/lib/db"
import {
  getRuntimeSeedData,
  getRuntimeDir,
  getRuntimeEntries,
  type RuntimeEntry,
  type RuntimeFolder,
  type RuntimeFile,
  type RuntimeSeedData,
} from "./seed"

export {
  getRuntimeDir,
  getRuntimeEntries,
  getRuntimeSeedData,
  type RuntimeEntry,
  type RuntimeFolder,
  type RuntimeFile,
  type RuntimeSeedData,
}

export const GAME_DIR = process.env.GAME_DIR || "/home/daytona/game"
export const PREVIEW_PORT = 3000
export const PREVIEW_URL_TTL_SECONDS = 3600
export const START_RETRIES = 10
export const SERVER_LOG = "/tmp/game-server.log"

/**
 * Checks if an HTTP server inside the sandbox is actively responding on the given port.
 */
export async function serverResponds(
  sandbox: Sandbox,
  retries: number = 0,
  port: number = PREVIEW_PORT
): Promise<boolean> {
  try {
    const { exitCode } = await sandbox.process.executeCommand(
      `curl -fsS -o /dev/null --max-time 2 --retry ${retries} --retry-connrefused --retry-delay 1 http://localhost:${port}/`
    )

    return exitCode === 0
  } catch (error) {
    console.warn(`Health check on port ${port} failed:`, error)
    return false
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Retrieves the Daytona sandbox for a game by gameId, ensuring it is created and started.
 * Throws an error if the game does not exist.
 * If the game exists but sandboxId does not exist, creates a sandbox using createGameSandbox and returns it.
 * If both exist, retrieves the sandbox using daytona.get, ensures it is started, and returns it.
 */
export async function getGameSandbox(gameId: string): Promise<Sandbox> {
  if (!UUID_REGEX.test(gameId)) {
    throw new Error(`Game not found: ${gameId}`)
  }

  const [game] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) {
    throw new Error(`Game not found: ${gameId}`)
  }

  if (!game.sandboxId) {
    return await createGameSandbox(gameId)
  }

  const sandbox = await daytona.get(game.sandboxId)
  if (sandbox.state !== "started") {
    await daytona.start(sandbox, 60)
  }
  return sandbox
}

/**
 * Starts an HTTP server inside the sandbox serving $GAME_DIR/index.html.
 * Performs a health-check first to avoid starting duplicate server instances.
 */
export async function startGameServer(
  sandboxId: string,
  port: number = PREVIEW_PORT
): Promise<Sandbox> {
  const sandbox = await daytona.get(sandboxId)

  if (sandbox.state !== "started") await sandbox.start()

  if (!(await serverResponds(sandbox))) {
    // Start Python 3 HTTP server in background logging to SERVER_LOG
    await sandbox.process.executeCommand(
      `nohup python3 -m http.server ${port} --directory ${GAME_DIR} > ${SERVER_LOG} 2>&1 &`
    )

    if (!(await serverResponds(sandbox, START_RETRIES))) {
      const log = await sandbox.process.executeCommand(`cat ${SERVER_LOG}`)

      throw new Error(
        `Game server failed to start in sandbox ${sandboxId}: ${log.result.trim() || "no output"}`
      )
    }
  }
  return sandbox
}
/**
 * Creates a Daytona sandbox for a game, seeds $GAME_DIR with all files,
 * folders, and subfolders from lib/games/runtime/*, and stores the sandboxId on the game record.
 */
export async function createGameSandbox(id: string): Promise<Sandbox> {
  // 1. Create the sandbox
  const sandbox = await daytona.create({
    labels: { gameId: id },
  })

  // 2. Ensure official game directory exists
  try {
    await sandbox.fs.createFolder(GAME_DIR, "755")
  } catch {
    try {
      await sandbox.process.executeCommand(`mkdir -p ${GAME_DIR}`)
    } catch {
      // Ignore if directory already exists
    }
  }

  // 3. Seed all files, folders, and subfolders from runtime/*
  const { folders, files } = await getRuntimeSeedData()

  // Create all folders and subfolders first (sorted shallowest to deepest)
  for (const folder of folders) {
    const remoteFolderPath = path.posix.join(GAME_DIR, folder.relativePath)
    try {
      await sandbox.fs.createFolder(remoteFolderPath, "755")
    } catch {
      try {
        await sandbox.process.executeCommand(`mkdir -p "${remoteFolderPath}"`)
      } catch {
        // Ignore if directory already exists
      }
    }
  }

  // Upload all files into the sandbox
  for (const file of files) {
    const remoteFilePath = path.posix.join(GAME_DIR, file.relativePath)
    const parentDir = path.posix.dirname(remoteFilePath)

    if (parentDir !== GAME_DIR) {
      try {
        await sandbox.fs.createFolder(parentDir, "755")
      } catch {
        try {
          await sandbox.process.executeCommand(`mkdir -p "${parentDir}"`)
        } catch {
          // Ignore
        }
      }
    }

    const content = await file.read()
    await sandbox.fs.uploadFile(content, remoteFilePath)
  }

  // Fallback if no files were found in runtime directory
  if (files.length === 0) {
    const indexPath = path.posix.join(GAME_DIR, "index.html")
    await sandbox.fs.uploadFile(Buffer.from("New game"), indexPath)
  }

  // 4. Save the sandboxId on the game record
  await db
    .update(games)
    .set({
      sandboxId: sandbox.id,
      updatedAt: new Date(),
    })
    .where(eq(games.id, id))

  return sandbox
}

export const createSandbox = createGameSandbox

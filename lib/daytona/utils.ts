import path from "node:path"
import { DaytonaError, DaytonaNotFoundError, type Sandbox } from "@daytona/sdk"
import { eq } from "drizzle-orm"
import * as Sentry from "@sentry/nextjs"
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
    Sentry.logger.warn("Sandbox server health check failed", {
      port,
      error: error instanceof Error ? error.message : String(error),
    })
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
    Sentry.logger.warn("Invalid gameId provided to getGameSandbox", { gameId })
    throw new Error(`Game not found: ${gameId}`)
  }

  Sentry.logger.info("Resolving game sandbox", { gameId })

  const [game] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) {
    Sentry.logger.error("Game not found in database for sandbox retrieval", {
      gameId,
    })
    throw new Error(`Game not found: ${gameId}`)
  }

  if (!game.sandboxId) {
    return await createGameSandbox(gameId)
  }

  try {
    const sandbox = await daytona.get(game.sandboxId)
    if (sandbox.state !== "started") {
      Sentry.logger.info("Starting existing sandbox", {
        gameId,
        sandboxId: game.sandboxId,
      })
      await daytona.start(sandbox, 60)
    }
    return sandbox
  } catch (error) {
    Sentry.logger.error("Failed to retrieve or start existing sandbox", {
      gameId,
      sandboxId: game.sandboxId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Starts an HTTP server inside the sandbox serving $GAME_DIR/index.html.
 * Performs a health-check first to avoid starting duplicate server instances.
 */
export async function startGameServer(
  sandboxId: string,
  port: number = PREVIEW_PORT
): Promise<Sandbox> {
  Sentry.logger.info("Starting sandbox game server", { sandboxId, port })
  try {
    const sandbox = await daytona.get(sandboxId)

    if (sandbox.state !== "started") await sandbox.start()

    if (!(await serverResponds(sandbox))) {
      // Start Python 3 HTTP server in background logging to SERVER_LOG
      await sandbox.process.executeCommand(
        `nohup python3 -m http.server ${port} --directory ${GAME_DIR} > ${SERVER_LOG} 2>&1 &`
      )

      if (!(await serverResponds(sandbox, START_RETRIES))) {
        const log = await sandbox.process.executeCommand(`cat ${SERVER_LOG}`)
        const errorMsg = log.result.trim() || "no output"
        Sentry.logger.error(
          "Sandbox game server failed to start after retries",
          {
            sandboxId,
            port,
            error: errorMsg,
          }
        )

        throw new Error(
          `Game server failed to start in sandbox ${sandboxId}: ${errorMsg}`
        )
      }
    }

    Sentry.logger.info("Sandbox game server is running", { sandboxId, port })
    return sandbox
  } catch (error) {
    Sentry.logger.error("Error during startGameServer execution", {
      sandboxId,
      port,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Seeds $GAME_DIR with all files, folders, and subfolders from lib/games/runtime/*
 * Used as a fallback when a pre-built snapshot is not available.
 */
export async function seedSandboxFiles(sandbox: Sandbox): Promise<void> {
  // Ensure official game directory exists
  try {
    await sandbox.fs.createFolder(GAME_DIR, "755")
  } catch {
    try {
      await sandbox.process.executeCommand(`mkdir -p ${GAME_DIR}`)
    } catch {
      // Ignore if directory already exists
    }
  }

  // Seed all files, folders, and subfolders from runtime/*
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
}

export const DEFAULT_DAYTONA_SNAPSHOT = "gamebox-runtime-v1"

/**
 * Creates a Daytona sandbox for a game.
 * Uses a pre-built snapshot (e.g. gamebox-runtime-v1) if available for ~2.5s fast boot with zero file uploads.
 * If the snapshot is not found or fails, falls back gracefully to daytona-small + in-app seeding.
 * Stores the sandboxId on the game record and kicks off the background web server proactively.
 */
export async function createGameSandbox(id: string): Promise<Sandbox> {
  const snapshotName =
    process.env.DAYTONA_SNAPSHOT_NAME || DEFAULT_DAYTONA_SNAPSHOT
  Sentry.logger.info("Creating Daytona game sandbox", { gameId: id, snapshotName })

  try {
    let sandbox: Sandbox | null = null
    let preSeeded = false

    if (snapshotName) {
      try {
        sandbox = await daytona.create({
          snapshot: snapshotName,
          labels: { gameId: id },
        })
        preSeeded = true
        Sentry.logger.info("Daytona game sandbox created from snapshot", {
          gameId: id,
          sandboxId: sandbox.id,
          snapshot: snapshotName,
        })
      } catch (snapErr) {
        Sentry.logger.warn(
          "Snapshot creation failed or snapshot not found, falling back to daytona-small with in-app seed",
          {
            snapshotName,
            error: snapErr instanceof Error ? snapErr.message : String(snapErr),
          }
        )
      }
    }

    if (!sandbox) {
      // Fallback: create base daytona-small container and seed files manually
      sandbox = await daytona.create({
        snapshot: "daytona-small",
        labels: { gameId: id },
      })
    }

    if (!preSeeded) {
      await seedSandboxFiles(sandbox)
      Sentry.logger.info("Daytona game sandbox seeded via fallback", {
        gameId: id,
        sandboxId: sandbox.id,
      })
    }

    // Save the sandboxId on the game record
    await db
      .update(games)
      .set({
        sandboxId: sandbox.id,
        updatedAt: new Date(),
      })
      .where(eq(games.id, id))

    // Proactively start the game server in background
    try {
      await sandbox.process.executeCommand(
        `nohup python3 -m http.server ${PREVIEW_PORT} --directory ${GAME_DIR} > ${SERVER_LOG} 2>&1 &`
      )
    } catch (serverErr) {
      Sentry.logger.warn(
        "Proactive server start warning (will retry on preview mount)",
        {
          sandboxId: sandbox.id,
          error:
            serverErr instanceof Error ? serverErr.message : String(serverErr),
        }
      )
    }

    return sandbox
  } catch (error) {
    Sentry.logger.error("Failed to create Daytona game sandbox", {
      gameId: id,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export const createSandbox = createGameSandbox


/**
 * Deletes the Daytona sandbox(es) associated with a game.
 * First deletes the primary sandbox by sandboxId if present,
 * and also sweeps for any stray sandboxes labeled with this gameId to ensure
 * no stray sandboxes remain.
 */
export async function deleteGameSandbox(
  gameId: string,
  sandboxId?: string | null
): Promise<void> {
  const deletedSandboxIds = new Set<string>()

  if (sandboxId) {
    try {
      Sentry.logger.info("Deleting Daytona sandbox by ID", { gameId, sandboxId })
      const sandbox = await daytona.get(sandboxId)
      await sandbox.delete()
      deletedSandboxIds.add(sandboxId)
      Sentry.logger.info("Daytona sandbox deleted successfully", {
        gameId,
        sandboxId,
      })
    } catch (error) {
      if (error instanceof DaytonaNotFoundError) {
        Sentry.logger.info("Daytona sandbox already deleted or not found", {
          gameId,
          sandboxId,
        })
      } else if (error instanceof DaytonaError) {
        Sentry.logger.warn("Daytona error deleting sandbox by ID", {
          gameId,
          sandboxId,
          error: error.message,
          statusCode: error.statusCode,
        })
      } else {
        Sentry.logger.warn("Unexpected error deleting Daytona sandbox by ID", {
          gameId,
          sandboxId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  // Sweep for any stray sandboxes labeled with this gameId
  try {
    for await (const sandbox of daytona.list({ labels: { gameId } })) {
      if (!deletedSandboxIds.has(sandbox.id)) {
        try {
          Sentry.logger.info("Deleting stray Daytona sandbox with gameId label", {
            gameId,
            sandboxId: sandbox.id,
          })
          await sandbox.delete()
          deletedSandboxIds.add(sandbox.id)
        } catch (error) {
          if (error instanceof DaytonaNotFoundError) {
            // Already removed
          } else if (error instanceof DaytonaError) {
            Sentry.logger.warn("Daytona error deleting stray sandbox", {
              gameId,
              sandboxId: sandbox.id,
              error: error.message,
            })
          } else {
            Sentry.logger.warn("Unexpected error deleting stray sandbox", {
              gameId,
              sandboxId: sandbox.id,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }
    }
  } catch (error) {
    Sentry.logger.warn("Failed to list sandboxes for cleanup", {
      gameId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

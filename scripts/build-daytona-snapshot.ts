import path from "node:path"
import { config } from "dotenv"
import { Daytona } from "@daytona/sdk"
import { getRuntimeSeedData } from "../lib/games/seed"

// Load environment variables from .env.local and .env
config({ path: path.resolve(process.cwd(), ".env.local") })
config({ path: path.resolve(process.cwd(), ".env") })

const SNAPSHOT_NAME = process.env.DAYTONA_SNAPSHOT_NAME || "gamebox-runtime-v1"
const BASE_SNAPSHOT = process.env.DAYTONA_BASE_SNAPSHOT || "daytona-small"
const GAME_DIR = process.env.GAME_DIR || "/home/daytona/game"

async function buildSnapshot() {
  if (!process.env.DAYTONA_API_KEY) {
    console.error("❌ DAYTONA_API_KEY environment variable is missing.")
    console.error(
      "Please set DAYTONA_API_KEY in .env.local or your shell environment."
    )
    process.exit(1)
  }

  console.log("=======================================================")
  console.log(`🚀 Building Daytona Snapshot: ${SNAPSHOT_NAME}`)
  console.log(`📦 Base Snapshot: ${BASE_SNAPSHOT}`)
  console.log(`📂 Target Game Directory: ${GAME_DIR}`)
  console.log("=======================================================\n")

  const daytona = new Daytona()

  // 1. Check if snapshot already exists
  try {
    const existing = await daytona.snapshot.get(SNAPSHOT_NAME)
    if (existing) {
      console.log(
        `⚠️ Snapshot '${SNAPSHOT_NAME}' already exists (state: ${existing.state}).`
      )
      console.log(
        "To rebuild, either delete it first via Daytona dashboard or specify a new DAYTONA_SNAPSHOT_NAME."
      )
      return
    }
  } catch {
    // Expected when snapshot does not yet exist
  }

  console.log(`Step 1/5: Launching builder sandbox from '${BASE_SNAPSHOT}'...`)
  const sandbox = await daytona.create({
    snapshot: BASE_SNAPSHOT,
    labels: { role: "snapshot-builder", target: SNAPSHOT_NAME },
  })
  console.log(` Builder sandbox created (ID: ${sandbox.id})`)

  try {
    console.log(`\nStep 2/5: Ensuring ${GAME_DIR} exists...`)
    try {
      await sandbox.fs.createFolder(GAME_DIR, "755")
    } catch {
      await sandbox.process.executeCommand(`mkdir -p "${GAME_DIR}"`)
    }

    console.log("\nStep 3/5: Seeding runtime files from lib/games/runtime...")
    const { folders, files } = await getRuntimeSeedData()

    for (const folder of folders) {
      const remoteFolder = path.posix.join(GAME_DIR, folder.relativePath)
      try {
        await sandbox.fs.createFolder(remoteFolder, "755")
      } catch {
        await sandbox.process.executeCommand(`mkdir -p "${remoteFolder}"`)
      }
    }

    let uploaded = 0
    for (const file of files) {
      const remoteFile = path.posix.join(GAME_DIR, file.relativePath)
      const content = await file.read()
      await sandbox.fs.uploadFile(content, remoteFile)
      uploaded++
      process.stdout.write(`\r Uploaded ${uploaded}/${files.length} files...`)
    }
    console.log(`\n All ${files.length} runtime files seeded successfully.`)

    console.log("\nStep 4/5: Stopping sandbox for cold snapshot capture...")
    await sandbox.stop()
    console.log(" Sandbox stopped.")

    console.log(`\nStep 5/5: Capturing snapshot '${SNAPSHOT_NAME}'...`)
    await sandbox.createSnapshot(SNAPSHOT_NAME, 120)
    console.log(`🎉 Snapshot '${SNAPSHOT_NAME}' created and active!`)

    console.log("\n=======================================================")
    console.log(`✅ SUCCESS: Daytona Snapshot '${SNAPSHOT_NAME}' is ready!`)
    console.log(
      "Future sandboxes will now boot in ~2.5s with zero file uploads."
    )
    console.log(
      `Set DAYTONA_SNAPSHOT_NAME=${SNAPSHOT_NAME} in your production environment.`
    )
    console.log("=======================================================")
  } catch (error) {
    console.error("\n❌ Failed to build snapshot:", error)
    throw error
  } finally {
    console.log(`\nCleaning up builder sandbox (${sandbox.id})...`)
    try {
      await sandbox.delete()
      console.log(" Builder sandbox deleted.")
    } catch (cleanupErr) {
      console.warn(" Failed to delete builder sandbox:", cleanupErr)
    }
  }
}

buildSnapshot().catch(() => process.exit(1))

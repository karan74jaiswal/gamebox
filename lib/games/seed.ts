import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_GAME_DIR = process.env.GAME_DIR || "/home/daytona/game"

export interface RuntimeEntry {
  relativePath: string
  fullPath: string
  isDirectory: boolean
}

export interface RuntimeFolder {
  relativePath: string
  fullPath: string
}

export interface RuntimeFile {
  relativePath: string
  fullPath: string
  read: () => Promise<Buffer>
  readText: (encoding?: BufferEncoding) => Promise<string>
}

export interface RuntimeSeedData {
  runtimeDir: string
  folders: RuntimeFolder[]
  files: RuntimeFile[]
  entries: RuntimeEntry[]
}

/**
 * Resolves the path to the lib/games/runtime directory containing seeded runtime template files.
 */
export function getRuntimeDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(currentDir, "runtime"),
    path.resolve(process.cwd(), "lib/games/runtime"),
    path.resolve(currentDir, "../games/runtime"),
    path.resolve(process.cwd(), "runtime"),
  ]

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate
      }
    } catch {
      // Continue searching
    }
  }

  return path.resolve(process.cwd(), "lib/games/runtime")
}

/**
 * Recursively scans the runtime directory and returns all files, folders, and subfolders.
 */
export async function getRuntimeEntries(
  baseDir: string = getRuntimeDir(),
  currentRelativeDir: string = ""
): Promise<RuntimeEntry[]> {
  const currentDir = currentRelativeDir
    ? path.join(baseDir, currentRelativeDir)
    : baseDir

  try {
    if (!fs.existsSync(currentDir)) {
      return []
    }
  } catch {
    return []
  }

  const entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
  const results: RuntimeEntry[] = []

  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue

    const entryRelPath = currentRelativeDir
      ? `${currentRelativeDir}/${entry.name}`
      : entry.name
    const entryFullPath = path.join(currentDir, entry.name)

    if (entry.isDirectory()) {
      results.push({
        relativePath: entryRelPath,
        fullPath: entryFullPath,
        isDirectory: true,
      })
      const subEntries = await getRuntimeEntries(baseDir, entryRelPath)
      results.push(...subEntries)
    } else if (entry.isFile()) {
      results.push({
        relativePath: entryRelPath,
        fullPath: entryFullPath,
        isDirectory: false,
      })
    }
  }

  return results
}

/**
 * Retrieves structured runtime files, folders, and subfolders ready for seeding into a sandbox.
 * Folders are sorted shallowest to deepest so parent directories are always created before children.
 */
export async function getRuntimeSeedData(
  baseDir?: string
): Promise<RuntimeSeedData> {
  const runtimeDir = baseDir ?? getRuntimeDir()
  const entries = await getRuntimeEntries(runtimeDir)

  // Folders sorted shallowest to deepest (parents before children)
  const folders: RuntimeFolder[] = entries
    .filter((e) => e.isDirectory)
    .sort(
      (a, b) =>
        a.relativePath.split("/").length - b.relativePath.split("/").length
    )
    .map((e) => ({
      relativePath: e.relativePath,
      fullPath: e.fullPath,
    }))

  const files: RuntimeFile[] = entries
    .filter((e) => !e.isDirectory)
    .map((e) => ({
      relativePath: e.relativePath,
      fullPath: e.fullPath,
      read: () => fs.promises.readFile(e.fullPath),
      readText: (encoding: BufferEncoding = "utf-8") =>
        fs.promises.readFile(e.fullPath, encoding),
    }))

  return {
    runtimeDir,
    folders,
    files,
    entries,
  }
}

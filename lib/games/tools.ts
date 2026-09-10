import path from "node:path"
import { tool } from "ai"
import { z } from "zod"
import { locals } from "@trigger.dev/sdk"
import type { Sandbox } from "@daytona/sdk"
import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"

/**
 * Context locals for storing active chat ID and cached sandbox instance during a run.
 */
export const activeChatIdKey = locals.create<string>("gamebox.activeChatId")
export const activeSandboxKey = locals.create<Sandbox>("gamebox.activeSandbox")

/**
 * Sets the active game chat context for the current run or turn.
 */
export function setGameChatContext(chatId: string, sandbox?: Sandbox): void {
  locals.set(activeChatIdKey, chatId)
  if (sandbox) {
    locals.set(activeSandboxKey, sandbox)
  }
}

/**
 * Resolves the active Daytona sandbox instance for the current execution context.
 * Checks the cached sandbox in locals first, then resolves via chatId if available.
 */
export async function getActiveGameSandbox(
  chatIdParam?: string
): Promise<Sandbox> {
  const cachedSandbox = locals.get(activeSandboxKey)
  if (cachedSandbox) {
    return cachedSandbox
  }

  const chatId = chatIdParam || locals.get(activeChatIdKey)
  if (!chatId) {
    throw new Error(
      "No active game chat session found for tool execution. Ensure setGameChatContext(chatId) is called."
    )
  }

  const sandbox = await getGameSandbox(chatId)
  locals.set(activeSandboxKey, sandbox)
  return sandbox
}

/**
 * Resolves and strictly confines a target path within the sandbox GAME_DIR (/home/daytona/game).
 * Prevents directory traversal attacks and normalizes relative or absolute paths.
 */
export function resolveGamePath(
  targetPath: string,
  baseDir: string = GAME_DIR
): { fullPath: string; relativePath: string } {
  if (!targetPath || typeof targetPath !== "string" || !targetPath.trim()) {
    throw new Error("Path must be a non-empty string.")
  }

  const normalizedGameDir = path.posix.normalize(baseDir)
  // Normalize Windows-style backslashes to forward slashes
  const sanitized = targetPath.trim().replace(/\\/g, "/")

  let candidate: string

  if (path.posix.isAbsolute(sanitized)) {
    if (
      sanitized === normalizedGameDir ||
      sanitized.startsWith(normalizedGameDir + "/")
    ) {
      candidate = path.posix.normalize(sanitized)
    } else if (sanitized === "/game" || sanitized.startsWith("/game/")) {
      candidate = path.posix.normalize(
        path.posix.join(normalizedGameDir, sanitized.replace(/^\/game\/?/, ""))
      )
    } else {
      // Treat leading slash as relative to the game root (e.g. "/index.html" -> "/home/daytona/game/index.html")
      candidate = path.posix.normalize(
        path.posix.join(normalizedGameDir, sanitized.replace(/^\/+/, ""))
      )
    }
  } else {
    candidate = path.posix.normalize(
      path.posix.join(normalizedGameDir, sanitized)
    )
  }

  // Strict boundary check: candidate must be equal to or inside normalizedGameDir
  if (
    candidate !== normalizedGameDir &&
    !candidate.startsWith(normalizedGameDir + "/")
  ) {
    throw new Error(
      `Access denied: "${targetPath}" resolves to "${candidate}", which escapes the sandbox game directory (${normalizedGameDir}).`
    )
  }

  const rel = path.posix.relative(normalizedGameDir, candidate) || "."
  return {
    fullPath: candidate,
    relativePath: rel,
  }
}

// ==========================================
// Schemas
// ==========================================

export const writeFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file inside the game directory (e.g., 'index.html', 'js/game.js', 'css/style.css')"
    ),
  content: z.string().describe("Initial text content to write to the file"),
})

export const updateFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file inside the game directory (e.g., 'index.html', 'js/game.js', 'css/style.css')"
    ),
  content: z
    .string()
    .describe("The updated complete or revised content to write to the file"),
})

export const replaceTextInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file inside the game directory (e.g., 'index.html', 'js/game.js')"
    ),
  oldText: z
    .string()
    .optional()
    .describe("The exact text or code snippet in the file to replace"),
  old_text: z.string().optional().describe("Alias for oldText"),
  newText: z.string().optional().describe("The replacement text to insert"),
  new_text: z.string().optional().describe("Alias for newText"),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      "Whether to replace all occurrences of oldText. Defaults to false (replaces first occurrence)."
    ),
})

export const readFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file inside the game directory to read (e.g., 'index.html', 'js/game.js')"
    ),
})

export const listFilesInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Subdirectory path relative to the game directory to list (e.g., '.', 'js', 'assets'). Defaults to '.' (root game directory)."
    ),
  recursive: z
    .boolean()
    .optional()
    .describe(
      "Whether to recursively list files across subdirectories. Defaults to true."
    ),
})

export const deleteFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file or directory inside the game directory to delete (e.g., 'js/old.js', 'temp.txt')"
    ),
  recursive: z
    .boolean()
    .optional()
    .describe(
      "Whether to delete recursively if the path is a directory. Defaults to false."
    ),
})

export const GAME_DIMENSIONS = [
  "loop",
  "goal",
  "world",
  "look",
  "feel",
  "challenge",
  "controls",
] as const

export const gameDimensionEnum = z
  .enum(GAME_DIMENSIONS)
  .describe(
    [
      "The aspect of the game to clarify: ",
      " - loop : (core gameplay mechanics, rules, and minute-to-minute interaction), ",
      " - goal : (objectives, win/loss conditions, progression, and scoring), ",
      " - world : (setting, theme, narrative, and atmosphere), ",
      " - look : (visual style, color palette, camera perspective, and aesthetics), ",
      " - feel : (game feel, physics tuning, audio/SFX/BGM, particle juice, and tactile feedback), ",
      " - challenge : (difficulty curve, enemy AI behaviors, obstacles, hazard pacing, and fail states), or ",
      " - controls : (input schemes, keyboard/mouse/touch mapping, responsiveness, and camera controls).",
    ].join("\n")
  )

export type GameDimension = z.infer<typeof gameDimensionEnum>

export const askPlayerOptionSchema = z.object({
  id: z
    .string()
    .describe(
      "Unique identifier for this option (e.g. 'survival-loop', 'retro-cyberpunk')"
    ),
  label: z
    .string()
    .describe("Short, human-readable label displayed on the option button"),
  description: z
    .string()
    .describe("Concise explanation of what choosing this option entails"),
})

export type AskPlayerOption = z.infer<typeof askPlayerOptionSchema>

export const askPlayerInputSchema = z.object({
  dimension: gameDimensionEnum.describe(
    "Select the game dimension first to anchor the question before writing it"
  ),
  question: z
    .string()
    .describe(
      "The clarifying question to ask the player about this game dimension"
    ),
  options: z
    .array(askPlayerOptionSchema)
    .min(2)
    .max(4)
    .describe("2 to 4 distinct options for the player to choose from"),
})

export type AskPlayerInput = z.infer<typeof askPlayerInputSchema>

export const askPlayerOutputSchema = z.object({
  id: z.string().describe("The chosen option's id"),
  label: z.string().describe("The chosen option's label"),
})

export type AskPlayerOutput = z.infer<typeof askPlayerOutputSchema>

// ==========================================
// Tool Implementations
// ==========================================

/**
 * Factory that creates a toolset bound to an optional explicit sandbox or chatId,
 * or falling back to the active context from locals.
 */
export function createGameTools(chatIdOrSandbox?: string | Sandbox) {
  const resolveSandbox = async (): Promise<Sandbox> => {
    if (chatIdOrSandbox && typeof chatIdOrSandbox === "object") {
      return chatIdOrSandbox
    }
    return getActiveGameSandbox(
      typeof chatIdOrSandbox === "string" ? chatIdOrSandbox : undefined
    )
  }

  const write_file = tool({
    description:
      "Create a new file or initial code scaffold inside the Daytona sandbox game directory (/home/daytona/game). Parent directories are created automatically if needed. Keep initial files concise; do NOT write massive files all at once. Use update_file and replace_text for incremental expansion so progress is visible.",
    inputSchema: writeFileInputSchema,
    execute: async ({ path: filePath, content }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        const parentDir = path.posix.dirname(fullPath)
        const normalizedGameDir = path.posix.normalize(GAME_DIR)

        if (parentDir !== normalizedGameDir) {
          try {
            await sandbox.fs.createFolder(parentDir, "755")
          } catch {
            try {
              await sandbox.process.executeCommand(`mkdir -p "${parentDir}"`)
            } catch {
              // Ignore if directory already exists
            }
          }
        }

        await sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), fullPath)

        const bytes = Buffer.byteLength(content, "utf-8")
        return {
          success: true,
          path: relativePath,
          bytes,
          message: `Successfully wrote ${relativePath} (${bytes} bytes).`,
        }
      } catch (error) {
        return {
          success: false,
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })

  const update_file = tool({
    description:
      "Update an existing file inside the Daytona sandbox game directory (/home/daytona/game) with new or expanded content. Use this to iteratively build up game mechanics, add modules, or expand code step-by-step so the user sees continuous progress.",
    inputSchema: updateFileInputSchema,
    execute: async ({ path: filePath, content }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        const parentDir = path.posix.dirname(fullPath)
        const normalizedGameDir = path.posix.normalize(GAME_DIR)

        if (parentDir !== normalizedGameDir) {
          try {
            await sandbox.fs.createFolder(parentDir, "755")
          } catch {
            try {
              await sandbox.process.executeCommand(`mkdir -p "${parentDir}"`)
            } catch {
              // Ignore if directory already exists
            }
          }
        }

        await sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), fullPath)

        const bytes = Buffer.byteLength(content, "utf-8")
        return {
          success: true,
          path: relativePath,
          bytes,
          message: `Successfully updated ${relativePath} (${bytes} bytes).`,
        }
      } catch (error) {
        return {
          success: false,
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })

  const replace_text = tool({
    description:
      "Replace specific text or code snippets in an existing file inside the Daytona sandbox game directory. Use this for targeted edits, bug fixes, or modifying game logic without rewriting the whole file.",
    inputSchema: replaceTextInputSchema,
    execute: async ({
      path: filePath,
      oldText,
      old_text,
      newText,
      new_text,
      replaceAll,
    }) => {
      const targetOldText = oldText ?? old_text
      const targetNewText = newText ?? new_text

      if (targetOldText === undefined) {
        return {
          success: false,
          path: filePath,
          error: "Missing required parameter 'oldText' (or 'old_text').",
        }
      }

      if (targetNewText === undefined) {
        return {
          success: false,
          path: filePath,
          error: "Missing required parameter 'newText' (or 'new_text').",
        }
      }

      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        let existingContent: string
        try {
          const buffer = await sandbox.fs.downloadFile(fullPath)
          existingContent = buffer.toString("utf-8")
        } catch (error) {
          return {
            success: false,
            path: relativePath,
            error: `File '${relativePath}' could not be read: ${error instanceof Error ? error.message : String(error)}`,
          }
        }

        if (!existingContent.includes(targetOldText)) {
          return {
            success: false,
            path: relativePath,
            error: `oldText not found in '${relativePath}'. Please use read_file to inspect the file's current contents and check formatting.`,
          }
        }

        let updatedContent: string
        let count = 0

        if (replaceAll) {
          count = existingContent.split(targetOldText).length - 1
          updatedContent = existingContent
            .split(targetOldText)
            .join(targetNewText)
        } else {
          count = 1
          updatedContent = existingContent.replace(targetOldText, targetNewText)
        }

        await sandbox.fs.uploadFile(
          Buffer.from(updatedContent, "utf-8"),
          fullPath
        )

        return {
          success: true,
          path: relativePath,
          occurrencesReplaced: count,
          message: `Successfully replaced ${count} occurrence(s) in ${relativePath}.`,
        }
      } catch (error) {
        return {
          success: false,
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })

  const read_file = tool({
    description:
      "Read the contents of a file inside the Daytona sandbox game directory. Use this to inspect existing code, styles, or configuration before making modifications or when debugging.",
    inputSchema: readFileInputSchema,
    execute: async ({ path: filePath }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        const buffer = await sandbox.fs.downloadFile(fullPath)
        const content = buffer.toString("utf-8")

        return {
          success: true,
          path: relativePath,
          content,
        }
      } catch (error) {
        return {
          success: false,
          path: filePath,
          error: `Failed to read '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  })

  const list_files = tool({
    description:
      "List files and directories inside the Daytona sandbox game directory. Use this to explore the project structure and discover existing files and assets.",
    inputSchema: listFilesInputSchema,
    execute: async ({ path: dirPath = ".", recursive = true }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(dirPath)
        const sandbox = await resolveSandbox()

        const depth = recursive ? 5 : 1
        const fileEntries = await sandbox.fs.listFiles(fullPath, { depth })

        const normalizedGameDir = path.posix.normalize(GAME_DIR)

        const files = (fileEntries || []).map((entry) => {
          const entryPath = entry.path || path.posix.join(fullPath, entry.name)
          const relPath = path.posix.isAbsolute(entryPath)
            ? path.posix.relative(normalizedGameDir, entryPath)
            : entryPath

          return {
            name: entry.name,
            path: relPath || entry.name,
            isDir: Boolean(entry.isDir),
            size: entry.size ?? 0,
            modifiedAt: entry.modifiedAt || entry.modTime || "",
          }
        })

        // Sort directories first, then alphabetical by path
        files.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.path.localeCompare(b.path)
        })

        return {
          success: true,
          path: relativePath,
          count: files.length,
          files,
        }
      } catch (error) {
        return {
          success: false,
          path: dirPath,
          error: `Failed to list files in '${dirPath}': ${error instanceof Error ? error.message : String(error)}`,
          files: [],
        }
      }
    },
  })

  const delete_file = tool({
    description:
      "Delete a file or directory inside the Daytona sandbox game directory. Deleting the root game directory itself is not permitted.",
    inputSchema: deleteFileInputSchema,
    execute: async ({ path: filePath, recursive = false }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const normalizedGameDir = path.posix.normalize(GAME_DIR)

        if (fullPath === normalizedGameDir || relativePath === ".") {
          return {
            success: false,
            path: relativePath,
            error: "Deleting the root game directory is not permitted.",
          }
        }

        const sandbox = await resolveSandbox()
        await sandbox.fs.deleteFile(fullPath, recursive)

        return {
          success: true,
          path: relativePath,
          message: `Successfully deleted ${relativePath}.`,
        }
      } catch (error) {
        return {
          success: false,
          path: filePath,
          error: `Failed to delete '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  })

  const ask_player = tool({
    description:
      "Ask the player a clarifying question about a specific game dimension (loop, goal, world, look, feel, challenge, controls) with 2 to 4 options to guide game design decisions. Pauses execution until the player chooses an option in the UI.",
    inputSchema: askPlayerInputSchema,
    outputSchema: askPlayerOutputSchema,
  })

  return {
    write_file,
    update_file,
    replace_text,
    read_file,
    list_files,
    delete_file,
    ask_player,
  }
}

// Default static tool instances utilizing the active execution context
const defaultTools = createGameTools()

export const write_file = defaultTools.write_file
export const update_file = defaultTools.update_file
export const replace_text = defaultTools.replace_text
export const read_file = defaultTools.read_file
export const list_files = defaultTools.list_files
export const delete_file = defaultTools.delete_file
export const ask_player = defaultTools.ask_player

export const tools = {
  write_file,
  update_file,
  replace_text,
  read_file,
  list_files,
  delete_file,
  ask_player,
}

export const gameTools = tools
export default tools

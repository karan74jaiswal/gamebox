import path from "node:path"
import { tool } from "ai"
import { z } from "zod"
import { locals } from "@trigger.dev/sdk"
import type { Sandbox } from "@daytona/sdk"
import * as Sentry from "@sentry/node"
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
      "Relative path to the brand NEW file inside the game directory (e.g., 'index.html', 'js/player.js', 'css/style.css')"
    ),
  content: z
    .string()
    .max(18000)
    .describe(
      "Initial text content for the brand new file. Maximum 18,000 characters (~350-400 lines). Scaffold a lightweight starter foundation; modularize larger games into separate files in js/."
    ),
})

export const updateFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the existing file inside the game directory to update (e.g., 'index.html', 'js/game.js')"
    ),
  mode: z
    .enum(["replace_lines", "insert_at_line", "append", "prepend"])
    .describe(
      "The targeted update action to perform:\n" +
      "- 'replace_lines': Replaces an exact range of lines (from startLine to endLine) with new content.\n" +
      "- 'insert_at_line': Inserts new content immediately after targetLine.\n" +
      "- 'append': Appends new content to the very end of the file.\n" +
      "- 'prepend': Inserts new content at the very beginning (line 1) of the file."
    ),
  content: z
    .string()
    .max(12000)
    .describe(
      "The targeted new code snippet to insert or replace with (strictly under 150 lines / 12,000 characters). NEVER pass the entire file."
    ),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Required when mode is 'replace_lines': The 1-based start line number to replace."
    ),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Required when mode is 'replace_lines': The 1-based end line number to replace (inclusive, max 150 lines window)."
    ),
  targetLine: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Required when mode is 'insert_at_line': The 1-based line number after which to insert (use 0 to insert at the beginning)."
    ),
})

export const replaceTextInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the existing file inside the game directory (e.g., 'index.html', 'js/game.js')"
    ),
  oldText: z
    .string()
    .max(8000)
    .optional()
    .describe(
      "The exact existing text or code snippet in the file to replace (strictly under 100 lines / 8,000 characters). Must match the file content exactly, including whitespace."
    ),
  old_text: z
    .string()
    .max(8000)
    .optional()
    .describe("Alias for oldText"),
  newText: z
    .string()
    .max(8000)
    .optional()
    .describe(
      "The replacement text to insert (strictly under 100 lines / 8,000 characters)."
    ),
  new_text: z
    .string()
    .max(8000)
    .optional()
    .describe("Alias for newText"),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      "Whether to replace all occurrences of oldText. Defaults to false (replaces first occurrence only)."
    ),
})

export const readFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file inside the game directory to read (e.g., 'index.html', 'js/game.js')"
    ),
  startLine: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe(
      "The starting line number to read (1-indexed). Defaults to 1."
    ),
  lineCount: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(300)
    .describe(
      "The number of lines to read starting from startLine. Strictly between 1 and 500 lines (enforced by schema). Defaults to 300."
    ),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Optional alias for ending line. If provided without lineCount, lineCount will be calculated automatically."
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
      "Create a brand NEW file inside the Daytona sandbox game directory (/home/daytona/game). Strictly for new files that do not exist yet. Will return an error if the file already exists (use replace_text for surgical edits or update_file for major expansions).",
    inputSchema: writeFileInputSchema,
    execute: async ({ path: filePath, content }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        // Guard against overwriting existing files
        let fileExists = false
        try {
          const details = await sandbox.fs.getFileDetails(fullPath)
          if (details) {
            fileExists = true
          }
        } catch {
          // File does not exist, which is expected for write_file
        }

        if (fileExists) {
          return {
            success: false,
            path: relativePath,
            error: `File '${relativePath}' already exists. 'write_file' is strictly for creating NEW files. To modify this existing file, use 'replace_text' for surgical edits or 'update_file' for full rewrites.`,
          }
        }

        const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length
        if (lines > 400) {
          return {
            success: false,
            path: relativePath,
            error: `New file exceeds the 400-line limit (${lines} lines). Keep starter files concise (under 300 lines) to avoid output token exhaustion. Scaffold a working foundation first, then add features modularly or via targeted updates.`,
          }
        }

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
        Sentry.logger.info("Sandbox file written", {
          path: relativePath,
          bytes,
          lines,
        })
        return {
          success: true,
          path: relativePath,
          lines,
          bytes,
          message: `Successfully created ${relativePath} (${lines} lines, ${bytes} bytes).`,
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        Sentry.logger.error("Sandbox write_file failed", {
          path: filePath,
          error: errorMsg,
        })
        return {
          success: false,
          path: filePath,
          error: errorMsg,
        }
      }
    },
  })

  const update_file = tool({
    description:
      "Perform a targeted modification on an existing file inside the Daytona sandbox game directory (/home/daytona/game). Supports replacing a specific line range ('replace_lines'), inserting after a line ('insert_at_line'), appending to the end ('append'), or prepending ('prepend'). Strictly under 150 lines per update. NEVER pass the entire file.",
    inputSchema: updateFileInputSchema,
    execute: async ({
      path: filePath,
      mode,
      content,
      startLine,
      endLine,
      targetLine,
    }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        let existingContent: string
        try {
          const buffer = await sandbox.fs.downloadFile(fullPath)
          existingContent = buffer.toString("utf-8")
        } catch {
          return {
            success: false,
            path: relativePath,
            error: `File '${relativePath}' does not exist. 'update_file' is strictly for modifying existing files. Use 'write_file' to create new files first.`,
          }
        }

        const fileLines =
          existingContent.length === 0 ? [] : existingContent.split(/\r?\n/)
        const originalTotalLines = fileLines.length

        let updatedContent: string
        let linesAffected = 0

        if (mode === "append") {
          const separator =
            existingContent.endsWith("\n") || existingContent.length === 0
              ? ""
              : "\n"
          updatedContent = existingContent + separator + content
          linesAffected = content.split(/\r?\n/).length
        } else if (mode === "prepend") {
          const separator = content.endsWith("\n") ? "" : "\n"
          updatedContent = content + separator + existingContent
          linesAffected = content.split(/\r?\n/).length
        } else if (mode === "insert_at_line") {
          if (targetLine === undefined) {
            return {
              success: false,
              path: relativePath,
              error:
                "Missing required parameter 'targetLine' for mode 'insert_at_line'. Provide the 1-based line number after which to insert (use 0 for beginning of file).",
            }
          }
          const atLine = Math.max(0, Math.min(targetLine, originalTotalLines))
          const before = fileLines.slice(0, atLine)
          const after = fileLines.slice(atLine)
          const newLines = content.split(/\r?\n/)

          updatedContent = [...before, ...newLines, ...after].join("\n")
          linesAffected = newLines.length
        } else if (mode === "replace_lines") {
          if (startLine === undefined || endLine === undefined) {
            return {
              success: false,
              path: relativePath,
              error:
                "Missing required parameters 'startLine' and 'endLine' for mode 'replace_lines'. Use read_file to inspect line numbers first.",
            }
          }

          const reqStart = Math.min(startLine, endLine)
          const reqEnd = Math.max(startLine, endLine)

          if (reqStart > originalTotalLines) {
            return {
              success: false,
              path: relativePath,
              error: `startLine (${reqStart}) exceeds total lines in '${relativePath}' (${originalTotalLines} lines). Use read_file to inspect line numbers first.`,
            }
          }

          if (reqEnd - reqStart + 1 > 150) {
            return {
              success: false,
              path: relativePath,
              error: `Replacement window (${reqEnd - reqStart + 1} lines) exceeds maximum limit of 150 lines. Keep targeted edits concise to prevent token overconsumption.`,
            }
          }

          const effectiveStart = Math.max(1, reqStart)
          const effectiveEnd = Math.min(reqEnd, originalTotalLines)

          const before = fileLines.slice(0, effectiveStart - 1)
          const after = fileLines.slice(effectiveEnd)
          const newLines = content.split(/\r?\n/)

          updatedContent = [...before, ...newLines, ...after].join("\n")
          linesAffected = newLines.length
        } else {
          return {
            success: false,
            path: relativePath,
            error: `Invalid mode '${mode}'. Must be 'replace_lines', 'insert_at_line', 'append', or 'prepend'.`,
          }
        }

        await sandbox.fs.uploadFile(
          Buffer.from(updatedContent, "utf-8"),
          fullPath
        )

        const newTotalLines = updatedContent.split(/\r?\n/).length
        const bytes = Buffer.byteLength(updatedContent, "utf-8")

        Sentry.logger.info("Sandbox file updated", {
          path: relativePath,
          mode,
          linesAffected,
          newTotalLines,
          bytes,
        })

        return {
          success: true,
          path: relativePath,
          mode,
          linesAffected,
          newTotalLines,
          bytes,
          message: `Successfully updated ${relativePath} (${mode}: ${linesAffected} line(s) affected, total ${newTotalLines} lines).`,
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        Sentry.logger.error("Sandbox update_file failed", {
          path: filePath,
          error: errorMsg,
        })
        return {
          success: false,
          path: filePath,
          error: errorMsg,
        }
      }
    },
  })

  const replace_text = tool({
    description:
      "Surgically replace a specific text snippet in an existing file inside the Daytona sandbox game directory (/home/daytona/game). HIGHEST PRIORITY for small targeted edits (under 100 lines / 8,000 characters), tuning values, adding functions, or fixing bugs without rewriting the file. For line-range replacement or appending, use update_file.",
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

      if (targetOldText === undefined || targetOldText.length === 0) {
        return {
          success: false,
          path: filePath,
          error:
            "Missing required parameter 'oldText' (or 'old_text'). Provide the exact text to replace.",
        }
      }

      if (targetNewText === undefined) {
        return {
          success: false,
          path: filePath,
          error:
            "Missing required parameter 'newText' (or 'new_text'). Provide the replacement text.",
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

        // Try exact match first
        let matchedOldText = targetOldText
        let hasMatch = existingContent.includes(matchedOldText)

        // If exact match fails, try normalizing CRLF line endings (\r\n -> \n)
        if (!hasMatch) {
          const normalizedExisting = existingContent.replace(/\r\n/g, "\n")
          const normalizedTarget = targetOldText.replace(/\r\n/g, "\n")
          if (normalizedExisting.includes(normalizedTarget)) {
            existingContent = normalizedExisting
            matchedOldText = normalizedTarget
            hasMatch = true
          }
        }

        if (!hasMatch) {
          const trimmedTarget = targetOldText.trim()
          const hint = existingContent.includes(trimmedTarget)
            ? " Note: A trimmed version was found. Leading or trailing whitespace / indentation did not match."
            : ""
          return {
            success: false,
            path: relativePath,
            error: `oldText not found in '${relativePath}'.${hint} Please use read_file with startLine and lineCount to inspect the exact formatting, or use update_file with mode 'replace_lines'.`,
          }
        }

        let updatedContent: string
        let count = 0

        if (replaceAll) {
          count = existingContent.split(matchedOldText).length - 1
          updatedContent = existingContent
            .split(matchedOldText)
            .join(targetNewText)
        } else {
          count = 1
          updatedContent = existingContent.replace(
            matchedOldText,
            targetNewText
          )
        }

        await sandbox.fs.uploadFile(
          Buffer.from(updatedContent, "utf-8"),
          fullPath
        )

        const newTotalLines = updatedContent.split(/\r?\n/).length
        const linesChanged = targetNewText.split(/\r?\n/).length

        Sentry.logger.info("Sandbox text replaced", {
          path: relativePath,
          occurrences: count,
          newTotalLines,
        })
        return {
          success: true,
          path: relativePath,
          occurrencesReplaced: count,
          linesAffected: linesChanged,
          newTotalLines,
          message: `Successfully replaced ${count} occurrence(s) in ${relativePath} (${linesChanged} line(s) inserted, total ${newTotalLines} lines).`,
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        Sentry.logger.error("Sandbox replace_text failed", {
          path: filePath,
          error: errorMsg,
        })
        return {
          success: false,
          path: filePath,
          error: errorMsg,
        }
      }
    },
  })

  const read_file = tool({
    description:
      "Read a targeted range of lines from a file inside the Daytona sandbox game directory (/home/daytona/game). Use list_files to check total line counts first, then provide startLine and lineCount (max 500 lines per window).",
    inputSchema: readFileInputSchema,
    execute: async ({ path: filePath, startLine, lineCount, endLine }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        const buffer = await sandbox.fs.downloadFile(fullPath)
        const rawContent = buffer.toString("utf-8")

        const allLines = rawContent.length === 0 ? [] : rawContent.split(/\r?\n/)
        const totalLines = allLines.length

        if (totalLines === 0) {
          return {
            success: true,
            path: relativePath,
            startLine: 1,
            endLine: 0,
            lineCount: 0,
            totalLines: 0,
            linesRead: 0,
            truncated: false,
            content: "",
            message: `File '${relativePath}' is empty (0 lines).`,
          }
        }

        const effectiveStart = Math.max(1, startLine)

        if (effectiveStart > totalLines) {
          return {
            success: false,
            path: relativePath,
            error: `startLine (${effectiveStart}) exceeds total lines in '${relativePath}' (${totalLines} lines). Use list_files to check file sizes and line counts.`,
          }
        }

        // Determine requested count: prioritize lineCount if provided, otherwise compute from endLine
        let count = lineCount
        if (count === undefined && typeof endLine === "number") {
          count = Math.max(1, endLine - effectiveStart + 1)
        }
        if (count === undefined) {
          count = 300
        }

        // Enforce hard maximum ceiling of 500 lines
        const effectiveCount = Math.min(Math.max(1, count), 500)
        const effectiveEnd = Math.min(effectiveStart + effectiveCount - 1, totalLines)

        const selectedLines = allLines.slice(effectiveStart - 1, effectiveEnd)
        const content = selectedLines.join("\n")

        const truncated = effectiveEnd < totalLines
        const remainingLines = totalLines - effectiveEnd

        return {
          success: true,
          path: relativePath,
          startLine: effectiveStart,
          endLine: effectiveEnd,
          lineCount: selectedLines.length,
          totalLines,
          linesRead: selectedLines.length,
          truncated,
          ...(truncated ? { remainingLines, nextStartLine: effectiveEnd + 1 } : {}),
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
      "List files and directories inside the Daytona sandbox game directory, including file sizes and line counts. Use this to explore the project structure and check line counts before deciding to inspect or edit files.",
    inputSchema: listFilesInputSchema,
    execute: async ({ path: dirPath = ".", recursive = true }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(dirPath)
        const sandbox = await resolveSandbox()

        const depth = recursive ? 5 : 1
        const normalizedGameDir = path.posix.normalize(GAME_DIR)

        // Concurrently query file tree and line counts directly via sandbox container
        const [fileEntries, lineCountsMap] = await Promise.all([
          sandbox.fs.listFiles(fullPath, { depth }),
          (async () => {
            try {
              // Execute wc -l on non-hidden files directly in sandbox
              const cmd = `find "${fullPath}" -maxdepth ${depth} -type f ! -path '*/.*' -exec wc -l {} +`
              const res = await sandbox.process.executeCommand(cmd, undefined, undefined, 5)
              const stdout = res.result || ""
              const map = new Map<string, number>()
              for (const line of stdout.split("\n")) {
                const match = line.trim().match(/^(\d+)\s+(.+)$/)
                if (match) {
                  const targetFilePath = match[2].trim()
                  if (!targetFilePath.endsWith("total")) {
                    const count = Number.parseInt(match[1], 10)
                    const rel = path.posix.normalize(
                      path.posix.relative(normalizedGameDir, targetFilePath)
                    )
                    map.set(rel, count)
                  }
                }
              }
              return map
            } catch {
              return new Map<string, number>()
            }
          })(),
        ])

        const files = (fileEntries || []).map((entry) => {
          const entryPath = entry.path || path.posix.join(fullPath, entry.name)
          const relPath = path.posix.isAbsolute(entryPath)
            ? path.posix.relative(normalizedGameDir, entryPath)
            : entryPath

          const lineCount = entry.isDir ? undefined : lineCountsMap.get(relPath)

          return {
            name: entry.name,
            path: relPath || entry.name,
            isDir: Boolean(entry.isDir),
            size: entry.size ?? 0,
            ...(entry.isDir ? {} : { lines: lineCount ?? null }),
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

        Sentry.logger.info("Sandbox file deleted", {
          path: relativePath,
          recursive,
        })
        return {
          success: true,
          path: relativePath,
          message: `Successfully deleted ${relativePath}.`,
        }
      } catch (error) {
        const errorMsg = `Failed to delete '${filePath}': ${error instanceof Error ? error.message : String(error)}`
        Sentry.logger.error("Sandbox delete_file failed", {
          path: filePath,
          error: errorMsg,
        })
        return {
          success: false,
          path: filePath,
          error: errorMsg,
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

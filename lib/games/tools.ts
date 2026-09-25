import path from "node:path"
import { tool } from "ai"
import { z } from "zod"
import { locals } from "@trigger.dev/sdk"
import type { Sandbox } from "@daytona/sdk"
import { LspLanguageId } from "@daytona/sdk"
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

const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/

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

  if (!SAFE_PATH.test(sanitized)) {
    throw new Error(
      `"${targetPath}" isn't a usable path. Use letters, digits, dots, dashes, underscores and slashes only.`
    )
  }

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
      "Relative path to the file inside the game directory (e.g., 'index.html', 'player.ts', 'style.css')"
    ),
  content: z
    .string()
    .max(128000)
    .describe(
      "Initial text content for the file. Maximum 128,000 characters. Scaffold a working foundation; modularize larger games into separate files."
    ),
})

export const updateFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the existing file inside the game directory to update (e.g., 'index.html', 'game.ts')"
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
      "Relative path to the existing file inside the game directory (e.g., 'index.html', 'game.ts')"
    ),
  oldText: z
    .string()
    .max(8000)
    .optional()
    .describe(
      "The exact existing text or code snippet in the file to replace (strictly under 100 lines / 8,000 characters). Must match the file content exactly, including whitespace."
    ),
  old_text: z.string().max(8000).optional().describe("Alias for oldText"),
  newText: z
    .string()
    .max(8000)
    .optional()
    .describe(
      "The replacement text to insert (strictly under 100 lines / 8,000 characters)."
    ),
  new_text: z.string().max(8000).optional().describe("Alias for newText"),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      "Whether to replace all occurrences of oldText. Defaults to false (replaces first occurrence only)."
    ),
})

/**
 * Extracts exported TypeScript/JavaScript types, interfaces, classes, functions, and public methods.
 * Generates an ultra-compact summary (<150 tokens) to inspect contracts without loading entire file bodies.
 */
export function extractFileOutline(content: string, filePath: string): string {
  if (!content.trim()) return `// File '${filePath}' is empty (0 lines)`
  const lines = content.split(/\r?\n/)
  const outlineLines: string[] = [
    `// Outline of ${filePath} (${lines.length} total lines):`,
  ]

  const DECLARATION_REGEX =
    /^\s*(export\s+(?:default\s+)?(?:type|interface|class|enum|const|let|var|function|async\s+function)|public\s+|private\s+|protected\s+|(?:async\s+)?(?:\w+)\s*\([^)]*\)\s*(?::\s*[^{;]+)?)/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      continue
    }

    if (DECLARATION_REGEX.test(line)) {
      let sig = trimmed.replace(/\s*\{.*$/, "").trim()
      if (!sig.endsWith(";") && !sig.endsWith("{")) {
        sig += ";"
      }
      outlineLines.push(`  L${i + 1}: ${sig}`)
    }
  }

  if (outlineLines.length <= 1) {
    return `// Outline of ${filePath} (${lines.length} lines) - No top-level class/interface/export declarations found.`
  }

  return outlineLines.slice(0, 60).join("\n")
}

export const inspectSymbolsInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the TypeScript/JavaScript file to inspect symbols for (e.g. 'player.ts', 'enemies.ts', 'game.ts')"
    ),
})

export const readFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file inside the game directory to read (e.g., 'index.html', 'game.ts')"
    ),
  mode: z
    .enum(["full", "outline"])
    .optional()
    .describe(
      "Read mode: 'full' (default) reads actual code lines; 'outline' extracts exported types, interfaces, classes, and method signatures in ~100-150 tokens without loading the entire file body."
    ),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "The starting line number to read (1-indexed). Omit to read from line 1."
    ),
  lineCount: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .optional()
    .describe(
      "The number of lines to read starting from startLine (max 2,000 lines). Omit to read the entire file if under 2,000 lines."
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
    .default(".")
    .describe(
      "Directory path relative to the game directory to list (e.g., '.', 'engine', 'node_modules/three'). Defaults to '.' (root game directory)."
    ),
})

export const deleteFileInputSchema = z.object({
  path: z
    .string()
    .describe(
      "Relative path to the file or directory inside the game directory to delete (e.g., 'old.ts', 'temp.txt')"
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
  description: z
    .string()
    .describe(
      "The chosen option's description explaining what choosing this option entails"
    ),
})

export type AskPlayerOutput = z.infer<typeof askPlayerOutputSchema>

const PLACEHOLDER_PATTERN =
  /\[(?:persisted to disk|existing code|rest of code|unchanged|TODO|stub)[^\]]*\]|\/\/\s*\.\.\.\s*(?:rest of code|existing code|unchanged)/i

function validateNoPlaceholderContent(
  content: string,
  path: string
): { success: false; path: string; error: string } | null {
  const match = content.match(PLACEHOLDER_PATTERN)
  if (match) {
    return {
      success: false,
      path,
      error: `Rejected: The provided content contains a placeholder pattern ('${match[0]}'). Never write placeholder comments, stubs, or collapsed metadata strings to disk. Provide the complete, actual TypeScript source code.`,
    }
  }
  return null
}

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
      "Create or overwrite a file inside the Daytona sandbox game directory (/home/daytona/game). Keep files concise (under 2,500 lines / 128,000 characters) to avoid output token exhaustion. Scaffold a working foundation first, then add features modularly. For targeted edits under 100 lines, prefer replace_text or update_file.",
    inputSchema: writeFileInputSchema,
    execute: async ({ path: filePath, content }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        const lines = content.length === 0 ? 0 : content.split(/\r?\n/).length
        if (lines > 2500) {
          return {
            success: false,
            path: relativePath,
            error: `File exceeds the 2,500-line limit (${lines} lines). Keep files modular (under 128,000 characters) to avoid output token exhaustion. Scaffold a working foundation first, then add features modularly or via targeted updates.`,
          }
        }

        const placeholderCheck = validateNoPlaceholderContent(content, relativePath)
        if (placeholderCheck) {
          return placeholderCheck
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

        const placeholderCheck = validateNoPlaceholderContent(content, relativePath)
        if (placeholderCheck) {
          return placeholderCheck
        }

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

      const placeholderCheck = validateNoPlaceholderContent(targetNewText, filePath)
      if (placeholderCheck) {
        return placeholderCheck
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
            () => targetNewText
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
      "Read a file inside the Daytona sandbox game directory (/home/daytona/game). If startLine and lineCount are omitted, reads the entire file (up to 2,000 lines in a single operation). Pass mode: 'outline' to extract types, interfaces, classes, and method signatures in ~100-150 tokens without reading full implementation bodies.",
    inputSchema: readFileInputSchema,
    execute: async ({
      path: filePath,
      mode = "full",
      startLine,
      lineCount,
      endLine,
    }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        const buffer = await sandbox.fs.downloadFile(fullPath)
        const rawContent = buffer.toString("utf-8")

        if (mode === "outline") {
          const outline = extractFileOutline(rawContent, relativePath)
          return {
            success: true,
            path: relativePath,
            mode: "outline",
            totalLines:
              rawContent.length === 0 ? 0 : rawContent.split(/\r?\n/).length,
            outline,
            message: `Extracted interface outline for '${relativePath}'.`,
          }
        }

        const allLines =
          rawContent.length === 0 ? [] : rawContent.split(/\r?\n/)
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

        const effectiveStart = Math.max(1, startLine ?? 1)

        if (effectiveStart > totalLines) {
          return {
            success: false,
            path: relativePath,
            error: `startLine (${effectiveStart}) exceeds total lines in '${relativePath}' (${totalLines} lines). Use list_files to check file sizes.`,
          }
        }

        // Determine requested count: prioritize lineCount if provided, otherwise compute from endLine.
        // If neither is provided, read the entire file up to 2,000 lines (un-chunked default).
        let count = lineCount
        if (count === undefined && typeof endLine === "number") {
          count = Math.max(1, endLine - effectiveStart + 1)
        }
        if (count === undefined) {
          count = Math.min(2000, totalLines - effectiveStart + 1)
        }

        // Enforce maximum ceiling of 2,000 lines per window
        const effectiveCount = Math.min(Math.max(1, count), 2000)
        const effectiveEnd = Math.min(
          effectiveStart + effectiveCount - 1,
          totalLines
        )

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
          ...(truncated
            ? { remainingLines, nextStartLine: effectiveEnd + 1 }
            : {}),
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

  const inspect_symbols = tool({
    description:
      "Inspect TypeScript/JavaScript symbols (classes, interfaces, functions, methods, and line numbers) for a file inside the Daytona sandbox game directory (/home/daytona/game) using Daytona's native Language Server Protocol (LSP). Use this before editing dependent files to inspect exact method names and signatures in ~100 tokens without loading full file bodies.",
    inputSchema: inspectSymbolsInputSchema,
    execute: async ({ path: filePath }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(filePath)
        const sandbox = await resolveSandbox()

        // 1. Attempt Daytona native TypeScript Language Server Protocol (LSP)
        try {
          const lsp = await sandbox.createLspServer(
            LspLanguageId.TYPESCRIPT,
            GAME_DIR
          )
          await lsp.start()
          await lsp.didOpen(fullPath)
          const symbols = await lsp.documentSymbols(fullPath)
          await lsp.didClose(fullPath).catch(() => {})

          if (Array.isArray(symbols) && symbols.length > 0) {
            const formatted = symbols
              .slice(0, 50)
              .map(
                (s) =>
                  `- [${s.kind}] ${s.name}${s.location ? ` (${JSON.stringify(s.location)})` : ""}`
              )
              .join("\n")

            return {
              success: true,
              path: relativePath,
              source: "daytona-lsp",
              symbolsCount: symbols.length,
              symbols: formatted,
            }
          }
        } catch (lspErr) {
          Sentry.logger.warn(
            "Daytona LSP symbol extraction fell back to AST outline",
            {
              path: relativePath,
              error: lspErr instanceof Error ? lspErr.message : String(lspErr),
            }
          )
        }

        // 2. Resilient fallback: download file and extract structural outline
        const buffer = await sandbox.fs.downloadFile(fullPath)
        const content = buffer.toString("utf-8")
        const outline = extractFileOutline(content, relativePath)

        return {
          success: true,
          path: relativePath,
          source: "ast-outline",
          symbols: outline,
        }
      } catch (error) {
        return {
          success: false,
          path: filePath,
          error: `Failed to inspect symbols for '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  })

  const list_files = tool({
    description:
      "List files and directories inside a specific directory of the Daytona sandbox. Always lists immediate contents (depth 1) of the specified path. Returns separate 'directories' (to explore further) and 'files' (with sizes and line counts).",
    inputSchema: listFilesInputSchema,
    execute: async ({ path: dirPath = "." }) => {
      try {
        const { fullPath, relativePath } = resolveGamePath(dirPath)
        const sandbox = await resolveSandbox()

        const normalizedGameDir = path.posix.normalize(GAME_DIR)

        // Concurrently query immediate file tree (depth 1) and line counts
        const [fileEntries, lineCountsMap] = await Promise.all([
          sandbox.fs.listFiles(fullPath, { depth: 1 }),
          (async () => {
            try {
              // Execute wc -l on immediate non-hidden files in this directory
              const cmd = `find "${fullPath}" -maxdepth 1 -name ".*" -prune -o -type f -exec wc -l {} +`
              const res = await sandbox.process.executeCommand(
                cmd,
                undefined,
                undefined,
                5
              )
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

        const HIDDEN_NAMES = new Set([
          ".git",
          ".vite",
          "dist",
          ".DS_Store",
        ])

        const isTargetingHidden =
          relativePath.startsWith(".") && relativePath !== "."

        const visibleEntries = (fileEntries || []).filter((entry) => {
          if (!isTargetingHidden) {
            if (HIDDEN_NAMES.has(entry.name) || entry.name.startsWith(".")) {
              return false
            }
          }
          return true
        })

        const directories: { name: string; path: string }[] = []
        const files: {
          name: string
          path: string
          size: number
          lines: number | null
          modifiedAt: string
        }[] = []

        for (const entry of visibleEntries) {
          const entryPath =
            entry.path || path.posix.join(fullPath, entry.name)
          const relPath = path.posix.isAbsolute(entryPath)
            ? path.posix.relative(normalizedGameDir, entryPath)
            : entryPath

          if (entry.isDir) {
            directories.push({
              name: entry.name,
              path: relPath || entry.name,
            })
          } else {
            const lineCount = lineCountsMap.get(relPath) ?? null
            files.push({
              name: entry.name,
              path: relPath || entry.name,
              size: entry.size ?? 0,
              lines: lineCount,
              modifiedAt: entry.modifiedAt || entry.modTime || "",
            })
          }
        }

        directories.sort((a, b) => a.path.localeCompare(b.path))
        files.sort((a, b) => a.path.localeCompare(b.path))

        return {
          success: true,
          path: relativePath,
          totalDirectories: directories.length,
          totalFiles: files.length,
          directories,
          files,
        }
      } catch (error) {
        return {
          success: false,
          path: dirPath,
          error: `Failed to list files in '${dirPath}': ${error instanceof Error ? error.message : String(error)}`,
          totalDirectories: 0,
          totalFiles: 0,
          directories: [],
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

  const verify_game = tool({
    description:
      "Run TypeScript compiler check (tsc --noEmit) inside the Daytona sandbox game directory (/home/daytona/game). Validates syntax, interface compliance, type signatures, and import integrity across all game files. Returns compiler errors with exact file names and line numbers so you can surgically fix them. MANDATORY: Call this tool after writing or updating files and fix any reported errors before completing your turn.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const sandbox = await resolveSandbox()
        const result = await sandbox.process.executeCommand(
          `cd "${GAME_DIR}" && npm run typecheck`
        )
        const output = result.result?.trim() || ""
        const hasErrors = result.exitCode !== 0 || output.includes("error TS")

        if (!hasErrors) {
          return {
            success: true,
            message:
              "Verification passed! All game files compiled with 0 TypeScript errors.",
          }
        }

        return {
          success: false,
          exitCode: result.exitCode,
          errors: output,
          instruction:
            "TypeScript compiler found syntax or type errors. Inspect the file names and line numbers above and use replace_text or update_file to fix them before concluding your turn.",
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  })

  return {
    write_file,
    update_file,
    replace_text,
    read_file,
    inspect_symbols,
    verify_game,
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
export const inspect_symbols = defaultTools.inspect_symbols
export const verify_game = defaultTools.verify_game
export const list_files = defaultTools.list_files
export const delete_file = defaultTools.delete_file
export const ask_player = defaultTools.ask_player

export const tools = {
  write_file,
  update_file,
  replace_text,
  read_file,
  inspect_symbols,
  verify_game,
  list_files,
  delete_file,
  ask_player,
}

export const gameTools = tools
export default tools

import {
  pruneMessages,
  type ModelMessage,
  type AssistantModelMessage,
  type ToolCallPart,
  type ToolResultPart,
} from "ai"

export interface ContextSanitizerOptions {
  /**
   * How to prune reasoning content from assistant messages.
   * - 'all': remove reasoning from all messages
   * - 'before-last-message': keep reasoning only in the trailing assistant message
   * - 'none': keep all reasoning
   * Default: 'all'
   */
  reasoning?: "all" | "before-last-message" | "none"

  /**
   * How to prune historical tool calls and outputs.
   * - 'all': remove all tool calls and outputs
   * - 'before-last-message': remove tool calls/results from all past messages except the last
   * - 'none': keep all tool calls
   * Default: 'before-last-message'
   */
  toolCalls?:
    | "all"
    | "before-last-message"
    | `before-last-${number}-messages`
    | "none"
    | Array<{
        type: "all" | "before-last-message" | `before-last-${number}-messages`
        tools?: string[]
      }>

  /**
   * Whether to remove messages that became empty after pruning.
   * Default: 'remove'
   */
  emptyMessages?: "keep" | "remove"

  /**
   * Custom token/regex patterns to prune from message content.
   */
  tokensToPrune?: Array<string | RegExp>

  /**
   * Enforce alternating user/assistant roles.
   * Default: true
   */
  enforceAlternatingRoles?: boolean
}

/**
 * Registry of custom tokens / patterns to prune across turns.
 * Add any custom token or tag here to have it automatically pruned.
 */
export const DEFAULT_PRUNED_TOKENS: Array<string | RegExp> = [
  /<thought>[\s\S]*?<\/thought>/gi,
  /<think>[\s\S]*?<\/think>/gi,
]

/**
 * Transforms completed `ask_player` interactions from PREVIOUS turns into clean Q&A text.
 *
 * Rules:
 * 1. If an `ask_player` was answered in the immediate preceding step/turn (toolMsgIndex === n - 1),
 *    the user JUST answered this turn (e.g., Turn 4). We leave it as live tool-call + tool-result
 *    so the LLM receives the tool response to complete its loop.
 * 2. If there are subsequent messages after the tool response (toolMsgIndex < n - 1),
 *    the interaction is from an older turn (e.g. Turn 3 question + Turn 4 answer seen from Turn 5).
 *    We transform it into:
 *      Assistant: "<question>"
 *      User: "<label>"
 * 3. Never called from sanitizeStep (mid-step); only called from sanitizeContext at turn start.
 */
export function compactHistoricalAskPlayerCalls(
  messages: ModelMessage[]
): ModelMessage[] {
  const n = messages.length
  if (n === 0) return messages

  const result: ModelMessage[] = []

  for (let i = 0; i < n; i++) {
    const msg = messages[i]

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const toolCall = msg.content.find(
        (part): part is ToolCallPart =>
          part.type === "tool-call" && part.toolName === "ask_player"
      )

      if (toolCall) {
        const toolMsgIdx = messages.findIndex(
          (candidate, idx) =>
            idx > i &&
            candidate.role === "tool" &&
            Array.isArray(candidate.content) &&
            candidate.content.some(
              (p): p is ToolResultPart =>
                p.type === "tool-result" && p.toolCallId === toolCall.toolCallId
            )
        )

        // Only compact if completed in an earlier turn (not the active trailing answer of current turn)
        if (toolMsgIdx !== -1 && toolMsgIdx < n - 1) {
          const toolMsg = messages[toolMsgIdx]
          const toolResult = Array.isArray(toolMsg.content)
            ? toolMsg.content.find(
                (p): p is ToolResultPart =>
                  p.type === "tool-result" &&
                  p.toolCallId === toolCall.toolCallId
              )
            : undefined

          const question = getAskPlayerQuestion(toolCall.input)
          const chosenLabel = getAskPlayerChosenLabel(
            toolResult?.output,
            toolCall.input
          )

          result.push({
            role: "assistant",
            content: [{ type: "text", text: question }],
          })
          result.push({
            role: "user",
            content: [{ type: "text", text: chosenLabel }],
          })

          // Skip to after the consumed tool message
          i = toolMsgIdx
          continue
        }
      }
    }

    result.push(msg)
  }

  return result
}

function getAskPlayerQuestion(args: unknown): string {
  let unwrapped: unknown = args
  if (typeof unwrapped === "string") {
    try {
      unwrapped = JSON.parse(unwrapped)
    } catch {
      // not json
    }
  }
  if (typeof unwrapped === "object" && unwrapped !== null) {
    const record = unwrapped as Record<string, unknown>
    if ("value" in record && record.value !== undefined) {
      unwrapped = record.value
    }
  }
  if (
    typeof unwrapped === "object" &&
    unwrapped !== null &&
    "question" in unwrapped
  ) {
    const q = (unwrapped as Record<string, unknown>).question
    if (typeof q === "string" && q.trim()) {
      return q.trim()
    }
  }
  return "Design question"
}

export function getAskPlayerChosenLabel(
  output: unknown,
  input?: unknown
): string {
  if (!output) return "Selected option"

  let unwrapped: unknown = output

  // 1. If output is stringified JSON, parse it
  if (typeof unwrapped === "string") {
    const trimmed = unwrapped.trim()
    try {
      unwrapped = JSON.parse(trimmed)
    } catch {
      if (trimmed) return trimmed
    }
  }

  // 2. Unwrap AI SDK's { type: 'json', value: ... } wrapper
  if (typeof unwrapped === "object" && unwrapped !== null) {
    const record = unwrapped as Record<string, unknown>
    if ("value" in record && record.value !== undefined) {
      unwrapped = record.value
      if (typeof unwrapped === "string") {
        const trimmedVal = unwrapped.trim()
        try {
          unwrapped = JSON.parse(trimmedVal)
        } catch {
          if (trimmedVal) return trimmedVal
        }
      }
    }
  }

  // 3. Extract label, id, and description
  let chosenLabel: string | undefined
  let chosenId: string | undefined
  let chosenDescription: string | undefined

  if (typeof unwrapped === "object" && unwrapped !== null) {
    const record = unwrapped as Record<string, unknown>
    if (typeof record.label === "string" && record.label.trim()) {
      chosenLabel = record.label.trim()
    } else if (
      typeof record.chosenLabel === "string" &&
      record.chosenLabel.trim()
    ) {
      chosenLabel = record.chosenLabel.trim()
    }

    if (typeof record.id === "string" && record.id.trim()) {
      chosenId = record.id.trim()
    } else if (typeof record.chosenId === "string" && record.chosenId.trim()) {
      chosenId = record.chosenId.trim()
    }

    if (typeof record.description === "string" && record.description.trim()) {
      chosenDescription = record.description.trim()
    } else if (
      typeof record.chosenDescription === "string" &&
      record.chosenDescription.trim()
    ) {
      chosenDescription = record.chosenDescription.trim()
    }
  } else if (typeof unwrapped === "string" && unwrapped.trim()) {
    chosenLabel = unwrapped.trim()
  }

  // 4. Lookup from question options to enrich with missing label or description
  if (typeof input === "object" && input !== null) {
    let inputRec: Record<string, unknown> = input as Record<string, unknown>
    if (
      "value" in inputRec &&
      typeof inputRec.value === "object" &&
      inputRec.value !== null
    ) {
      inputRec = inputRec.value as Record<string, unknown>
    }
    const options = Array.isArray(inputRec.options) ? inputRec.options : []
    const matched = options.find(
      (opt): opt is { id?: string; label?: string; description?: string } =>
        typeof opt === "object" &&
        opt !== null &&
        Boolean(
          (chosenId && (opt as { id?: unknown }).id === chosenId) ||
          (chosenLabel && (opt as { label?: unknown }).label === chosenLabel)
        )
    )

    if (matched) {
      if (
        !chosenLabel &&
        typeof matched.label === "string" &&
        matched.label.trim()
      ) {
        chosenLabel = matched.label.trim()
      }
      if (
        !chosenDescription &&
        typeof matched.description === "string" &&
        matched.description.trim()
      ) {
        chosenDescription = matched.description.trim()
      }
    }
  }

  const finalLabel = chosenLabel || chosenId || "Selected option"

  if (chosenDescription && chosenDescription !== finalLabel) {
    return `${finalLabel}: ${chosenDescription}`
  }

  return finalLabel
}

function pruneTokensFromMessage(
  message: ModelMessage,
  tokens: Array<string | RegExp>
): ModelMessage {
  if (message.role === "system") {
    return { ...message, content: pruneString(message.content, tokens) }
  }
  if (message.role === "user") {
    if (typeof message.content === "string") {
      return { ...message, content: pruneString(message.content, tokens) }
    }
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === "text"
          ? { ...part, text: pruneString(part.text, tokens) }
          : part
      ),
    }
  }
  if (message.role === "assistant") {
    if (typeof message.content === "string") {
      return { ...message, content: pruneString(message.content, tokens) }
    }
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === "text"
          ? { ...part, text: pruneString(part.text, tokens) }
          : part
      ),
    }
  }
  return message
}

function normalizeFilePath(p: unknown): string {
  if (typeof p !== "string") return ""
  return p.trim().replace(/^[./\\]+/, "").toLowerCase()
}

function getFilePathFromToolCall(part: ToolCallPart): string | undefined {
  if (
    typeof part.input === "object" &&
    part.input !== null &&
    "path" in part.input
  ) {
    const raw = (part.input as { path?: unknown }).path
    const norm = normalizeFilePath(raw)
    return norm.length > 0 ? norm : undefined
  }
  if (
    part.toolName === "generate_texture" &&
    typeof part.input === "object" &&
    part.input !== null &&
    "filename" in part.input
  ) {
    const raw = String((part.input as { filename?: unknown }).filename || "")
      .replace(/^.*[/\\]/, "")
      .replace(/\.[a-zA-Z0-9]+$/, "")
    return `assets/textures/${raw}.png`
  }
  if (
    part.toolName === "generate_music" &&
    typeof part.input === "object" &&
    part.input !== null &&
    "filename" in part.input
  ) {
    const raw = String((part.input as { filename?: unknown }).filename || "")
      .replace(/^.*[/\\]/, "")
      .replace(/\.[a-zA-Z0-9]+$/, "")
    return `assets/audio/${raw}.mp3`
  }
  return undefined
}

/**
 * Atomically filters model messages so that only tool calls in `allowedToolCallIds`
 * (and their corresponding tool results) are retained. Empty assistant/tool messages are dropped.
 */
function filterMessagesByAllowedToolCalls(
  messages: ModelMessage[],
  allowedToolCallIds: Set<string>,
  options?: { removeReasoning?: boolean }
): ModelMessage[] {
  const result: ModelMessage[] = []

  for (const message of messages) {
    if (message.role === "user") {
      result.push(message)
      continue
    }

    if (message.role === "tool") {
      if (typeof message.content === "string") {
        result.push(message)
        continue
      }
      const filteredParts = message.content.filter(
        (part) =>
          part.type !== "tool-result" || allowedToolCallIds.has(part.toolCallId)
      )
      if (filteredParts.length > 0) {
        result.push({ ...message, content: filteredParts } as ModelMessage)
      }
      continue
    }

    if (message.role === "assistant") {
      if (typeof message.content === "string") {
        result.push(message)
        continue
      }

      const filteredParts = message.content.filter((part) => {
        if (part.type === "reasoning" && options?.removeReasoning) {
          return false
        }
        if (part.type === "tool-call") {
          return allowedToolCallIds.has(part.toolCallId)
        }
        return true
      })

      if (filteredParts.length > 0) {
        result.push({ ...message, content: filteredParts } as ModelMessage)
      }
      continue
    }

    result.push(message)
  }

  return result
}

/**
 * Resolves tool calls to keep for the most recent 1-2 turns:
 * 1. For each file touched, maintains at most 1 tool call representing its latest full content (write_file or read_file).
 * 2. If update_file, replace_text, or delete_file was the last operation on a file, no tool call for that file is kept
 *    so the model is forced to call read_file on demand rather than relying on stale code.
 * 3. Ephemeral tools (verify_game, inspect_symbols, loadSkill, bash, readFile) are pruned.
 * 4. Active ask_player tool calls are preserved.
 */
function resolveCrossTurnKeptToolCallIds(messages: ModelMessage[]): Set<string> {
  const allowed = new Set<string>()
  const fileOperations = new Map<
    string,
    Array<{ toolCallId: string; toolName: string }>
  >()

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue
    }

    for (const part of message.content) {
      if (part.type !== "tool-call") continue

      if (part.toolName === "ask_player") {
        allowed.add(part.toolCallId)
        continue
      }

      if (
        part.toolName === "write_file" ||
        part.toolName === "read_file" ||
        part.toolName === "update_file" ||
        part.toolName === "replace_text" ||
        part.toolName === "delete_file" ||
        part.toolName === "generate_texture" ||
        part.toolName === "generate_music"
      ) {
        const filePath = getFilePathFromToolCall(part)
        if (filePath) {
          if (!fileOperations.has(filePath)) {
            fileOperations.set(filePath, [])
          }
          fileOperations.get(filePath)!.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
          })
        }
      }
    }
  }

  for (const [, events] of fileOperations.entries()) {
    if (events.length === 0) continue
    const lastEvent = events[events.length - 1]

    if (
      lastEvent.toolName === "write_file" ||
      lastEvent.toolName === "read_file" ||
      lastEvent.toolName === "generate_texture" ||
      lastEvent.toolName === "generate_music"
    ) {
      allowed.add(lastEvent.toolCallId)
    }
  }

  return allowed
}

/**
 * Sanitizes conversation messages for cross-turn context:
 * - Completed historical ask_player interactions are compacted into clean Q&A text.
 * - Turns before the last 2 turns are pruned to user prompt + assistant text only via AI SDK pruneMessages.
 * - In the last 2 turns, keeps at most 1 tool call per unique file path (latest write_file or read_file)
 *   unless subsequently modified/deleted, purging ephemeral compiler checks and reasoning.
 */
export function sanitizeContext(
  messages: ModelMessage[],
  options?: ContextSanitizerOptions
): ModelMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return []
  }

  // 1. Compact completed ask_player tool calls from older turns into clean Q&A text.
  // Left untouched if it is the active incoming answer of this turn.
  const historyWithCompactedQuestions =
    compactHistoricalAskPlayerCalls(messages)

  // 2. Identify turns by user message boundaries
  const userIndices: number[] = []
  for (let i = 0; i < historyWithCompactedQuestions.length; i++) {
    if (historyWithCompactedQuestions[i].role === "user") {
      userIndices.push(i)
    }
  }

  let cleanedOlder: ModelMessage[] = []
  let recentMessages = historyWithCompactedQuestions

  // If there are more than 2 completed turns, split before the 2nd previous completed turn.
  // The last message may be the incoming user prompt for the current turn.
  const isIncomingTurn =
    historyWithCompactedQuestions.length > 0 &&
    historyWithCompactedQuestions[historyWithCompactedQuestions.length - 1]
      .role === "user"

  const completedUserIndices = isIncomingTurn
    ? userIndices.slice(0, -1)
    : userIndices

  // Turns before the last 2 completed turns are pruned to user prompt + assistant text only.
  if (completedUserIndices.length > 2) {
    const splitIndex = completedUserIndices[completedUserIndices.length - 2]
    const olderMessages = historyWithCompactedQuestions.slice(0, splitIndex)
    recentMessages = historyWithCompactedQuestions.slice(splitIndex)

    cleanedOlder = pruneMessages({
      messages: olderMessages,
      reasoning: "all",
      toolCalls: "all",
      emptyMessages: "remove",
    })
  }

  // 3. For the last 2 turns: keep at most 1 tool call per file (latest write_file or read_file)
  // unless subsequently modified/deleted. Prune ephemeral compiler & LSP tools.
  const allowedToolCallIds = resolveCrossTurnKeptToolCallIds(recentMessages)
  const cleanedRecent = filterMessagesByAllowedToolCalls(
    recentMessages,
    allowedToolCallIds,
    { removeReasoning: true }
  )

  let combined = [...cleanedOlder, ...cleanedRecent]

  // 4. Prune custom token / tag patterns if configured
  const tokens = [...DEFAULT_PRUNED_TOKENS, ...(options?.tokensToPrune ?? [])]
  if (tokens.length > 0) {
    combined = combined.map((message) => pruneTokensFromMessage(message, tokens))
  }

  // 5. Ensure tool call thought signatures carry the skip_thought_signature_validator sentinel
  combined = cleanHistoricalProviderOptions(combined)

  // 6. Guarantee that sanitized context NEVER terminates with a model/assistant turn.
  while (
    combined.length > 0 &&
    combined[combined.length - 1].role === "assistant"
  ) {
    combined.pop()
  }

  return combined
}

/**
 * Strips historical providerOptions from pure text parts, keeping context minimal and clean,
 * while strictly preserving providerOptions (such as Gemini/Vertex thoughtSignature) on tool-call parts.
 */
export function cleanHistoricalProviderOptions(
  messages: ModelMessage[]
): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "assistant") {
      return msg
    }

    const assistantMsg = msg as AssistantModelMessage

    // If content is a string or text-only, no providerOptions needed
    if (typeof assistantMsg.content === "string") {
      if (!assistantMsg.providerOptions) return assistantMsg
      const cleanMsg = { ...assistantMsg }
      delete cleanMsg.providerOptions
      return cleanMsg
    }

    // Process parts using standard part types
    const cleanedParts = assistantMsg.content.map((part) => {
      // Text parts never need providerOptions in history
      if (part.type === "text" && "providerOptions" in part) {
        const cleanPart = { ...part }
        delete cleanPart.providerOptions
        return cleanPart
      }

      // For tool calls:
      // Preserve existing thought signatures, or inject Google's documented sentinel
      // 'skip_thought_signature_validator' if missing, preventing 400 Bad Request on replay.
      if (part.type === "tool-call") {
        const googleOpts = (part.providerOptions?.google ?? {}) as Record<
          string,
          unknown
        >
        const sig =
          (googleOpts.signature || googleOpts.thoughtSignature) as
            | string
            | undefined || "skip_thought_signature_validator"

        return {
          ...part,
          providerOptions: {
            ...part.providerOptions,
            google: {
              ...googleOpts,
              signature: sig,
              thoughtSignature: sig,
            },
          },
        }
      }

      return part
    })

    return { ...assistantMsg, content: cleanedParts }
  })
}

function pruneString(text: string, tokens: Array<string | RegExp>): string {
  let cleaned = text
  for (const token of tokens) {
    if (typeof token === "string") {
      cleaned = cleaned.replaceAll(token, "")
    } else {
      cleaned = cleaned.replace(token, "")
    }
  }
  return cleaned
}

export interface StepUnit {
  assistantMsg: ModelMessage
  toolMessages: ModelMessage[]
  hasAskPlayer: boolean
  hasFileWrite: boolean
}

/**
 * Groups messages into prefix history and atomic Step Units (Assistant Tool Call + Tool Result Responses).
 * Identifies the start of the current turn using the last user message.
 */
export function groupMessagesIntoSteps(messages: ModelMessage[]): {
  prefixMessages: ModelMessage[]
  steps: StepUnit[]
} {
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i
      break
    }
  }

  const prefixMessages = messages.slice(0, lastUserIdx + 1)
  const turnMessages = messages.slice(lastUserIdx + 1)

  const steps: StepUnit[] = []
  let i = 0
  while (i < turnMessages.length) {
    const msg = turnMessages[i]
    if (msg.role === "assistant") {
      const assistantMsg = msg
      const toolMessages: ModelMessage[] = []
      i++
      while (i < turnMessages.length && turnMessages[i].role === "tool") {
        toolMessages.push(turnMessages[i])
        i++
      }

      const content = Array.isArray(assistantMsg.content)
        ? assistantMsg.content
        : []
      const hasAskPlayer = content.some(
        (part) => part.type === "tool-call" && part.toolName === "ask_player"
      )
      const hasFileWrite = content.some(
        (part) =>
          part.type === "tool-call" &&
          (part.toolName === "write_file" ||
            part.toolName === "update_file" ||
            part.toolName === "replace_text")
      )

      steps.push({ assistantMsg, toolMessages, hasAskPlayer, hasFileWrite })
    } else {
      prefixMessages.push(msg)
      i++
    }
  }

  return { prefixMessages, steps }
}

/**
 * Preserves historical messages intact without mutating tool inputs or results.
 */
export interface CollapseHistoricalPayloadsOptions {
  collapseReads?: boolean
}

export function collapseHistoricalFileWritePayloads(
  messages: ModelMessage[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: CollapseHistoricalPayloadsOptions
): ModelMessage[] {
  return messages
}

/**
 * Alias for collapseHistoricalFileWritePayloads.
 */
export const collapseHistoricalPayloads = collapseHistoricalFileWritePayloads

export interface SanitizeStepOptions {
  /**
   * How to prune reasoning content from assistant messages.
   * Default: 'none' (keeps reasoning during the active turn so thinking chain is not broken)
   */
  reasoning?: "all" | "before-last-message" | "none"
  /**
   * Maximum sliding-window steps to preserve before applying hard cutoff.
   * Default: 20 steps (~40 messages)
   */
  windowSteps?: number
}

/**
 * Resolves tool calls to keep within the active turn's steps:
 * 1. For each file, keeps the latest full copy (write_file or read_file) plus any update_file/replace_text that happened AFTER it.
 * 2. If delete_file occurred, discards all earlier operations for that file, keeping the delete_file tool call.
 * 3. If multiple verify_game checks ran, keeps only the latest verify_game compiler output.
 * 4. For loadSkill, keeps the latest call per skill name so active skill guidance remains in context.
 * 5. Preserves all other active in-turn tools (ask_player, list_files, inspect_symbols, bash, readFile, execute_command).
 */
function resolveStepKeptToolCallIds(steps: StepUnit[]): Set<string> {
  const allowed = new Set<string>()
  const fileEvents = new Map<
    string,
    Array<{ toolCallId: string; toolName: string; stepIndex: number }>
  >()
  const verifyGameCallIds: string[] = []
  const skillEvents = new Map<string, string[]>()

  for (let sIdx = 0; sIdx < steps.length; sIdx++) {
    const step = steps[sIdx]
    if (
      step.assistantMsg.role !== "assistant" ||
      !Array.isArray(step.assistantMsg.content)
    )
      continue

    for (const part of step.assistantMsg.content) {
      if (part.type !== "tool-call") continue

      if (part.toolName === "verify_game") {
        verifyGameCallIds.push(part.toolCallId)
        continue
      }

      if (part.toolName === "loadSkill") {
        const skillName =
          typeof part.input === "object" &&
          part.input !== null &&
          "name" in part.input &&
          typeof (part.input as { name?: unknown }).name === "string"
            ? (part.input as { name: string }).name.trim().toLowerCase()
            : "unknown_skill"

        if (!skillEvents.has(skillName)) {
          skillEvents.set(skillName, [])
        }
        skillEvents.get(skillName)!.push(part.toolCallId)
        continue
      }

      if (
        part.toolName === "write_file" ||
        part.toolName === "read_file" ||
        part.toolName === "update_file" ||
        part.toolName === "replace_text" ||
        part.toolName === "delete_file" ||
        part.toolName === "generate_texture" ||
        part.toolName === "generate_music"
      ) {
        const filePath = getFilePathFromToolCall(part)
        if (filePath) {
          if (!fileEvents.has(filePath)) {
            fileEvents.set(filePath, [])
          }
          fileEvents.get(filePath)!.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            stepIndex: sIdx,
          })
          continue
        }
      }

      // Keep all other tools active within the turn (ask_player, list_files, inspect_symbols, bash, readFile, execute_command, etc.)
      allowed.add(part.toolCallId)
    }
  }

  // Keep only the most recent verify_game check
  if (verifyGameCallIds.length > 0) {
    allowed.add(verifyGameCallIds[verifyGameCallIds.length - 1])
  }

  // Keep only the most recent loadSkill call per unique skill name
  for (const [, callIds] of skillEvents.entries()) {
    if (callIds.length > 0) {
      allowed.add(callIds[callIds.length - 1])
    }
  }

  // Per-file resolution within steps
  for (const [, events] of fileEvents.entries()) {
    if (events.length === 0) continue

    let latestFullCopyIdx = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (
        events[i].toolName === "write_file" ||
        events[i].toolName === "read_file" ||
        events[i].toolName === "generate_texture" ||
        events[i].toolName === "generate_music"
      ) {
        latestFullCopyIdx = i
        break
      }
    }

    const deleteIdx = events.findIndex((e) => e.toolName === "delete_file")

    if (deleteIdx !== -1) {
      for (let i = 0; i < events.length; i++) {
        if (i >= deleteIdx) {
          allowed.add(events[i].toolCallId)
        }
      }
    } else if (latestFullCopyIdx !== -1) {
      allowed.add(events[latestFullCopyIdx].toolCallId)
      for (let i = latestFullCopyIdx + 1; i < events.length; i++) {
        allowed.add(events[i].toolCallId)
      }
    } else {
      for (const e of events) {
        allowed.add(e.toolCallId)
      }
    }
  }

  return allowed
}

function filterStepUnits(
  steps: StepUnit[],
  allowedToolCallIds: Set<string>
): StepUnit[] {
  const result: StepUnit[] = []

  for (const step of steps) {
    let assistantMsg = step.assistantMsg
    if (
      assistantMsg.role === "assistant" &&
      Array.isArray(assistantMsg.content)
    ) {
      const filteredParts = assistantMsg.content.filter((part) => {
        if (part.type === "tool-call") {
          return allowedToolCallIds.has(part.toolCallId)
        }
        return true
      })
      assistantMsg = {
        ...assistantMsg,
        content: filteredParts,
      } as ModelMessage
    }

    const filteredTools = step.toolMessages
      .map((tm) => {
        if (tm.role === "tool" && Array.isArray(tm.content)) {
          const filteredParts = tm.content.filter((part) => {
            if (part.type === "tool-result") {
              return allowedToolCallIds.has(part.toolCallId)
            }
            return true
          })
          return { ...tm, content: filteredParts } as ModelMessage
        }
        return tm
      })
      .filter((tm) => Array.isArray(tm.content) && tm.content.length > 0)

    const hasAssistantContent =
      typeof assistantMsg.content === "string"
        ? assistantMsg.content.length > 0
        : Array.isArray(assistantMsg.content) &&
          assistantMsg.content.length > 0

    if (hasAssistantContent || filteredTools.length > 0) {
      result.push({
        ...step,
        assistantMsg,
        toolMessages: filteredTools,
      })
    }
  }

  return result
}

/**
 * Step sanitizer for `streamText`'s `prepareStep`:
 * - Clean historical providerOptions while strictly preserving tool call thoughtSignatures.
 * - Deduplicate file tool calls within the active turn (superseded full copies, old compiler checks).
 * - Prune reasoning: 1 reasoning block every 3rd completed reasoning step.
 * - Removed 25-step hard cutoff to allow complex builds to execute without multi-file amnesia.
 */
export function sanitizeStep(
  messages: ModelMessage[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options?: SanitizeStepOptions
): ModelMessage[] {
  // 1. Clean historical providerOptions from text parts while strictly preserving tool call thoughtSignatures
  const cleaned = cleanHistoricalProviderOptions(messages)

  // 2. Group into prefix history and current turn steps
  const { prefixMessages, steps } = groupMessagesIntoSteps(cleaned)

  // 3. Deduplicate file tool calls within the active turn
  const allowedStepToolCallIds = resolveStepKeptToolCallIds(steps)
  const filteredSteps = filterStepUnits(steps, allowedStepToolCallIds)

  // 4. Early-exit reasoning pruning:
  // Iterate only until 3 completed reasoning steps are encountered.
  // As soon as 3 are found, exit early and prune reasoning from the first (oldest) one.
  const reasoningStepIndices: number[] = []
  for (let i = 0; i < filteredSteps.length; i++) {
    const content = filteredSteps[i].assistantMsg.content
    if (Array.isArray(content) && content.some((p) => p.type === "reasoning")) {
      reasoningStepIndices.push(i)
      if (reasoningStepIndices.length === 3) {
        break // Early exit: we have found 3 completed reasoning steps
      }
    }
  }

  if (reasoningStepIndices.length === 3) {
    const firstReasoningStepIndex = reasoningStepIndices[0]
    const step = filteredSteps[firstReasoningStepIndex]
    const [pruned] = pruneMessages({
      messages: [step.assistantMsg],
      reasoning: "all",
      toolCalls: "none",
    })
    if (pruned) {
      step.assistantMsg = pruned
    } else {
      filteredSteps.splice(firstReasoningStepIndex, 1)
    }
  }

  // 5. Reassemble messages with preserved tool calls and thoughtSignatures (no arbitrary 25-step cutoff)
  const result: ModelMessage[] = [...prefixMessages]
  for (const step of filteredSteps) {
    result.push(step.assistantMsg)
    result.push(...step.toolMessages)
  }

  return result
}

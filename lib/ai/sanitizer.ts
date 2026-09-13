import {
  pruneMessages,
  type ModelMessage,
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
    if ("value" in inputRec && typeof inputRec.value === "object" && inputRec.value !== null) {
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
      if (!chosenLabel && typeof matched.label === "string" && matched.label.trim()) {
        chosenLabel = matched.label.trim()
      }
      if (!chosenDescription && typeof matched.description === "string" && matched.description.trim()) {
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

/**
 * Sanitizes and prunes conversation messages using the official Vercel AI SDK `pruneMessages` API.
 * Eliminates context bloat from historical tool calls and ephemeral reasoning while
 * preserving valid tool call/result invariants and matching IDs.
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

  // 2. Leverage the official AI SDK pruneMessages function
  // Prune only bulky filesystem tools from earlier turns, keeping human-in-the-loop (ask_player) decisions permanent
  let pruned = pruneMessages({
    messages: historyWithCompactedQuestions,
    reasoning: options?.reasoning ?? "all",
    toolCalls: options?.toolCalls ?? [
      {
        type: "before-last-message",
        tools: [
          "read_file",
          "write_file",
          "update_file",
          "replace_text",
          "list_files",
          "delete_file",
        ],
      },
    ],
    emptyMessages: options?.emptyMessages ?? "remove",
  })

  // 3. Prune custom token / tag patterns if configured
  const tokens = [...DEFAULT_PRUNED_TOKENS, ...(options?.tokensToPrune ?? [])]
  if (tokens.length > 0) {
    pruned = pruned.map((message) => pruneTokensFromMessage(message, tokens))
  }

  return pruned
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

      steps.push({ assistantMsg, toolMessages, hasAskPlayer })
    } else {
      prefixMessages.push(msg)
      i++
    }
  }

  return { prefixMessages, steps }
}

export interface SanitizeStepOptions {
  /**
   * Number of recent steps to keep completely intact in the sliding window.
   * Default: 20 steps (~40 messages)
   */
  windowSteps?: number
}

/**
 * Atomic sliding-window step sanitizer for `streamText`'s `prepareStep`.
 * Evicts entire older step pairs (assistant thought + tool call + tool response)
 * when history exceeds windowSteps, preserving Gemini thoughtSignature integrity
 * and capping input tokens to prevent Vertex AI 429 TPM exhaustion.
 */
export function sanitizeStep(
  messages: ModelMessage[],
  options?: SanitizeStepOptions
): ModelMessage[] {
  const windowSteps = options?.windowSteps ?? 20
  const { prefixMessages, steps } = groupMessagesIntoSteps(messages)

  // If we have not exceeded the window limit, keep all steps
  if (steps.length <= windowSteps) {
    return messages
  }

  // Sliding window: keep the last windowSteps + any older step that called ask_player
  const cutoffIndex = steps.length - windowSteps
  const keptSteps = steps.filter((step, index) => {
    if (index >= cutoffIndex) return true // Recent step inside window: keep
    return step.hasAskPlayer // Older step outside window: keep only if player interaction
  })

  // Reconstitute the messages array cleanly
  const result: ModelMessage[] = [...prefixMessages]
  for (const step of keptSteps) {
    result.push(step.assistantMsg)
    result.push(...step.toolMessages)
  }

  return result
}

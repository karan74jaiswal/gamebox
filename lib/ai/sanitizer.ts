import { pruneMessages, type ModelMessage } from "ai"

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

  // 1. Leverage the official AI SDK pruneMessages function
  // Prune only bulky filesystem tools from earlier turns, keeping human-in-the-loop (ask_player) decisions permanent
  let pruned = pruneMessages({
    messages,
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

  // 2. Prune custom token / tag patterns if configured
  const tokens = [...DEFAULT_PRUNED_TOKENS, ...(options?.tokensToPrune ?? [])]
  if (tokens.length > 0) {
    pruned = pruned.map((message) => {
      if (message.role === "system") {
        return {
          ...message,
          content: pruneString(message.content, tokens),
        }
      }

      if (message.role === "user") {
        if (typeof message.content === "string") {
          return {
            ...message,
            content: pruneString(message.content, tokens),
          }
        }
        return {
          ...message,
          content: message.content.map((part) => {
            if (part.type === "text") {
              return {
                ...part,
                text: pruneString(part.text, tokens),
              }
            }
            return part
          }),
        }
      }

      if (message.role === "assistant") {
        if (typeof message.content === "string") {
          return {
            ...message,
            content: pruneString(message.content, tokens),
          }
        }
        return {
          ...message,
          content: message.content.map((part) => {
            if (part.type === "text") {
              return {
                ...part,
                text: pruneString(part.text, tokens),
              }
            }
            return part
          }),
        }
      }

      return message
    })
  }

  // 3. Enforce alternating user/assistant roles required by LLM providers (Anthropic, Gemini)
  if (options?.enforceAlternatingRoles !== false) {
    return pruned.reduce<ModelMessage[]>((acc, current) => {
      if (acc.length === 0) return [current]
      const prev = acc[acc.length - 1]
      if (prev.role === "user" && current.role === "user") {
        acc.push({
          role: "assistant",
          content: "Understood. Proceeding with your next request.",
        })
      }
      acc.push(current)
      return acc
    }, [])
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



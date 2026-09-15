import {
  APICallError,
  TypeValidationError,
  InvalidToolInputError,
  NoSuchToolError,
  RetryError,
  LoadAPIKeyError,
  StreamProviderError,
} from "ai"
import { OUT_OF_CREDITS_MESSAGE } from "@/lib/credits/constants"

export { OUT_OF_CREDITS_MESSAGE }

export type ErrorCategory =
  | "rate_limit"
  | "service_outage"
  | "network_timeout"
  | "auth_failure"
  | "context_length"
  | "safety_filter"
  | "sandbox_error"
  | "tool_validation"
  | "tool_execution"
  | "insufficient_credits"
  | "aborted"
  | "unknown"

export interface ResolvedError {
  /** Clean, user-friendly message safe for display in the chat UI */
  userMessage: string
  /** High-level semantic category for quick filtering in DB and analytics */
  category: ErrorCategory
  /** Technical error class or code (e.g. 'APICallError', 'DaytonaTimeoutError') */
  errorType: string
  /** HTTP status code if available (e.g. 429, 503, 401, 500) */
  statusCode?: number
  /** Specific machine-readable code (e.g. 'RESOURCE_EXHAUSTED', 'DAYTONA_TIMEOUT') */
  code?: string
  /** Exact technical raw message or stack */
  rawMessage: string
  /** Structured technical debug context (e.g. URL, toolName, Zod issues) */
  details?: Record<string, unknown>
}

/**
 * Checks if an error represents an intentional cancellation / abort.
 */
export function isAbortError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "CancellationError")
      return true
    const msg = error.message.toLowerCase()
    return (
      msg.includes("aborted") || msg.includes("abort") || msg.includes("cancel")
    )
  }
  if (typeof error === "string") {
    const lower = error.toLowerCase()
    return (
      lower.includes("aborted") ||
      lower.includes("abort") ||
      lower.includes("cancel")
    )
  }
  if (
    typeof error === "object" &&
    "message" in (error as Record<string, unknown>)
  ) {
    const msg = String((error as Record<string, unknown>).message).toLowerCase()
    return (
      msg.includes("aborted") || msg.includes("abort") || msg.includes("cancel")
    )
  }
  return false
}

export function extractRawMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message || error.name
  }
  if (typeof error === "string") return error
  if (typeof error === "object" && error !== null) {
    if (
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
    ) {
      return (error as { message: string }).message
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error ?? "Unknown error")
}

/**
 * Resolves an error using official typed error classes from AI SDK and Daytona SDK.
 * Extracts the HTTP status code, technical error type, exact raw message, and
 * a clean user-facing string.
 */
export function resolveError(
  error: unknown,
  finishReason?: string
): ResolvedError {
  // 0. Abnormal finish reasons without standard error objects
  if (finishReason === "length") {
    return {
      userMessage:
        "The response exceeded the model's maximum output token limit and was cut off. Please ask to generate smaller files or split the work into smaller steps.",
      category: "context_length",
      errorType: "MaxOutputTokensError",
      statusCode: 400,
      code: "MAX_OUTPUT_TOKENS_EXCEEDED",
      rawMessage: error
        ? extractRawMessage(error)
        : "Generation truncated: model reached maximum output token limit (finishReason: 'length')",
    }
  }

  if (finishReason === "content-filter") {
    return {
      userMessage:
        "The response was stopped by content safety filters. Please try rephrasing your prompt.",
      category: "safety_filter",
      errorType: "SafetyFilterError",
      statusCode: 400,
      code: "SAFETY_FILTER_TRIGGERED",
      rawMessage: error
        ? extractRawMessage(error)
        : "Generation stopped: content safety filter triggered (finishReason: 'content-filter')",
    }
  }

  if (finishReason === "other") {
    return {
      userMessage:
        "The AI model generation was unexpectedly interrupted by the provider. Please try again or switch to a different model.",
      category: "service_outage",
      errorType: "UnexpectedTerminationError",
      statusCode: 502,
      code: "PROVIDER_STREAM_INTERRUPTED",
      rawMessage: error
        ? extractRawMessage(error)
        : "Generation ended prematurely: provider terminated stream unexpectedly (finishReason: 'other')",
    }
  }

  if (finishReason === "error" && !error) {
    return {
      userMessage:
        "The model encountered an internal generation error. Please try again.",
      category: "service_outage",
      errorType: "ModelGenerationError",
      statusCode: 500,
      code: "MODEL_GENERATION_FAILED",
      rawMessage: "Generation failed: model returned finishReason: 'error'",
    }
  }

  if (!error) {
    return {
      userMessage:
        "The model failed to generate a response. Please try again or select a different model.",
      category: "unknown",
      errorType: "Unknown",
      rawMessage: "No error provided",
    }
  }

  // 1. Intentional Cancellation / Aborted
  if (isAbortError(error)) {
    return {
      userMessage: "Generation was cancelled.",
      category: "aborted",
      errorType: "AbortError",
      rawMessage: extractRawMessage(error),
    }
  }

  // 2. AI SDK RetryError (multiple continuous failures across retries)
  if (RetryError.isInstance(error)) {
    const underlying = error.lastError
      ? resolveError(error.lastError)
      : undefined
    const category = underlying?.category ?? "service_outage"
    return {
      userMessage:
        underlying?.userMessage ??
        "The AI service failed after multiple retry attempts. Please try again later.",
      category,
      errorType: `RetryError(${underlying?.errorType ?? "Unknown"})`,
      statusCode: underlying?.statusCode,
      code: underlying?.code,
      rawMessage: extractRawMessage(error),
      details: {
        reason: error.reason,
        totalAttempts: error.errors?.length ?? 0,
        underlyingDetails: underlying?.details,
      },
    }
  }

  // 3. AI SDK APICallError (model provider API failure with status code)
  if (APICallError.isInstance(error)) {
    const statusCode = error.statusCode
    const raw = extractRawMessage(error)
    const lower = raw.toLowerCase()
    let code: string | undefined

    if (lower.includes("resource_exhausted")) code = "RESOURCE_EXHAUSTED"
    else if (lower.includes("rate_limit")) code = "RATE_LIMIT_EXCEEDED"
    else if (lower.includes("quota")) code = "QUOTA_EXCEEDED"

    if (statusCode === 429 || code === "RESOURCE_EXHAUSTED") {
      return {
        userMessage:
          "The AI service is experiencing high demand (Rate limit / Quota reached). Please try again in a few moments or switch to a different model.",
        category: "rate_limit",
        errorType: error.name || "APICallError",
        statusCode: 429,
        code: code || "RATE_LIMIT_EXCEEDED",
        rawMessage: raw,
        details: {
          url: error.url,
          isRetryable: error.isRetryable,
          responseBody: error.responseBody,
        },
      }
    }

    if (statusCode && statusCode >= 500) {
      return {
        userMessage: `The AI service is temporarily unavailable (HTTP ${statusCode}). Please try again shortly or choose a different model.`,
        category: "service_outage",
        errorType: error.name || "APICallError",
        statusCode,
        rawMessage: raw,
        details: { url: error.url, isRetryable: error.isRetryable },
      }
    }

    if (statusCode === 401 || statusCode === 403) {
      return {
        userMessage:
          "Authentication with the AI provider failed. Please check your configuration or API keys.",
        category: "auth_failure",
        errorType: error.name || "APICallError",
        statusCode,
        rawMessage: raw,
        details: { url: error.url },
      }
    }

    if (statusCode === 400) {
      if (lower.includes("context_length") || lower.includes("too long")) {
        return {
          userMessage:
            "The conversation has exceeded the model's capacity. Please start a new chat.",
          category: "context_length",
          errorType: error.name || "APICallError",
          statusCode: 400,
          code: "CONTEXT_LENGTH_EXCEEDED",
          rawMessage: raw,
          details: { url: error.url },
        }
      }
      if (lower.includes("safety") || lower.includes("harm_category")) {
        return {
          userMessage:
            "The response was stopped by content safety filters. Please try rephrasing your prompt.",
          category: "safety_filter",
          errorType: error.name || "APICallError",
          statusCode: 400,
          code: "SAFETY_FILTER_STOP",
          rawMessage: raw,
          details: { url: error.url },
        }
      }
    }

    return {
      userMessage:
        "The AI provider rejected the request. Please try again or choose a different model.",
      category: "service_outage",
      errorType: error.name || "APICallError",
      statusCode,
      code,
      rawMessage: raw,
      details: { url: error.url },
    }
  }

  // 4. AI SDK InvalidToolInputError / TypeValidationError
  if (InvalidToolInputError.isInstance(error)) {
    const raw = extractRawMessage(error)
    return {
      userMessage: `A tool parameter error occurred (${error.toolName || "tool"}). Please try your request again.`,
      category: "tool_validation",
      errorType: "AI_InvalidToolInputError",
      rawMessage: raw,
      details: {
        toolName: error.toolName,
        toolInput: error.toolInput,
        cause: error.cause ? String(error.cause) : undefined,
      },
    }
  }

  if (TypeValidationError.isInstance(error)) {
    const raw = extractRawMessage(error)
    return {
      userMessage:
        "A parameter validation error occurred while preparing tool arguments. Please try your request again.",
      category: "tool_validation",
      errorType: "AI_TypeValidationError",
      rawMessage: raw,
      details: {
        value: error.value,
        cause: error.cause ? String(error.cause) : undefined,
      },
    }
  }

  if (NoSuchToolError.isInstance(error)) {
    const raw = extractRawMessage(error)
    return {
      userMessage: `The model attempted to invoke an unrecognized tool (${error.toolName}). Please try your request again.`,
      category: "tool_validation",
      errorType: "NoSuchToolError",
      rawMessage: raw,
      details: {
        toolName: error.toolName,
        availableTools: error.availableTools,
      },
    }
  }

  if (LoadAPIKeyError.isInstance(error)) {
    const raw = extractRawMessage(error)
    return {
      userMessage:
        "Missing API key configuration for the selected model provider. Please check your environment settings.",
      category: "auth_failure",
      errorType: "LoadAPIKeyError",
      rawMessage: raw,
    }
  }

  if (StreamProviderError.isInstance(error)) {
    const raw = extractRawMessage(error)
    return {
      userMessage:
        "An error occurred during the streaming response from the AI provider. Please try again.",
      category: "service_outage",
      errorType: "StreamProviderError",
      statusCode: error.statusCode,
      code: error.code !== undefined ? String(error.code) : undefined,
      rawMessage: raw,
    }
  }

  // 5. Fallback String Inspection (safety net for raw grpc or non-SDK errors)
  const raw = extractRawMessage(error)
  const lower = raw.toLowerCase()

  if (
    lower.includes("out_of_credits") ||
    lower.includes("out of credits") ||
    lower.includes("insufficient credits") ||
    lower.includes("no credits")
  ) {
    return {
      userMessage: OUT_OF_CREDITS_MESSAGE,
      category: "insufficient_credits",
      errorType: "InsufficientCreditsError",
      statusCode: 402,
      code: "INSUFFICIENT_CREDITS",
      rawMessage: raw,
    }
  }

  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("overloaded")
  ) {
    return {
      userMessage:
        "The AI service is experiencing high demand (Rate limit / Quota exceeded). Please try again in a few moments or switch to a different model.",
      category: "rate_limit",
      errorType: "RateLimitError",
      statusCode: 429,
      code: "RESOURCE_EXHAUSTED",
      rawMessage: raw,
    }
  }

  if (
    lower.includes("daytona") ||
    lower.includes("sandbox") ||
    lower.includes("container") ||
    lower.includes("workspace")
  ) {
    return {
      userMessage:
        "The game sandbox environment encountered an issue. Please try again in a moment.",
      category: "sandbox_error",
      errorType: "SandboxError",
      rawMessage: raw,
    }
  }

  if (
    lower.includes("context_length") ||
    lower.includes("context length") ||
    lower.includes("token limit") ||
    lower.includes("too long")
  ) {
    return {
      userMessage:
        "The conversation has exceeded the model's capacity. Please start a new chat.",
      category: "context_length",
      errorType: "ContextLengthError",
      rawMessage: raw,
    }
  }

  if (lower.includes("safety") || lower.includes("harm_category")) {
    return {
      userMessage:
        "The response was stopped by content safety filters. Please try rephrasing your prompt.",
      category: "safety_filter",
      errorType: "SafetyError",
      rawMessage: raw,
    }
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("deadline exceeded")
  ) {
    return {
      userMessage:
        "The request was interrupted or timed out while generating a response. Please check your connection and try again.",
      category: "network_timeout",
      errorType: "TimeoutError",
      statusCode: 504,
      rawMessage: raw,
    }
  }

  if (
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("internal server error") ||
    lower.includes("service unavailable")
  ) {
    return {
      userMessage:
        "The AI service is temporarily unavailable. Please try again shortly or choose a different model.",
      category: "service_outage",
      errorType: "ServiceUnavailableError",
      statusCode: 503,
      rawMessage: raw,
    }
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("api key") ||
    lower.includes("forbidden") ||
    lower.includes("403")
  ) {
    return {
      userMessage:
        "Authentication with the AI provider failed. Please check your configuration or try another model.",
      category: "auth_failure",
      errorType: "AuthError",
      statusCode: 401,
      rawMessage: raw,
    }
  }

  return {
    userMessage:
      "The model failed to generate a response. Please try again or select a different model.",
    category: "unknown",
    errorType: error instanceof Error ? error.name : "UnknownError",
    rawMessage: raw,
  }
}

/**
 * Sanitizes model and provider errors into friendly, non-technical plain English messages.
 * Preserved for backward compatibility across the codebase.
 */
export function sanitizeErrorMessage(error: unknown): string {
  return resolveError(error).userMessage
}

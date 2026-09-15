import {
  APICallError,
  TypeValidationError,
  InvalidToolInputError,
  NoSuchToolError,
  RetryError,
  LoadAPIKeyError,
  StreamProviderError,
} from "ai"
import {
  DaytonaError,
  DaytonaRateLimitError,
  DaytonaTimeoutError,
  DaytonaConnectionError,
  DaytonaConnectionTimeoutError,
  DaytonaProcessExecutionTimeoutError,
  DaytonaAuthenticationError,
  DaytonaForbiddenError,
  DaytonaBadRequestError,
  DaytonaNotFoundError,
  DaytonaConflictError,
  DaytonaInternalServerError,
  DaytonaBadGatewayError,
  DaytonaServiceUnavailableError,
} from "@daytona/sdk"

import {
  type ResolvedError,
  type ErrorCategory,
  isAbortError,
  extractRawMessage,
  OUT_OF_CREDITS_MESSAGE,
} from "./errors"

export { type ResolvedError, type ErrorCategory, OUT_OF_CREDITS_MESSAGE }
export const resolveError = resolveServerError

/**
 * Resolves errors occurring during server-side AI execution and tool execution (Trigger.dev).
 * Uses official typed error classes from AI SDK and Daytona SDK for high-fidelity classification,
 * status code extraction, machine-readable codes, and clean user-facing explanations.
 */
export function resolveServerError(
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
      ? resolveServerError(error.lastError)
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

  // 4. AI SDK Tool & Streaming Errors
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

  // 5. Official Daytona SDK Errors
  if (error instanceof DaytonaError) {
    const raw = extractRawMessage(error)
    const statusCode = error.statusCode
    const code = error.code
    const errorType = error.constructor.name || error.name || "DaytonaError"

    if (error instanceof DaytonaRateLimitError || statusCode === 429) {
      return {
        userMessage:
          "The game sandbox environment reached a rate limit. Please wait a moment and try again.",
        category: "rate_limit",
        errorType,
        statusCode: 429,
        code: code || "DAYTONA_RATE_LIMIT",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    if (
      error instanceof DaytonaTimeoutError ||
      error instanceof DaytonaConnectionTimeoutError ||
      error instanceof DaytonaProcessExecutionTimeoutError ||
      statusCode === 504
    ) {
      return {
        userMessage:
          "Connection to the game sandbox container timed out. Please try again.",
        category: "network_timeout",
        errorType,
        statusCode: statusCode ?? 504,
        code: code || "DAYTONA_TIMEOUT",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    if (error instanceof DaytonaConnectionError) {
      return {
        userMessage:
          "Connection to the game sandbox container was interrupted. Please try again.",
        category: "network_timeout",
        errorType,
        statusCode: statusCode ?? 503,
        code: code || "DAYTONA_CONNECTION_ERROR",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    if (
      error instanceof DaytonaAuthenticationError ||
      error instanceof DaytonaForbiddenError
    ) {
      return {
        userMessage:
          "Authentication with the Daytona sandbox failed. Please check sandbox credentials.",
        category: "auth_failure",
        errorType,
        statusCode: statusCode ?? (error instanceof DaytonaAuthenticationError ? 401 : 403),
        code: code || "DAYTONA_AUTH_FAILED",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    if (error instanceof DaytonaNotFoundError) {
      return {
        userMessage:
          "The requested file or resource was not found in the game sandbox. Please check the file path and try again.",
        category: "sandbox_error",
        errorType,
        statusCode: 404,
        code: code || "DAYTONA_NOT_FOUND",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    if (error instanceof DaytonaConflictError) {
      return {
        userMessage:
          "A state conflict occurred in the game development sandbox. Please retry the operation.",
        category: "sandbox_error",
        errorType,
        statusCode: 409,
        code: code || "DAYTONA_CONFLICT",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    if (error instanceof DaytonaBadRequestError) {
      return {
        userMessage:
          "The game development sandbox rejected the request parameter or format. Please try again.",
        category: "tool_validation",
        errorType,
        statusCode: 400,
        code: code || "DAYTONA_BAD_REQUEST",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    if (
      error instanceof DaytonaInternalServerError ||
      error instanceof DaytonaBadGatewayError ||
      error instanceof DaytonaServiceUnavailableError ||
      (statusCode !== undefined && statusCode >= 500)
    ) {
      return {
        userMessage: `The game development sandbox encountered an internal error (${code || statusCode || "500"}). Please try again shortly.`,
        category: "sandbox_error",
        errorType,
        statusCode,
        code: code || "DAYTONA_SERVER_ERROR",
        rawMessage: raw,
        details: { source: error.source },
      }
    }

    return {
      userMessage: `The game sandbox encountered an issue (${code || "sandbox error"}). Please try again.`,
      category: "sandbox_error",
      errorType,
      statusCode,
      code,
      rawMessage: raw,
      details: { source: error.source },
    }
  }

  // 6. Fallback String Inspection (safety net for raw grpc or non-SDK errors)
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
    lower.includes("too long") ||
    lower.includes("finishreason: length") ||
    lower.includes("finishreason was 'length'") ||
    lower.includes("max_tokens") ||
    lower.includes("maximum output tokens") ||
    lower.includes("max output token")
  ) {
    return {
      userMessage:
        "The response exceeded the model's maximum output token limit and was cut off. Please ask to generate smaller files or split the work into smaller steps.",
      category: "context_length",
      errorType: "MaxOutputTokensError",
      statusCode: 400,
      code: "MAX_OUTPUT_TOKENS_EXCEEDED",
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

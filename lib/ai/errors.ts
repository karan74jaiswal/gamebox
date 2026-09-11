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

/**
 * Sanitizes model and provider errors into friendly, non-technical plain English messages.
 * Prevents technical jargon, stack traces, HTTP codes, and API keys from leaking to users.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) {
    return "The model failed to generate a response. Please try again or select a different model."
  }

  // Cancellation / Aborted
  if (isAbortError(error)) {
    return "Generation was cancelled."
  }

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" &&
            error !== null &&
            "message" in (error as Record<string, unknown>)
          ? String((error as Record<string, unknown>).message)
          : String(error)

  const lower = raw.toLowerCase()

  // Rate limiting / Quotas / Overloaded
  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("overloaded") ||
    lower.includes("too many requests")
  ) {
    return "The AI service is experiencing high demand. Please try again in a few moments or switch to a different model."
  }

  // Context length / Token limits
  if (
    lower.includes("context_length") ||
    lower.includes("context length") ||
    lower.includes("maximum context") ||
    lower.includes("token limit") ||
    lower.includes("too long")
  ) {
    return "The conversation has exceeded the model's capacity. Please start a new chat."
  }

  // Safety / Policy filters
  if (
    lower.includes("safety") ||
    lower.includes("harm_category") ||
    lower.includes("blocked") ||
    lower.includes("moderation") ||
    lower.includes("content filter")
  ) {
    return "The response was stopped by content safety filters. Please try rephrasing your prompt."
  }

  // Timeouts & Network
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("deadline exceeded") ||
    lower.includes("premature close") ||
    lower.includes("socket hang up") ||
    lower.includes("connection closed") ||
    lower.includes("stream ended") ||
    lower.includes("stream error") ||
    lower.includes("network error")
  ) {
    return "The request was interrupted or timed out while generating a response. Please check your connection and try again."
  }

  // Service outages / 5xx
  if (
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("internal server error") ||
    lower.includes("service unavailable") ||
    lower.includes("bad gateway")
  ) {
    return "The AI service is temporarily unavailable. Please try again shortly or choose a different model."
  }

  // Auth / Key issues
  if (
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("api key") ||
    lower.includes("forbidden") ||
    lower.includes("403")
  ) {
    return "Authentication with the AI provider failed. Please check your configuration or try another model."
  }

  return "The model failed to generate a response. Please try again or select a different model."
}

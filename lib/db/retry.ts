import * as Sentry from "@sentry/nextjs"

/**
 * Executes a database operation with exponential backoff retry and full cause logging.
 * Prevents transient Neon serverless wake-up or connection timeouts from aborting active operations.
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  context: string,
  retries = 3,
  delayMs = 500
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await operation()
    } catch (err: unknown) {
      attempt++
      const errMsg = err instanceof Error ? err.message : String(err)
      if (attempt >= retries) {
        Sentry.logger.error(
          "Database operation failed after all retries in chat",
          {
            context,
            attempt,
            maxRetries: retries,
            error: errMsg,
          }
        )
        throw err
      }
      Sentry.logger.warn("Database operation retry in chat", {
        context,
        attempt,
        maxRetries: retries,
        error: errMsg,
      })
      await new Promise((res) =>
        setTimeout(res, delayMs * Math.pow(2, attempt - 1))
      )
    }
  }
}

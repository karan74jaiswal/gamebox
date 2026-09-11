/**
 * Custom fetch middleware for Google Cloud Vertex AI streaming endpoints.
 *
 * Problems addressed:
 * 1. SSE Keepalive Comments:
 *    When using reasoning models (such as xAI Grok) on Google Cloud Vertex AI,
 *    the Vertex AI reverse proxy injects Server-Sent Event (SSE) keepalive
 *    comments (e.g. ": keepalive" or "data: : keepalive") to keep the connection
 *    alive while the model is thinking.
 *    The underlying parser in @ai-sdk/openai-compatible assumes all "data:"
 *    events contain JSON and crashes with AI_JSONParseError on ": keepalive".
 *
 * 2. Rate Limiting & Quotas (HTTP 429 Too Many Requests):
 *    Partner models on Vertex AI have strict baseline quotas (QPM requests per
 *    minute and TPM tokens per minute). In multi-step agent tool loops, rapid
 *    consecutive tool calls can temporarily exceed these limits. This middleware
 *    catches 429 responses, backs off exponentially (5s, 10s, 15s) with jitter to
 *    let the rolling 60-second quota window clear, and logs diagnostics before
 *    retrying, preventing premature agent turn failures.
 *
 * It is fully compatible with Next.js, Node.js 18+, and Trigger.dev production.
 */

function createSseKeepaliveFilterStream(): TransformStream<Uint8Array, Uint8Array> {
  let buffer = ""
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split(/\r?\n/)
      // Retain incomplete trailing line in buffer
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (
          trimmed === "data: : keepalive" ||
          trimmed === "data: :keepalive" ||
          trimmed === "data: : ping" ||
          trimmed === "data: :ping" ||
          trimmed.startsWith("data: :") ||
          (trimmed.startsWith(":") && !trimmed.startsWith("data:"))
        ) {
          // Discard heartbeat comment line
          continue
        }
        controller.enqueue(encoder.encode(line + "\n"))
      }
    },
    flush(controller) {
      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (!trimmed.startsWith("data: :") && !trimmed.startsWith(":")) {
          controller.enqueue(encoder.encode(buffer))
        }
      }
    },
  })
}

// Configuration for proactive sliding-window rate limiting
const DEFAULT_MAX_QPM = 3
const ROLLING_WINDOW_MS = 60_000

const requestTimestamps: number[] = []
let queueLock: Promise<void> = Promise.resolve()

function getMaxQpm(): number {
  const envVal = process.env.VERTEX_MAX_QPM
  if (envVal) {
    const parsed = Number.parseInt(envVal, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_MAX_QPM
}

/**
 * Proactively paces outgoing requests to Vertex AI across a rolling 60-second window.
 * Ensures we do not fire more requests than allowed by the provider's QPM quota.
 */
async function paceRequest(): Promise<void> {
  let release: () => void
  const nextLock = new Promise<void>((resolve) => {
    release = resolve
  })
  const prevLock = queueLock
  queueLock = nextLock

  await prevLock

  try {
    const maxQpm = getMaxQpm()
    const now = Date.now()

    // Prune timestamps older than 60 seconds
    while (
      requestTimestamps.length > 0 &&
      now - requestTimestamps[0] > ROLLING_WINDOW_MS
    ) {
      requestTimestamps.shift()
    }

    if (requestTimestamps.length >= maxQpm) {
      const oldest = requestTimestamps[0]
      const elapsedSinceOldest = Date.now() - oldest
      // Wait until the oldest request leaves the 60s rolling window + safety margin
      const waitMs = Math.max(1000, ROLLING_WINDOW_MS - elapsedSinceOldest + 1500)

      console.warn(
        `[Vertex AI Pacer] Approaching QPM limit (${requestTimestamps.length}/${maxQpm} in last 60s). Pausing for ${(waitMs / 1000).toFixed(1)}s to avoid 429...`
      )

      await new Promise((resolve) => setTimeout(resolve, waitMs))

      // Prune again after waiting
      const updatedNow = Date.now()
      while (
        requestTimestamps.length > 0 &&
        updatedNow - requestTimestamps[0] > ROLLING_WINDOW_MS
      ) {
        requestTimestamps.shift()
      }
    }

    requestTimestamps.push(Date.now())
  } finally {
    release!()
  }
}

const MAX_429_RETRIES = 6
// Backoff schedule covering > 5 minutes of retries: 15s, 25s, 40s, 60s, 75s, 90s
const BACKOFF_SCHEDULE_MS = [15_000, 25_000, 40_000, 60_000, 75_000, 90_000]

export async function vertexFetchWithSseFilter(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let attempt = 0

  while (true) {
    // Proactively pace outbound requests through the sliding window limiter
    if (attempt === 0) {
      await paceRequest()
    }

    const res = await fetch(input, init)

    // Handle 429 Quota / Rate Limiting errors from Google Cloud Vertex AI
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      attempt++

      // Reset the sliding window tracker to now so the pacer registers quota exhaustion
      requestTimestamps.length = 0
      requestTimestamps.push(Date.now())

      let waitMs = BACKOFF_SCHEDULE_MS[attempt - 1] ?? 60_000

      // Check standard Retry-After header
      const retryAfter = res.headers.get("retry-after")
      if (retryAfter) {
        const parsed = Number.parseFloat(retryAfter)
        if (!Number.isNaN(parsed) && parsed > 0) {
          waitMs = Math.max(waitMs, parsed * 1000)
        }
      }

      // Check for Vertex AI JSON error details (google.rpc.RetryInfo)
      try {
        const errClone = res.clone()
        const errText = await errClone.text()

        const match = errText.match(/"retryDelay":\s*"(\d+)s"/)
        if (match && match[1]) {
          const delaySec = Number.parseInt(match[1], 10)
          if (delaySec > 0) {
            waitMs = Math.max(waitMs, delaySec * 1000 + 2000)
          }
        }

        console.warn(
          `[Vertex AI 429 Quota] Attempt ${attempt}/${MAX_429_RETRIES}. Backing off for ${(waitMs / 1000).toFixed(1)}s. Details: ${errText.slice(0, 300)}`
        )
      } catch {}

      // Add jitter (1 to 2.5s) to prevent thundering herd
      waitMs += 1000 + Math.random() * 1500

      await new Promise((resolve) => setTimeout(resolve, waitMs))
      continue
    }

    // Only filter Server-Sent Event streams
    if (
      !res.body ||
      !res.headers.get("content-type")?.includes("text/event-stream")
    ) {
      return res
    }

    const filteredStream = res.body.pipeThrough(createSseKeepaliveFilterStream())

    return new Response(filteredStream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
}

import { parseEnv } from "@neon/env"
import { neon, Pool } from "@neondatabase/serverless"
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http"
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless"

import neonConfig from "@/neon"
import * as schema from "./schema"

// 1. Type-safe env validation directly against neon.ts
const { postgres } = parseEnv(neonConfig, [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
])

/**
 * 1. Pooled Connection (`db`)
 * -----------------------------------------------------------------------------
 * Routes queries through Neon's built-in PgBouncer pooler (the `-pooler` endpoint)
 * in transaction mode (`pool_mode=transaction`).
 *
 * - Scalability: Accepts up to 10,000 concurrent client connections.
 * - Transport: Uses stateless HTTP fetch via `@neondatabase/serverless`.
 *   Zero cold-start connection latency, no client-side pool exhaustion,
 *   and completely immune to prepared statement collisions.
 * - Best for: High-concurrency web requests, Next.js Server Components, Server Actions,
 *   API Route Handlers, and AI streaming. Works in any environment (Railway, Cloudflare, Docker).
 */
const sqlPooled = neon(postgres.databaseUrl)
export const db = drizzleHttp({ client: sqlPooled, schema })

/**
 * 2. Unpooled / Direct Connection (`dbUnpooled` / `dbDirect`)
 * -----------------------------------------------------------------------------
 * Connects directly to the PostgreSQL compute instance, bypassing PgBouncer.
 *
 * - Best for:
 *   - Operations requiring persistent session state (e.g. `SET search_path`, session vars)
 *   - `LISTEN` / `NOTIFY`
 *   - Session-level advisory locks
 *   - Temporary tables
 *   - Heavy analytical queries / batch jobs avoiding pooler slots
 */
const sqlUnpooled = neon(postgres.databaseUrlUnpooled)
export const dbUnpooled = drizzleHttp({ client: sqlUnpooled, schema })
export const dbDirect = dbUnpooled

/**
 * 3. WebSocket Pool Connection (`dbTx` / `dbPool`)
 * -----------------------------------------------------------------------------
 * Maintains a WebSocket connection pool via `@neondatabase/serverless` for
 * full interactive multi-statement transactions (`dbTx.transaction(async (tx) => ...)`).
 *
 * Uses a global singleton in development to avoid connection leaks during Fast Refresh.
 * Best for: Trigger.dev background workers and multi-step atomic operations.
 */
const globalForDb = globalThis as unknown as { pool?: Pool }

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: postgres.databaseUrl,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool
}

export const dbPool = drizzleWs({ client: pool, schema })
export const dbTx = dbPool

// Re-export all schema models and inferred types
export * from "./schema"

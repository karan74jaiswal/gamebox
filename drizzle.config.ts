import { config } from "dotenv"
// Load .env.local first (Next.js default), fallback to .env
config({ path: ".env.local" })
config({ path: ".env" })

import { defineConfig } from "drizzle-kit"

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED or DATABASE_URL is not set in the environment files"
  )
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
})

import { defineConfig } from "@trigger.dev/sdk"
import { additionalFiles } from "@trigger.dev/build/extensions/core"
import { esbuildPlugin } from "@trigger.dev/build/extensions"
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin"

export default defineConfig({
  project: "proj_dgvcxasnsdrzwgnurroa",
  runtime: "node-24",
  logLevel: "log",
  // Streams console.log and console.error directly to local terminal in dev
  enableConsoleLogging: true,
  // Ensure sufficient memory for multi-turn sessions with full game code files
  machine: "small-1x",
  // 1-hour session lifetime for interactive multi-turn chat agent conversations
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    // Preserve tool names, Zod schemas, and error class names (e.g. AbortError) during bundling
    keepNames: true,
    extensions: [
      additionalFiles({
        files: ["./lib/games/runtime/**"],
      }),
      esbuildPlugin(
        sentryEsbuildPlugin({
          org: "personal-0e7",
          project: "gamebox",
          authToken: process.env.SENTRY_AUTH_TOKEN,
        }),
        { placement: "last", target: "deploy" }
      ),
    ],
  },
  dirs: ["trigger"],
})

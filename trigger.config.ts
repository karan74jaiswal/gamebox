import { defineConfig } from "@trigger.dev/sdk"
import {
  additionalFiles,
  additionalPackages,
} from "@trigger.dev/build/extensions/core"
import { esbuildPlugin } from "@trigger.dev/build/extensions"
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin"

export default defineConfig({
  project: "proj_dgvcxasnsdrzwgnurroa",
  runtime: "node-24",
  logLevel: "log",
  // Streams console.log and console.error directly to local terminal in dev
  enableConsoleLogging: true,
  // Ensure sufficient memory for multi-turn sessions with full game code files
  machine: "medium-1x",
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
      // Daytona uses dynamic requires (createRequire) for Node-specific file & image utilities.
      // Installing them via additionalPackages makes them available in the production container's
      // node_modules without externalizing @daytona/sdk itself (which avoids loading its unbundled
      // OpenTelemetry HTTP instrumentation).
      additionalPackages({
        packages: [
          "busboy@^1.6.0",
          "form-data@^4.0.6",
          "tar@^7.5.11",
          "fast-glob@^3.3.3",
          "@iarna/toml@^2.2.5",
          "expand-tilde@^2.0.2",
        ],
      }),
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

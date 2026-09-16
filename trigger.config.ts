import { defineConfig } from "@trigger.dev/sdk"
import {
  additionalFiles,
  additionalPackages,
} from "@trigger.dev/build/extensions/core"
import {
  esbuildPlugin,
  type BuildExtension,
} from "@trigger.dev/build/extensions"
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin"

// `@daytona/sdk` reaches its heavier dependencies through a `require` held in a
// variable — `form-data` for uploads, `tar` and `fast-glob` for downloads and
// image contexts — which esbuild cannot see and so never pulls into the bundle.
// Locally that require still finds them in `node_modules`; a deployed worker has
// no `node_modules`, so the first `fs.uploadFiles` dies on `Cannot find module
// 'form-data'`. Leaving the package out of the bundle and installing it in the
// deployment instead puts a real `node_modules` back under those requires.
//
// `build.external` is the documented way to do that but the Trigger CLI's
// external resolution gets tripped up by `@daytona/sdk/cjs/package.json` having
// no "name" field and silently bundles it anyway. The plugin below marks it
// external directly in esbuild, while `additionalPackages` installs it into the image.
const daytonaExternal: BuildExtension = {
  name: "daytona-external",
  onBuildStart(context) {
    // Deploy-only: `trigger dev` runs unbundled off the local `node_modules`,
    // which is the arrangement this is recreating.
    if (context.target !== "deploy") {
      return
    }

    context.registerPlugin(
      {
        name: "daytona-external",
        setup(build) {
          build.onResolve({ filter: /^@daytona\/sdk(\/.*)?$/ }, (args) => ({
            path: args.path,
            external: true,
          }))
        },
      },
      { placement: "first", target: "deploy" }
    )
  },
}

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
      daytonaExternal,
      additionalPackages({
        packages: ["@daytona/sdk"],
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

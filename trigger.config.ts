import { createRequire } from "node:module"
import { join } from "node:path"

import { defineConfig } from "@trigger.dev/sdk"
import { additionalFiles } from "@trigger.dev/build/extensions/core"
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
// `build.external` is the documented way to do that and does not work here: the
// CLI marks a package external only after reading a name out of the nearest
// package.json to the resolved entry point, and for this SDK that is
// `@daytona/sdk/cjs/package.json` — a two-line `{"type": "commonjs"}` with no
// name — so the entry is dropped without a word and the package is bundled
// anyway. Hence the plugin below, which does the same job by hand.
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

    // An external is only half the fix — something has to install it. The
    // version is read from the installed package rather than pinned here so a
    // bump in package.json cannot silently deploy an older SDK than the one
    // this was typechecked against.
    const require = createRequire(join(context.workingDir, "package.json"))
    const { version } = require("@daytona/sdk/package.json")

    context.addLayer({
      id: "daytona-external",
      dependencies: { "@daytona/sdk": version },
    })
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

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const engineDir = path.resolve(__dirname, "engine")

function resolveEnginePlugin(): Plugin {
  return {
    name: "resolve-engine-from-subdirs",
    resolveId(source, importer) {
      if (source === "engine" || source.startsWith("engine/")) {
        const sub = source.slice("engine".length).replace(/^\//, "")
        return path.resolve(engineDir, sub || "index.ts")
      }
      if (source.startsWith("@/engine/")) {
        const sub = source.slice("@/engine/".length)
        return path.resolve(engineDir, sub)
      }
      if (source.startsWith("./engine/") || source === "./engine") {
        if (importer) {
          const directTarget = path.resolve(path.dirname(importer), source)
          if (
            !fs.existsSync(directTarget) &&
            !fs.existsSync(`${directTarget}.ts`)
          ) {
            const sub = source.replace(/^\.\/engine\/?/, "")
            return path.resolve(engineDir, sub || "index.ts")
          }
        }
      }
      return null
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE || "./",
  plugins: [resolveEnginePlugin()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    strictPort: true,
    hmr: false,
  },
  build: {
    target: "es2022",
  },
})

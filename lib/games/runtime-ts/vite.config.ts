import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"

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
      if (source.startsWith("@/") && importer) {
        const gamesMatch = importer.match(/(.*\/games\/[^/]+)/)
        if (gamesMatch) {
          const gameRoot = gamesMatch[1]
          const sub = source.slice(2)
          const targetInSrc = path.resolve(gameRoot, "src", sub)
          if (
            fs.existsSync(targetInSrc) ||
            fs.existsSync(`${targetInSrc}.ts`) ||
            fs.existsSync(`${targetInSrc}.tsx`) ||
            fs.existsSync(`${targetInSrc}.js`)
          ) {
            return targetInSrc
          }
          const directTarget = path.resolve(gameRoot, sub)
          if (
            fs.existsSync(directTarget) ||
            fs.existsSync(`${directTarget}.ts`) ||
            fs.existsSync(`${directTarget}.tsx`)
          ) {
            return directTarget
          }
        }
      }
      return null
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE || "./",
  plugins: [resolveEnginePlugin(), react()],
  resolve: {
    dedupe: ["react", "react-dom", "three"],
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    strictPort: true,
    hmr: false,
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        flappyEngine: path.resolve(__dirname, "games/flappy-engine/index.html"),
        knightfallEngine: path.resolve(__dirname, "games/knightfall-engine/index.html"),
        smashEngine: path.resolve(__dirname, "games/kirby-smash-engine/index.html"),
        mossboundEngine: path.resolve(__dirname, "games/mossbound-engine/index.html"),
        parkingEngine: path.resolve(__dirname, "games/parking-engine/index.html"),
        boatEngine: path.resolve(__dirname, "games/boat-engine/index.html"),
        marsEngine: path.resolve(__dirname, "games/mars-engine/index.html"),
        hoopsEngine: path.resolve(__dirname, "games/hoops-engine/index.html"),
        lawnEngine: path.resolve(__dirname, "games/lawn-engine/index.html"),
        blasterEngine: path.resolve(__dirname, "games/blaster-engine/index.html"),
        boulderEngine: path.resolve(__dirname, "games/boulder-engine/index.html"),
        experimentEngine: path.resolve(__dirname, "games/experiment-engine/index.html"),
        reefEngine: path.resolve(__dirname, "games/reef-engine/index.html"),
        swimmingEngine: path.resolve(__dirname, "games/swimming-engine/index.html"),
        breaklineEngine: path.resolve(__dirname, "games/breakline-engine/index.html"),
        vanguardEngine: path.resolve(__dirname, "games/vanguard-engine/index.html"),
        heliosEngine: path.resolve(__dirname, "games/helios-engine/index.html"),
        ninjutsuEngine: path.resolve(__dirname, "games/ninjutsu-engine/index.html"),
        soccerEngine: path.resolve(__dirname, "games/soccer-engine/index.html"),
        puttEngine: path.resolve(__dirname, "games/putt-engine/index.html"),
        pogoEngine: path.resolve(__dirname, "games/pogo-engine/index.html"),
      },
    },
  },
})

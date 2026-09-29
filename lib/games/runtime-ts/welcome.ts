import * as THREE from "three"

import {
  createEngine,
  createPostFX,
  materials,
  models,
  lights,
  math,
} from "./engine/index.ts"
import { GAMES_CATALOG, type GameMeta } from "./games/catalog.ts"

const ICONS: Record<string, string> = {
  mossbound: "⚔️",
  mossboundEngine: "⚔️",
  knightfall: "🦇",
  knightfallEngine: "🦇",
  smash: "🥊",
  smashEngine: "🥊",
  parking: "🏎️",
  parkingEngine: "🏎️",
  boat: "⛵",
  boatEngine: "🚤",
  flappy: "🐥",
  flappyEngine: "🐥",
  mars: "🚀",
  marsEngine: "🚀",
  hoops: "🏀",
  hoopsEngine: "🏀",
  lawn: "🌱",
  lawnEngine: "🌱",
  blaster: "🔫",
  blasterEngine: "🔫",
  boulder: "🏝️",
  boulderEngine: "🏝️",
  experiment: "🔬",
  experimentEngine: "🔬",
  reef: "🥥",
  reefEngine: "🥥",
  swimming: "🐠",
  swimmingEngine: "🐠",
  breakline: "🏂",
  breaklineEngine: "🏂",
  vanguard: "🛡️",
  vanguardEngine: "🛡️",
  helios: "🛸",
  heliosEngine: "🛸",
  ninjutsu: "🥷",
  ninjutsuEngine: "🥷",
  soccer: "⚽",
  soccerEngine: "⚽",
  putt: "⛳",
  puttEngine: "⛳",
  pogo: "🦘",
  pogoEngine: "🦘",
}

// 1. Detect if the player launched a specific game via URL parameter: ?game=<id> or ?template=<id>
const urlParams =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null
const requestedGameKey =
  urlParams?.get("game") || urlParams?.get("template")

if (requestedGameKey && GAMES_CATALOG[requestedGameKey]) {
  const meta = GAMES_CATALOG[requestedGameKey]
  if (meta.href && typeof window !== "undefined") {
    window.location.href = meta.href
  }
} else {
  launchWelcomeWithArcadeLauncher()
}

/**
 * Boots the default 3D spinning mark and overlays the interactive Arcade Menu.
 */
function launchWelcomeWithArcadeLauncher() {
  const EMBER = "#ea580c"
  const AMBER = "#fb923c"

  const engine = createEngine({
    background: "#0a0a0a",
    fov: 40,
    cameraPosition: [0, 2.1, 9],
    lookAt: [0, 1.15, 0],
    fog: { color: "#0a0a0a", near: 9, far: 24 },
    exposure: 0.92,
  })

  // --- The mark ---
  const FACES = [
    "#ea580c",
    "#c2410c",
    "#fb923c",
    "#7c2d12",
    "#f97316",
    "#9a3412",
  ]

  const faces = FACES.map((color) =>
    materials.standard({
      color,
      roughness: 0.72,
      metalness: 0,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.12,
    })
  )

  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), faces)
  cube.castShadow = true

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cube.geometry),
    new THREE.LineBasicMaterial({ color: new THREE.Color(EMBER) })
  )
  cube.add(edges)

  const mark = new THREE.Group()
  mark.position.y = 1.25
  mark.rotation.set(math.DEG * 18, math.DEG * 32, 0)
  mark.add(cube)
  engine.add(mark)

  // --- The room ---
  const floor = models.ground(60, { color: "#1a1a1a", accent: "#141414" })
  engine.add(floor)

  const shadow = lights.blobShadow(engine.scene, mark, {
    radius: 1.5,
    opacity: 0.5,
  })

  lights.studio(engine.scene, { intensity: 0.42 })

  const glow = new THREE.PointLight(new THREE.Color(EMBER), 34, 14, 2)
  glow.position.set(0, 0.9, -4.5)
  engine.add(glow)

  const dust = new THREE.Points(
    (() => {
      const count = 120
      const positions = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        positions[i * 3] = math.randSpread(9)
        positions[i * 3 + 1] = math.randRange(0, 7)
        positions[i * 3 + 2] = math.randSpread(6)
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      )
      return geometry
    })(),
    new THREE.PointsMaterial({
      color: new THREE.Color(AMBER),
      size: 0.05,
      map: materials.sparkTexture({ color: "#ffffff" }),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  )
  engine.add(dust)

  createPostFX(engine, {
    bloom: { strength: 0.45, radius: 0.55, threshold: 0.9 },
  })

  // --- Motion ---
  const stillness =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 1

  const dustPositions = dust.geometry.attributes.position.array as Float32Array

  engine.onUpdate((dt, elapsed) => {
    mark.rotation.y += dt * 0.55 * stillness
    mark.rotation.x =
      math.DEG * 18 + Math.sin(elapsed * 0.7) * 0.06 * stillness
    mark.position.y = 1.25 + Math.sin(elapsed * 1.1) * 0.09 * stillness
    shadow.update(0)

    glow.intensity = 34 + Math.sin(elapsed * 2.2) * 7

    for (let i = 0; i < dustPositions.length; i += 3) {
      dustPositions[i + 1] += dt * 0.32 * stillness
      if (dustPositions[i + 1] > 7) dustPositions[i + 1] = 0
    }
    dust.geometry.attributes.position.needsUpdate = true
  })

  engine.start()

  // --- Interactive Arcade Launcher UI ---
  if (typeof document !== "undefined") {
    const launcher = document.createElement("div")
    launcher.className = "arcade-launcher-container"
    launcher.innerHTML = `
      <div class="arcade-hero">
        <div class="arcade-badge">⚡ Gamebox 3D Engine</div>
        <h1>Production Game Arcade</h1>
        <p>Choose any full production 3D game to play and test live in full fidelity:</p>
      </div>

      <div class="arcade-grid">
        ${Object.values(GAMES_CATALOG)
          .filter((game, index, self) => self.findIndex((g) => g.href === game.href) === index)
          .map((t) => {
            const controlsSummary = Object.entries(t.controls)
              .map(
                ([k, v]) => `
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:2px;">
                  <strong style="color:var(--amber);">${k}:</strong> <span>${v}</span>
                </div>
              `
              )
              .join("")

            return `
              <div class="arcade-card" onclick="window.location.href = '${t.href}'">
                <div class="arcade-card-top">
                  <span class="arcade-card-icon">${ICONS[t.id] || "🎮"}</span>
                  <span class="arcade-genre-tag">${t.genre}</span>
                </div>
                <h2 class="arcade-card-title">${t.title}</h2>
                <p class="arcade-card-desc">${t.description}</p>
                <div class="arcade-card-controls">
                  ${controlsSummary}
                </div>
                <button class="arcade-card-btn">
                  <span>Play Full Game</span>
                  <span>→</span>
                </button>
              </div>
            `
          })
          .join("")}
      </div>
    `
    document.body.appendChild(launcher)
  }
}

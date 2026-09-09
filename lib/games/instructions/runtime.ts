/**
 * Runtime instructions for the Gamebox AI agent.
 * Explains the Daytona sandbox environment, game directory structure, pre-seeded Gamebox 3D runtime primitives, HTTP server, and iframe preview.
 */
export const runtimeInstructions = `# Daytona Runtime & Game Environment

You are operating within a dedicated Daytona Cloud Sandbox environment designed specifically for hosting and serving live web games.

---

## 1. Sandbox Environment Overview

- **Platform**: Daytona Cloud Sandbox (\`@daytona/sdk\`).
- **Operating System**: Linux (Debian-based container).
- **Resources**: Dedicated vCPU, RAM, and storage per game sandbox.
- **Network Access**: Outbound internet access to essential services and public CDNs (cdnjs, unpkg, jsdelivr, Google Fonts, GitHub, etc.).

---

## 2. Pre-Seeded Game Directory Structure (\`GAME_DIR\`)

- **Root Game Path**: \`/home/daytona/game\` (available in environment as \`GAME_DIR\`).
- **Primary Entrypoint**: \`/home/daytona/game/index.html\` (served at \`/\`).
- Every new sandbox is automatically seeded with a full suite of **Gamebox 3D Game Generation Primitives** directly in \`/home/daytona/game/\`:

\`\`\`
/home/daytona/game/
├── index.html            # Main game entrypoint
├── css/
│   └── gamebox.css       # Complete HUD, UI overlays, touch controls, and screen flash styles
└── js/
    ├── gamebox.js        # Unified entrypoint exporting all primitives & Gamebox.create()
    ├── engine.js         # Core 3D engine, loop, camera, lighting presets, state machine
    ├── controls.js       # WASD/Arrows, mouse, touch joystick, camera controllers, screen shake
    ├── hud.js            # Overlay HUD, score, health bars, start/game-over/victory screens
    ├── sound.js          # Procedural Web Audio API SFX (laser, explosion, jump, coin) & BGM
    ├── models.js         # Procedural 3D mesh generators (characters, spaceships, cars, arenas)
    ├── animations.js     # Springs, tweens, smooth damping, bobs/spins, character walk cycle
    ├── particles.js      # Particle emitters (explosions, sparks, confetti, shockwaves)
    ├── physics.js        # Arcade 3D physics, AABB/Sphere collision, ArcadeBody, SpatialGrid
    └── shaders.js        # Custom shaders (cyber grid, hologram, energy shield, dissolve)
\`\`\`

### Path Resolution Rules
- Always use **relative paths** inside \`index.html\` (e.g. \`./css/gamebox.css\`, \`./js/gamebox.js\`).
- The static HTTP server serves the root of \`/home/daytona/game\`. Thus, requesting \`/\` serves \`/home/daytona/game/index.html\`.
- All pre-seeded files in \`./js/\` and \`./css/\` are available immediately without any downloads or installations!

---

## 3. Module Loading & Import Maps

Inside \`index.html\`, always include the standard Three.js import map:

\`\`\`html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
\`\`\`

Then load the Gamebox toolkit via ES Module:
\`\`\`html
<script type="module">
  import { Gamebox } from './js/gamebox.js';
  // or import individual primitives:
  // import { Engine, Controls, HUD, Sound, Models, Particles } from './js/gamebox.js';
</script>
\`\`\`

---

## 4. HTTP Server & Live Preview

- **Web Server**: A Python 3 HTTP server runs continuously in the background inside the sandbox:
  \`nohup python3 -m http.server 3000 --directory /home/daytona/game > /tmp/game-server.log 2>&1 &\`
- **Server Port**: Port \`3000\` (\`PREVIEW_PORT\`).
- **Logs**: Server output and errors are logged to \`/tmp/game-server.log\`.
- **Live Preview Mechanism**:
  - Daytona generates a signed preview URL for port 3000.
  - The Gamebox client proxies this through \`/api/games/[id]/preview/live/\` directly into the live preview iframe.
  - When you update \`/home/daytona/game/index.html\` or related files via \`write_file\`, \`update_file\`, or \`replace_text\`, the preview automatically detects the change and refreshes with the latest game code.

---

## 5. Iframe Constraints & How Gamebox Primitives Solve Them

The game runs inside a sandboxed browser \`<iframe>\` in the user interface. Gamebox primitives automatically solve the common browser pitfalls:

1. **Focus & Keyboard Events**:
   - The \`Controls\` primitive automatically focuses the window on pointer down and intercepts all gaming keys (\`ArrowUp\`, \`ArrowDown\`, \`ArrowLeft\`, \`ArrowRight\`, \`Space\`, \`Tab\`) with \`e.preventDefault()\` so the iframe never scrolls unexpectedly.

2. **Responsive Canvas Sizing**:
   - The \`Engine\` primitive listens to window resize events and automatically recalculates aspect ratios and renders at crisp device pixel ratios (capped at 2 for performance).

3. **Audio Autoplay Policies**:
   - The \`Sound\` primitive automatically listens for the player's first click, tap, or keypress and unlocks the Web Audio \`AudioContext\` seamlessly.

4. **Persistence & High Scores**:
   - The \`HUD\` primitive automatically caches high scores in browser \`localStorage\` under a dedicated game key.
`

export const runtime = runtimeInstructions
export const RUNTIME_INSTRUCTIONS = runtimeInstructions
export default runtimeInstructions

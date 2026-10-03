/**
 * The 3D toolkit seeded into every sandbox, described for the agent.
 *
 * A reference rather than a tutorial: the agent can read any of these files
 * with `read_file`, but it will only think to do that if it knows what is in
 * them, and a turn spent rediscovering the toolkit is a turn not spent on the
 * game. So the surface is listed here in full, and the prose is spent on the
 * things the signatures don't say — which primitive to reach for, and what
 * goes wrong when you don't.
 *
 * Kept in step with `@/lib/games/runtime-ts/engine` by hand. If a module there
 * grows an export worth using, it belongs in this list too; an undocumented
 * primitive is one the agent will rewrite from scratch.
 */
export const engine = `# The engine

engine/ is a 3D game toolkit, already on disk, built on three.js. It exists
because every browser game needs the same hundred lines before it needs
anything of its own — colour space, pixel ratio, a resize handler, a delta-timed
loop, input that can tell held from just-pressed, trauma-based screenshake,
PBR material recipes, procedural canvas textures, authored model factories,
two-layer HUD meters, and audio mixer channels — and writing those again per
game is both slower and worse than importing them.

Use it. Reading these instead of reinventing them is the difference between a
first turn that produces a game and one that produces a renderer.

Import from the barrel, which re-exports everything:

  import {
    createGame,
    models,
    lights,
    materials,
    math,
    gameFeel,
    CameraRig,
    createMaterialKit,
  } from "./engine/index.ts"

## The whole shape of a game

  import { createGame, lights, ease, createHeroCharacter, CameraRig, createMaterialKit } from "./engine/index.ts"

  const game = createGame({
    background: "#0b1020",
    cameraPosition: [0, 6, 12],
    actions: { dash: ["ShiftLeft"], fire: ["Space", "Mouse0"] },
  })

  // 1. Atmosphere & Lighting (sunset key, fill, bounce, shadow map, neutral IBL)
  lights.sunset(game.scene, { area: 40 })

  // 2. Cohesive Material Kit
  const materialsKit = createMaterialKit({ primary: "#1e293b", trim: "#ea580c" })

  // 3. Authored Hero Model (never a placeholder cube!)
  const player = createHeroCharacter({ colors: { suit: "#1e293b", armor: "#334155", visor: "#06b6d4" } })
  game.add(player.root)

  // 4. AAA Camera Rig with lag damping, lookAhead, and built-in trauma shake
  const cameraRig = new CameraRig(game.camera, { distance: 10, height: 4.5, lag: 0.16 })
  cameraRig.snapTo(player.root.position)

  // 5. Game Loop with delta, input, game feel, and diagnostics
  game.onUpdate((dt, elapsed) => {
    player.root.position.x += game.input.move.x * 8 * dt
    player.root.position.z += game.input.move.y * 8 * dt

    if (game.input.pressed("dash")) {
      cameraRig.punchFov(6)
      game.audio.play("dash")
    }

    if (game.input.pressed("fire")) {
      game.audio.playWithCooldown("laser", 120, { vary: 0.1 })
    }
  })

  game.onLateUpdate((dt) => {
    cameraRig.update(dt, player.root.position)
  })

That is a running, lit, input-driven scene. \`createGame\` starts the loop
itself — there is nothing to call afterwards, and no reason for a game to open
on a still frame.

\`createGame(options)\` returns:
  { engine, input, hud, audio, tweens, scene, camera, renderer, onUpdate, onLateUpdate,
    onResize, add, remove, hitstop, publishDiagnostics, rng, testHooks, installTestHooks }

Options: background, fog ({ color, near, far } or exponential number), fov, near, far,
cameraPosition, lookAt, shadows, exposure, maxPixelRatio, antialias, alpha, pauseWhenHidden,
actions, environment (defaults to neutral IBL).

## engine — the loop & test hooks

\`game.engine\` carries dt, rawDt, elapsed, frame, fps, paused, timeScale, and rng.
- \`rawDt\` — real unscaled delta in seconds. Cameras, shake rigs, and feedback tweens
  read rawDt so screen feel stays live during hitstops!
- \`dt\` — simulation delta in seconds (scaled by timeScale and hitstopManager).
- \`game.hitstop(durationMs, timeScale)\` — freezes or crawls gameplay delta (e.g. 70ms at 0.05)
  on heavy impacts while keeping camera and HUD alive.
- \`game.publishDiagnostics(extra)\` — publishes renderer draw calls, triangle count, geometries,
  textures, canvas DPR, frame, and game state to \`window.__THREE_GAME_DIAGNOSTICS__\`.
- \`game.testHooks\` & \`game.installTestHooks(handlers)\` — automatically installed on
  \`window.__THREE_GAME_TEST_HOOKS__\` so QA playtest bots and screenshot visual regression tools
  can drive the game deterministically via \`seed(N)\`, \`setState(name)\`, \`setPausedForScreenshot(bool)\`,
  \`setReducedMotion(bool)\`, and \`hideDebugUi(bool)\`.
- \`setupNeutralEnvironment(renderer, scene)\` — sets up RoomEnvironment IBL for PBR materials without HDRIs.
- onUpdate(fn), onLateUpdate(fn), onResize(fn), start(), stop(), pause(), resume(), dispose().
- disposeObject(obj) — frees GPU geometry and texture memory.

## gameFeel — juice, impact, and screenshake

Game feel is communication, not decoration. Every hit, pickup, dash, and explosion must feel physical:

- \`ShakeRig\` — trauma-based screenshake. Shake is \`trauma²\` with linear 1.4/s decay and deterministic
  value noise. Recommended trauma: pickup 0.15, hit 0.4, explosion 0.7.
    const shake = new ShakeRig()
    shake.addTrauma(0.5)
    shake.update(rawDt, camera)
- \`HitstopManager\` — scales gameplay delta to 0.05 for 60-90ms on heavy contact.
- \`squashAndStretch(target, squashY, durationSec)\` — volume-preserving deformation (x * y * z ≈ 1)
  with \`easeOutBack\` overshoot settle. Use 1.15 stretch on jump takeoff, 0.88 squash on landing.
- \`FovPuncher\` — additive FOV kick (e.g. +6°) on boost or hit with exponential recovery.
- \`flashHit(material, peakIntensity, durationSec)\` — emissive flare preserving material base emissive.
- \`TweenManager\` — delta-driven tween runner:
    tweens.tween(0.3, (t) => { obj.scale.setScalar(t) }, easeOutBack)
- \`rumble(durationMs, strong, weak)\` — gamepad dual-rumble haptic feedback.

## camera — CameraRig & controllers

- \`CameraRig(camera, options)\` — professional follow camera with exponential lag damping,
  velocity lookAhead, integrated \`ShakeRig\`, and \`FovPuncher\`:
    const rig = new CameraRig(camera, { distance: 12, height: 5, lag: 0.16, lookAhead: 0.8 })
    rig.update(dt, player.position, playerVelocity)
    rig.addTrauma(0.4)
    rig.punchFov(5)
- \`createChaseCamera(camera, options)\` — relative-space chase camera with horizon roll banking.
- \`followCamera\`, \`topDownCamera\`, \`sideCamera\`, \`orbitCamera\` — legacy camera controllers.
- Controllers: \`firstPerson\`, \`thirdPerson\`, \`platformer\`, \`pointerOnGround\`, \`pointerPicker\`.

## materials — AAA PBR & procedural textures

Never use flat unshaded default materials. Use the PBR library:

- **AAA PBR Recipes**:
  \`paintedMetal\`, \`brushedMetal\`, \`rubber\`, \`mattePlastic\`, \`glossyCeramic\`,
  \`emissiveSignal\` (dark base feeds intense bloom), \`cloth\`, \`cheapGlass\`, \`refractiveGlass\`.
- **Cohesive Material Kit**:
  \`createMaterialKit(options)\` generates named shared roles:
  \`bodyPrimary\`, \`bodySecondary\`, \`trim\`, \`hazard\`, \`reward\`, \`shieldBoost\`,
  \`glass\`, \`emissiveSignal\`, \`groundContact\`, \`decalDark\`, \`decalLight\`.
- **Procedural Canvas Textures** (always RepeatWrapping + SRGBColorSpace):
  \`trimSheet({ rows, accentColor })\`, \`hazardStripes({ stripeWidth })\`,
  \`panelLines({ size, divisions })\`, \`stoneTiles({ size, rows, cols })\`, \`noiseGrain({ size, opacity })\`.
- **Shader Hooks & Sky**:
  \`applyFresnelRim(material, { rimColor, power })\`, \`applyScrollingEmissive(material, { speed, color })\`,
  \`applyWindSway(material, { speed, amplitude })\`, \`createSkyDome(scene, { topColor, horizonColor, sunColor })\`.

## models & assets — authored geometry factories

Never drop bare colored boxes into a scene. Use authored factories with articulated parts and collision bounds:

- \`createHeroVehicle(options)\` — aerodynamic hull with cockpit canopy, twin thrusters with emissive nozzles,
  tapered wings with trim bevels, undercarriage skids, and collision proxy.
- \`createHeroCharacter(options)\` — stylized articulated character with torso, head visor, shoulders,
  elbows, hips, knees, and armor plates grouped under named animation pivots.
- \`createObstacle(type, options)\` — authored hazard families: "barrier", "gate", "mine", "turret"
  with danger telegraphs, caution stripes, and collision bounds.
- \`createReward(type, options)\` — authored collectible families: "token", "shard", "capsule"
  with outer frame, glowing core, and bob/spin animations.
- \`createWorldPropKit(options)\` — modular instanceable props: road tiles, arena rails, light pylons, crates, rocks.
- \`getModelDiagnostics(root)\` — returns mesh, material, geometry, and triangle count.
- \`models.loadModel(url, options)\` — loads Draco-compressed GLB / GLTF models.
- \`instances(geometry, material, count)\`, \`merge(meshes)\`, \`createPool(factory, { size })\`.

## hud — modern game UI (not a web dashboard)

Styles and fonts are pre-injected. Fixed-width numerals prevent layout jitter during fast score updates:

- \`createHealthBar({ current, max, showShield, shield })\` — two-layer meter with delayed damage trail
  and cyan shield segment. Also available via \`game.hud.healthBar(...)\`.
- \`createObjectiveCard({ title, current, total, timeRemaining })\` — objective progress card with timer.
- \`createScoreBadge({ score, highScore, combo })\` — animated bump score badge with combo multiplier tag.
- \`createModalOverlay({ title, type, stats, actions })\` — responsive Victory / Game Over / Pause modal
  with stat grids and keyboard listeners.
- \`createTouchControls({ onMove, onAction, onlyOnTouch })\` — virtual analog thumbstick with pointer capture
  and action buttons (\`touch-action: none\`).
- Standbys: \`hud.stat\`, \`hud.toast\`, \`hud.banner\`, \`hud.flash\`, \`hud.marker\`.

\`\`\`ts
// 10-line Complete HUD Setup:
const healthBar = game.hud.healthBar({ label: "PLAYER HP", max: 100, current: 100, showShield: true })
const objective = game.hud.objectiveCard({ title: "MISSION", total: 10, current: 0 })
const scoreBadge = game.hud.scoreBadge({ score: 0, combo: 1 })

// Non-blocking intro banner on frame 1 (never show blocking modals!):
game.hud.banner("BATTLE STATIONS", "Defend the core generators!")

// Update during game loop:
healthBar.setHealth(player.hp, 100)
objective.setProgress(defeatedCount, 10)
scoreBadge.setScore(gameScore, currentCombo)
\`\`\`

## sound — Web Audio synthesiser & studio mixer

Zero audio loading delays. Never write custom \`AudioContext\` classes or \`audio.ts\` managers. Everything is synthesised on demand or streamed cleanly through \`game.audio\`:

- **Channel Groups**: \`master\`, \`sfx\`, \`ui\`, \`ambience\`, \`voice\`, \`music\`.
  \`audio.getGroupVolume(grp)\`, \`audio.setGroupVolume(grp, vol)\`, \`audio.muteGroup(grp, bool)\`.
- **Ducking**: \`audio.duck(factor, durationSec)\` — temporarily ducks music and ambience during
  hitstops or speech.
- **Cooldown Protection**: \`audio.playWithCooldown(name, cooldownMs, config)\` — eliminates repetitive
  machine-gun audio on rapid firing or collisions.
- **3D Spatial Audio**: \`audio.playAt(name, soundPosition, listenerPositionOrCamera, { maxDistance })\`
  with distance attenuation and stereo panning.
- **Sound Vocabulary**:
  - UI: \`hover\`, \`confirm\`, \`cancel\`, \`pause\`, \`click\`, \`blip\`, \`select\`
  - Movement: \`jump\`, \`land\`, \`dash\`, \`boost\`, \`drift\`
  - Interaction: \`coin\`, \`pickup\`, \`hit\`, \`hurt\`, \`shield\`, \`score\`, \`checkpoint\`
  - Threat: \`laser\`, \`shoot\`, \`explosion\`, \`alarm\`, \`warning\`, \`impact\`
  - Fanfare: \`win\`, \`lose\`, \`powerup\`, \`whoosh\`, \`thud\`
  - Pass \`{ vary: 0.1 }\` to add slight pitch jitter so repeated sounds stay lively!
- **Streaming Music**: \`audio.playMusic(url, { loop, fadeIn })\` and \`audio.stopMusic(fadeOut)\`.

\`\`\`ts
// Play SFX with cooldown and pitch variance:
game.audio.playWithCooldown("laser", 120, { vary: 0.15, volume: 0.8 })
game.audio.play("explosion")

// Stream generated music track cleanly:
game.audio.playMusic("./assets/audio/theme.mp3", { loop: true, fadeIn: 1.5, volume: 0.4 })

// Define custom procedural sound recipes if unique audio is needed:
game.audio.define("thunder", () => {
  game.audio.noise({ duration: 0.5, frequency: 350, sweep: -200, gain: 0.6 })
  game.audio.tone({ frequency: 90, slide: -40, duration: 0.35, type: "sawtooth" })
})
\`\`\`

## 3d aiming & crosshair convergence (preventing weapon parallax)

In first-person or third-person shooters, weapons are held down and to the side (e.g. \`x: +0.4, y: -0.3\`). Never fire parallel to the camera vector, or the shot will permanently miss the crosshair! Always **converge** the projectile toward the camera's aim point:

\`\`\`ts
// 1. Raycast or project forward from camera center to find the aim target in the distance:
const cameraForward = camera.getWorldDirection(new THREE.Vector3())
const aimTarget = camera.position.clone().add(cameraForward.multiplyScalar(60))

// 2. Compute projectile direction from weapon muzzle to the aim target:
const shootDir = aimTarget.sub(weaponMuzzleWorldPos).normalize()

// 3. Spawn projectile along convergent direction:
spawnProjectile(weaponMuzzleWorldPos, shootDir)
\`\`\`

## entity caching & memory hygiene (hero switching & waves)

Never reallocate \`THREE.BufferGeometry\` buffers when switching heroes or spawning waves:

\`\`\`ts
// Cache compound models in a dictionary:
const heroCache: Record<string, THREE.Group> = {}

function switchHero(heroId: string) {
  activeHero.visible = false
  if (!heroCache[heroId]) {
    heroCache[heroId] = buildHeroRig(heroId)
    game.scene.add(heroCache[heroId])
  }
  heroCache[heroId].position.copy(activeHero.position)
  heroCache[heroId].visible = true
  activeHero = heroCache[heroId]
}

// When dynamically destroying enemies or particles, dispose GPU memory:
engine.disposeObject(mesh)
\`\`\`

## physics — arcade collision vs Rapier

- \`createPhysics({ gravity })\` — fast, tight arcade collision:
  \`world.addGround(y)\`, \`world.addBox(mesh)\`, \`world.addBody({ radius, height })\`,
  \`addBody({ trigger: true, onEnter, onExit })\`, \`world.raycast()\`, \`hits(a, b, rA, rB)\`.
- For real rigid-body simulation (pinball, billiards, rolling balls, destructibles), use
  pre-installed \`@dimforge/rapier3d-compat\` with a fixed timestep accumulator (\`1/60\`).

## state — game lifecycle & state machine (Loading → Start → Playing → Pause → Over/Victory)

Every game must manage its full lifecycle cleanly without screen flicker or lingering game logic after death/victory:

\`\`\`ts
// Professional 5-State Game Lifecycle:
let startModal: any = null
let pauseModal: any = null
let endModal: any = null

const fsm = createStateMachine({
  // 1. Loading: Preload textures/audio and pre-compile shaders to eliminate flicker & lag
  loading: {
    enter() {
      // Pre-compile all scene materials and shaders into GPU cache:
      renderer.compile(scene, camera)
      // Transition to Start screen once assets & shaders are ready:
      fsm.go("start")
    }
  },

  // 2. Start Screen: Tells controls, narrative premise, and unlocks Web Audio on click
  start: {
    enter() {
      startModal = createModalOverlay({
        title: "STELLAR DEFENDER",
        type: "info",
        subtitle: "Defend the core reactor from rogue automated drones.",
        stats: [
          { label: "Movement", value: "WASD / Arrows" },
          { label: "Aim & Fire", value: "Mouse / Left Click" },
          { label: "Dash Boost", value: "Space / Shift" },
          { label: "Pause Menu", value: "P / Esc" }
        ],
        actions: [{
          label: "START MISSION",
          onClick: () => {
            startModal?.remove()
            // Unlocks audio and streams BGM cleanly on user gesture:
            game.audio.playMusic("./assets/audio/theme.mp3", { loop: true, fadeIn: 1 })
            fsm.go("playing")
          }
        }]
      })
    }
  },

  // 3. Playing: 60 FPS responsive active gameplay
  playing: {
    enter() {
      engine.resume()
    }
  },

  // 4. Paused: Freeze gameplay simulation while keeping UI responsive
  paused: {
    enter() {
      engine.pause()
      pauseModal = createModalOverlay({
        title: "GAME PAUSED",
        type: "pause",
        actions: [
          { label: "RESUME", onClick: () => { pauseModal?.remove(); fsm.go("playing") } },
          { label: "RESTART", onClick: () => { pauseModal?.remove(); resetGame(); fsm.go("playing") } }
        ]
      })
    },
    exit() {
      pauseModal?.remove()
    }
  },

  // 5. Game Over / Victory: Simulation MUST be completely stopped
  over: {
    enter(payload: { won?: boolean; score: number; time: number }) {
      // Playing logic is fully halted (see guard in onUpdate below!)
      endModal = createModalOverlay({
        title: payload.won ? "VICTORY ACHIEVED" : "MISSION FAILED",
        type: payload.won ? "victory" : "defeat",
        subtitle: payload.won ? "All enemy threats eliminated!" : "The core was destroyed.",
        stats: [
          { label: "Final Score", value: payload.score },
          { label: "Time Survived", value: \`\${Math.round(payload.time)}s\` }
        ],
        actions: [{
          label: "PLAY AGAIN",
          onClick: () => {
            endModal?.remove()
            resetGame()
            fsm.go("playing")
          }
        }]
      })
    }
  }
}, "loading", engine)

// Key listeners for Pause (Esc/P) and Restart (R):
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (fsm.is("playing")) fsm.go("paused")
    else if (fsm.is("paused")) fsm.go("playing")
  } else if (e.code === "KeyR" && (fsm.is("over") || fsm.is("paused"))) {
    endModal?.remove()
    pauseModal?.remove()
    resetGame()
    fsm.go("playing")
  }
})

// IN THE GAME LOOP: CRITICAL SIMULATION HALT GUARD
engine.onUpdate((dt) => {
  // Completely stops player movement, enemy updates, spawns, and timers when not playing!
  if (!fsm.is("playing")) return

  updatePlayer(dt)
  updateEnemies(dt)
  checkCollisions()
  hud.update()
})
\`\`\`

- \`createScore({ hud, key })\` — automatically syncs high score to localStorage.
- \`createStorage(ns)\` — never throws in private browser windows.
- \`createTimer\`, \`createTicker\`, \`createCooldown\`, \`createDifficulty\`, \`createEvents\`.

## math & seeded RNG

- \`createSeededRandom(seed)\` — deterministic seeded RNG function for reproducible playtests and visual QA.
- \`clamp\`, \`lerp\`, \`inverseLerp\`, \`remap\`, \`damp(current, target, lambda, dt)\`, \`smoothstep\`,
  \`angleDelta\`, \`deadzone\`, \`randRange\`, \`randSpread\`, \`pick\`, \`shuffle\`, \`ease\`.

## Golden Rules

1. **Always use the toolkit**: Never reinvent screenshake, PBR materials, follow cameras, or health bars.
2. **Never ship placeholders**: No bare cubes, spheres, or flat unlit planes. Use \`createHeroVehicle\`, \`createHeroCharacter\`, \`createMaterialKit\`, or authored geometry combinations.
3. **Multiply movement by dt**: Any per-frame motion must use \`dt\`. Smoothed values use \`damp(..., dt)\`.
4. **Always provide audio feedback**: Play varied audio on every jump, hit, dash, and score event via \`game.audio\`. NEVER author custom \`AudioContext\` classes.
5. **Always converge weapon projectiles**: Raycast forward from camera center and converge weapon muzzle direction to the aim point to eliminate parallax error.
6. **Route randomness through seeded RNG**: Use \`game.rng\` or \`createSeededRandom(seed)\` so test hooks and bot playtests remain deterministic.
7. **Always enforce full game lifecycle**: Pre-warm shaders in loading (\`renderer.compile\`), display controls on Start Screen (unlocking audio on click), support pause (\`Esc\` / \`P\`), and completely halt simulation logic on Game Over or Victory.
`

export const engineInstructions = engine
export default engine

import { GAME_DIR, PREVIEW_PORT } from "@/lib/daytona/utils"

/**
 * The sandbox the game is built in and served from.
 *
 * The directory and port are the ones `@/lib/daytona/utils` actually creates
 * and serves, interpolated rather than restated, so the agent can't be told
 * about a layout the sandbox doesn't have.
 */
export const runtime = `# Where the game lives

Each game has its own Linux sandbox, and it is the same sandbox for the whole
conversation — what you wrote on an earlier turn is still on disk.

The game's source lives in ${GAME_DIR}. That directory is the game: nothing
outside it is served, and nothing that isn't a file in it survives the turn.

${GAME_DIR}/index.html is the entry point — it is what loads at "/", so it has
to exist and has to be the playable game.

# What is already there

A new sandbox is not empty. It starts with:

- index.html — the page and entry point for the preview.
- style.css — a full-bleed canvas, no scrolling, no tap highlights.
- welcome.ts — the holding screen. Replace it with your game's main script on
  the first turn; it is a placeholder, not part of any game.
- The error reporter script in <head> — catches whatever the page throws and
  hands it to the preview panel, which is how a game that fails to start says so
  instead of showing a black frame. Don't remove it from index.html, and leave
  its <script> tag first in <head>, above your own scripts. A reporter that
  loads after the file that broke reports nothing.
- engine/ — a 3D game toolkit, described in its own section. Read that before
  building anything, and do not rewrite these files.

# How it reaches the player

A Vite development server is already running on port ${PREVIEW_PORT} against that
directory, and the preview panel loads it in an iframe. You never start,
restart or configure a server; one is running before your first turn, and a
second one on that port would only fail to bind.

TypeScript (.ts) and modern ES modules are supported out of the box. Vite
transpiles your code on the fly in milliseconds as files are saved:

- Write clean, strongly typed TypeScript (e.g. game.ts, player.ts) or JavaScript.
- Your own modules load by relative path: "./player.ts", "./engine/index.ts".
- Everything runs in the player's browser. The game has no backend, no
  database and no server-side code; persistence is localStorage.

# Libraries and imports

Installed locally in the project and resolved automatically by Vite:

- "three" — the library itself.
- "three/addons/..." — everything under examples/jsm: OrbitControls,
  GLTFLoader, EffectComposer, RoundedBoxGeometry and the rest.
- "@dimforge/rapier3d-compat" — full 3D physics engine (Rust/WASM) for rigid
  bodies, colliders, sensors, and simulation (marbles, pinball, mini-golf, stacks).
- "lil-gui" — floating GUI for live-tuning game variables and parameters.

  import * as THREE from "three"
  import { OrbitControls } from "three/addons/controls/OrbitControls.js"
  import RAPIER from "@dimforge/rapier3d-compat"
  import GUI from "lil-gui"

The engine toolkit is available at ./engine/index.ts.

Any other library has to come from a CDN by full url, loaded by the page.

# Procedural Art & Graphics (Confident In-Memory Generation)

Three.js is an ultra-capable procedural 3D engine. You do not need external model downloads or image hosting — 100% of textures, materials, compound meshes, lighting, and audio are generated procedurally in memory with zero network latency, zero broken URLs, and instant loading:

1. Procedural PBR Textures (CanvasTexture):
   - Draw dynamic surface patterns to an in-memory HTML5 <canvas> (stone tiles, cobblestone, wood grain, sci-fi hull panels, runic glyphs, neon grids, noise/grain for roughness).
   - Wrap with \`new THREE.CanvasTexture(canvas)\`. Set \`wrapS = wrapT = THREE.RepeatWrapping\` and \`texture.repeat.set(rx, ry)\`.
   - Always set \`texture.anisotropy = 8\` so receding floors stay crisp rather than blurring to mush.
   - Use canvas textures for \`map\`, \`roughnessMap\`, \`bumpMap\`, and \`emissiveMap\`. Engine helpers like \`materials.checkerTexture\`, \`materials.gridTexture\`, and \`materials.noiseTexture\` are ready to use.

2. Architectural & Compound Geometry:
   - Never place solitary, raw unstyled boxes. Assemble multi-part compound structures:
     - Dungeons & Ruins: Beveled wall segments (\`RoundedBoxGeometry\`), stone archways (\`ExtrudeGeometry\` or \`TorusGeometry\`), altar pedestals with stepped moldings, and wall sconces.
     - Characters & Props: Multi-segment bodies, weapons with hilts and glowing blades, floating runestones, wizard staves.
     - Vehicles & Mechs: Multi-part chassis, wheels, cockpits, thruster cones.
   - Group child meshes under named objects in a \`THREE.Group\` (\`root.add(cockpit)\`, \`root.add(wingLeft)\`, \`root.add(thruster)\`).
   - Use \`THREE.InstancedMesh\` for repeated world elements (pillars, stone slabs, crates, foliage) to keep draw calls minimal.

3. Atmospheric Lighting & Depth:
   - Combine a key directional light (\`castShadow = true\`, sized shadow camera, \`normalBias = 0.02\`) with a colored fill/ambient light (e.g. warm sunlight with sky bounce). Use engine rigs: \`lights.sunset\`, \`lights.night\`, \`lights.daylight\`, \`lights.moody\`.
   - Place local \`THREE.PointLight\`s with tight radius and decay for torches, campfires, glowing runes, and thrusters (\`lights.attachLight\`).
   - Atmospheric fog: Always set \`scene.fog = new THREE.FogExp2(themeColor, density)\` to establish depth, scale, and environmental mystery.

4. Post-Processing & Emissive Bloom:
   - Enable the engine's built-in UnrealBloomPass via \`createPostFX(scene, camera, renderer, { bloom: true, vignette: true, fxaa: true })\`.
   - Set \`emissive: new THREE.Color(...)\` and \`emissiveIntensity: 1.5+\` on runes, spells, lasers, and engine exhausts to produce brilliant HDR glows.

5. Synthesized Audio & Visual Juice:
   - Generate dynamic sound effects using \`engine/sound.ts\` (\`audio.play\`, \`audio.playWithCooldown\`, \`audio.duck\`, \`audio.playAt\`) across dedicated mixer groups (\`master\`, \`sfx\`, \`ui\`, \`ambience\`, \`voice\`, \`music\`).
   - Deliver punchy tactile feedback via \`engine/game-feel.ts\` (\`ShakeRig\` trauma screenshake, \`HitstopManager\` impact freeze, \`squashAndStretch\` volume-preserving bounce, \`FovPuncher\`, \`flashHit\` emissive flare, and \`rumble\`).
   - Spawn dynamic particles via \`engine/particles.ts\` (\`createParticles\`, \`createExplosion\`, \`createTrail\`) or \`THREE.Points\` for embers, magical dust motes, and impact sparks.

# Layout

Keep all game code flat at the root beside index.html (e.g. ./game.ts,
./player.ts, ./enemies.ts). Do not create a src/ or js/ directory; everything
lives flat in the root next to engine/. As the game grows, split it into more
modules next to it rather than letting one file sprawl — you will be reading
this code back on every later turn. Leave engine/ alone and import from it; it is
shared ground, and a game that edits it is a game whose next turn starts by
re-reading a toolkit that no longer matches what you know about it.

# Asset directories & generation

Game assets are organized under assets/:
- assets/textures/ — 2D PBR textures, environment maps, and sprites created via generate_texture (e.g. assets/textures/dungeon_stone.png). Load in Three.js with:
  const texture = new THREE.TextureLoader().load('./assets/textures/dungeon_stone.png')
- assets/audio/ — Background music tracks and ambient audio loops created via generate_music (e.g. assets/audio/dungeon_theme.mp3). Play with:
  const bgm = new Audio('./assets/audio/dungeon_theme.mp3')
  bgm.loop = true
  document.addEventListener('pointerdown', () => bgm.play(), { once: true })`

export const runtimeInstructions = runtime
export default runtime

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

# three.js and imports

Three.js is installed locally in the project and resolved automatically by Vite:

- "three" — the library itself.
- "three/addons/..." — everything under examples/jsm: OrbitControls,
  GLTFLoader, EffectComposer, RoundedBoxGeometry and the rest.

  import * as THREE from "three"
  import { OrbitControls } from "three/addons/controls/OrbitControls.js"

The engine toolkit is available at ./engine/index.ts.

Any other library has to come from a CDN by full url, loaded by the page.

# Assets

Beyond three.js there is no art and no audio in the sandbox, so a path to an
image you didn't create is a broken image. Build models out of geometry
(engine/models.ts has a shelf of them), draw textures to a canvas
(engine/materials.ts), and synthesise sound (engine/sound.ts). Reach for a CDN
url only when you are certain of it.

# Layout

Keep all game code flat at the root beside index.html (e.g. ./game.ts,
./player.ts, ./enemies.ts). Do not create a src/ or js/ directory; everything
lives flat in the root next to engine/. As the game grows, split it into more
modules next to it rather than letting one file sprawl — you will be reading
this code back on every later turn. Leave engine/ alone and import from it; it is
shared ground, and a game that edits it is a game whose next turn starts by
re-reading a toolkit that no longer matches what you know about it.`

export const runtimeInstructions = runtime
export default runtime

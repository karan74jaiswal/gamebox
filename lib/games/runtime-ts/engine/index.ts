/**
 * The game toolkit, in one import.
 *
 *   import { createGame, models, lights } from "./engine/index.ts"
 *
 * Two ways in. `createGame()` wires up everything a game always needs — a
 * renderer, a loop, input, a HUD, sound and tweens — in one call, and is where
 * a new game should start. Or import the pieces individually and assemble them
 * yourself; nothing here depends on `createGame` existing.
 *
 * Modules are grouped as namespaces (`models.tree()`, `lights.sunset()`) so
 * names stay short without colliding, with the things you reach for constantly
 * also exported flat.
 */

import { createEngine } from "./engine.ts"
import { createInput } from "./input.ts"
import { createHud } from "./hud.ts"
import { createAudio } from "./sound.ts"
import { createTweens } from "./animation.ts"
import type { Game, GameOptions } from "./types.ts"

export * from "./types.ts"

export * as math from "./math.ts"
export * as models from "./models.ts"
export * as materials from "./materials.ts"
export * as lights from "./lighting.ts"
export * as effects from "./particles.ts"
export * as anim from "./animation.ts"
export * as debug from "./debug.ts"

export { createEngine, disposeObject } from "./engine.ts"
export { createInput } from "./input.ts"
export { createHud } from "./hud.ts"
export { createAudio } from "./sound.ts"
export { createPhysics, hits, inside } from "./physics.ts"
export { createPostFX } from "./postfx.ts"

export {
  createTweens,
  createMixer,
  createShake,
  Spring,
  SpringVec3,
  flash,
  pop,
  hover,
  ease,
} from "./animation.ts"

export {
  createParticles,
  createTrail,
  createAmbience,
  shockwave,
} from "./particles.ts"

export {
  createStateMachine,
  createScore,
  createStorage,
  createTimer,
  createTicker,
  createCooldown,
  createDifficulty,
  createEvents,
  formatTime,
} from "./state.ts"

export {
  orbitCamera,
  followCamera,
  topDownCamera,
  sideCamera,
  firstPerson,
  thirdPerson,
  platformer,
  pointerOnGround,
  pointerPicker,
} from "./controls.ts"

export { palette, brand } from "./materials.ts"

/**
 * Everything a game needs, started and ready.
 *
 * The returned object is deliberately flat, because these five things are
 * referenced constantly and `game.engine.scene` reads worse than `game.scene`
 * a hundred times over.
 *
 *   const game = createGame({ background: "#0b1020" })
 *   lights.daylight(game.scene)
 *   game.scene.add(models.ground(60))
 *   game.onUpdate((dt) => { ... })
 *
 * The loop is already running when this returns — there is nothing to start,
 * and no reason for a game to open on a still frame.
 */
export function createGame(options: GameOptions = {}): Game {
  const { actions, hud: hudOptions = {}, ...engineOptions } = options

  const engine = createEngine(engineOptions)
  const input = createInput({ engine, actions })
  const hud = createHud({ container: engine.container, ...hudOptions })
  const audio = createAudio()
  const tweens = createTweens(engine)

  engine.start()

  const game: Game = {
    engine,
    input,
    hud,
    audio,
    tweens,
    scene: engine.scene,
    camera: engine.camera,
    renderer: engine.renderer,
    onUpdate: engine.onUpdate,
    onLateUpdate: engine.onLateUpdate,
    onResize: engine.onResize,
    add: engine.add,
    remove: engine.remove,
  }

  if (typeof window !== "undefined") {
    ;(window as unknown as { __GAME__?: unknown }).__GAME__ = game
  }

  return game
}

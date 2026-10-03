/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Comprehensive test suite for lib/games/runtime-ts/engine
 * Tests every module, function, mathematical property, and edge case.
 */

import assert from "node:assert/strict"
import * as THREE from "three"

// --- Minimal Mock DOM Environment for Node.js ---
class MockCanvasContext2D {
  fillStyle: any = ""
  strokeStyle: any = ""
  lineWidth: number = 1
  font: string = ""
  textAlign: string = ""
  textBaseline: string = ""

  fillRect() {}
  strokeRect() {}
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  arc() {}
  ellipse() {}
  stroke() {}
  fill() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  setLineDash() {}
  roundRect() {}
  createImageData(w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4) }
  }
  putImageData() {}
  createLinearGradient() {
    return { addColorStop() {} }
  }
  createRadialGradient() {
    return { addColorStop() {} }
  }
  measureText(text: string) {
    return { width: text.length * 10 }
  }
  fillText() {}
}

class MockElement {
  style: Record<string, any> = {}
  dataset: Record<string, string> = {}
  classList = {
    add() {},
    remove() {},
  }
  children: any[] = []
  innerHTML: string = ""
  textContent: string = ""
  width: number = 256
  height: number = 256
  offsetWidth: number = 100

  getContext(type: string) {
    if (type === "2d") return new MockCanvasContext2D()
    return null
  }
  appendChild(child: any) {
    this.children.push(child)
    return child
  }
  remove() {}
  replaceChildren() {
    this.children = []
  }
  querySelector(sel: string) {
    return new MockElement()
  }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 }
  }
  animate() {
    return { onfinish: null as any }
  }
  setPointerCapture() {}
  releasePointerCapture() {}
}

const mockLocalStorage = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (key: string) => mockLocalStorage.get(key) ?? null,
  setItem: (key: string, val: string) => mockLocalStorage.set(key, String(val)),
  removeItem: (key: string) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear(),
  keys: () => Array.from(mockLocalStorage.keys()),
}
Object.defineProperty((globalThis as any).localStorage, "length", {
  get: () => mockLocalStorage.size,
})

;(globalThis as any).window = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: (query: string) => ({ matches: false }),
}

;(globalThis as any).document = {
  createElement: (tag: string) => new MockElement(),
  createElementNS: (ns: string, tag: string) => new MockElement(),
  head: new MockElement(),
  body: new MockElement(),
  getElementById: (id: string) => null,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}

;(globalThis as any).matchMedia = (query: string) => ({ matches: false })

// --- Import Engine Modules ---
import * as math from "../lib/games/runtime-ts/engine/math.ts"
import * as materials from "../lib/games/runtime-ts/engine/materials.ts"
import * as lighting from "../lib/games/runtime-ts/engine/lighting.ts"
import * as models from "../lib/games/runtime-ts/engine/models.ts"
import * as physics from "../lib/games/runtime-ts/engine/physics.ts"
import * as animation from "../lib/games/runtime-ts/engine/animation.ts"
import * as state from "../lib/games/runtime-ts/engine/state.ts"
import * as particles from "../lib/games/runtime-ts/engine/particles.ts"
import * as sound from "../lib/games/runtime-ts/engine/sound.ts"
import * as hud from "../lib/games/runtime-ts/engine/hud.ts"
import * as debug from "../lib/games/runtime-ts/engine/debug.ts"
import * as gameFeel from "../lib/games/runtime-ts/engine/game-feel.ts"
import * as camera from "../lib/games/runtime-ts/engine/camera.ts"
import * as engineModule from "../lib/games/runtime-ts/engine/engine.ts"
import * as runtime from "../lib/games/runtime-ts/engine/index.ts"

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(err)
  }
}

console.log("\n🧪 Running runtime-ts Test Suite...\n")

// ============================================================================
// 1. Math Module Tests
// ============================================================================
console.log("▶ Testing math.ts")

test("clamp constraints", () => {
  assert.equal(math.clamp(5, 0, 10), 5)
  assert.equal(math.clamp(-5, 0, 10), 0)
  assert.equal(math.clamp(15, 0, 10), 10)
  assert.equal(math.clamp01(1.5), 1)
  assert.equal(math.clamp01(-0.5), 0)
})

test("lerp, inverseLerp, and remap", () => {
  assert.equal(math.lerp(10, 20, 0.5), 15)
  assert.equal(math.inverseLerp(10, 20, 15), 0.5)
  assert.equal(math.inverseLerp(10, 10, 10), 0)
  assert.equal(math.remap(5, 0, 10, 0, 100), 50)
})

test("damp, dampVec, dampQuat", () => {
  const d = math.damp(0, 10, 5, 0.1)
  assert.ok(d > 0 && d < 10)

  const v1 = new THREE.Vector3(0, 0, 0)
  const v2 = new THREE.Vector3(10, 10, 10)
  math.dampVec(v1, v2, 5, 0.1)
  assert.ok(v1.x > 0 && v1.x < 10)

  const q1 = new THREE.Quaternion()
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  math.dampQuat(q1, q2, 5, 0.1)
  assert.ok(q1.y > 0)
})

test("moveTowards and wrap", () => {
  assert.equal(math.moveTowards(0, 10, 2), 2)
  assert.equal(math.moveTowards(1, 2, 5), 2)
  assert.equal(math.wrap(5, 0, 4), 1)
  assert.equal(math.wrap(-1, 0, 4), 3)
})

test("angles and deadzone", () => {
  const delta = math.angleDelta(0, Math.PI * 1.5)
  assert.ok(Math.abs(delta - (-Math.PI * 0.5)) < 1e-5)
  assert.equal(math.deadzone(0.1, 0.15), 0)
  assert.ok(math.deadzone(0.5, 0.15) > 0)
})

test("seeded random generator reproducibility", () => {
  const rng1 = math.createRandom(42)
  const rng2 = math.createRandom(42)
  for (let i = 0; i < 10; i++) {
    assert.equal(rng1.next(), rng2.next())
    assert.equal(rng1.range(1, 100), rng2.range(1, 100))
    assert.equal(rng1.int(1, 50), rng2.int(1, 50))
  }
})

test("easing functions boundary values", () => {
  for (const [name, fn] of Object.entries(math.ease)) {
    assert.ok(Math.abs(fn(0) - 0) < 0.05, `ease.${name}(0) should be close to 0`)
    assert.ok(Math.abs(fn(1) - 1) < 0.05, `ease.${name}(1) should be close to 1`)
  }
})

// ============================================================================
// 2. Materials Module Tests
// ============================================================================
console.log("\n▶ Testing materials.ts")

test("palette and brand definition", () => {
  assert.ok(materials.brand.ember)
  assert.ok(materials.palette.red)
  assert.equal(materials.palette.ember, materials.brand.ember)
})

test("mix and shade colors", () => {
  const mixed = materials.mix("#000000", "#ffffff", 0.5)
  assert.ok(mixed instanceof THREE.Color)
  assert.ok(Math.abs(mixed.r - 0.5) < 0.01)

  const shaded = materials.shade("#888888", 0.2)
  assert.ok(shaded instanceof THREE.Color)
})

test("standard and specialized materials", () => {
  const std = materials.standard({ color: "#ff0000" })
  assert.ok(std instanceof THREE.MeshStandardMaterial)
  assert.equal(std.roughness, 0.75)

  const mat = materials.matte("#00ff00")
  assert.equal(mat.roughness, 0.95)

  const mtl = materials.metal("#0000ff")
  assert.equal(mtl.metalness, 1)

  const glw = materials.glow("#ffff00", { intensity: 2 })
  assert.equal(glw.emissiveIntensity, 2)

  const flt = materials.flat("#ffffff")
  assert.ok(flt instanceof THREE.MeshBasicMaterial)

  const tn = materials.toon("#ff00ff")
  assert.ok(tn instanceof THREE.MeshToonMaterial)

  const gls = materials.glass()
  assert.ok(gls instanceof THREE.MeshPhysicalMaterial)
  assert.equal(gls.transmission, 0.95)

  const wire = materials.wireframe()
  assert.equal(wire.wireframe, true)
})

test("outline helper mesh", () => {
  const parentMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  const out = materials.outline(parentMesh, { color: "#000000", thickness: 0.1 })
  assert.ok(out instanceof THREE.Mesh)
  assert.equal(parentMesh.children.includes(out), true)
  assert.equal((out.material as THREE.MeshBasicMaterial).side, THREE.BackSide)
})

test("procedural canvas textures", () => {
  const checker = materials.checkerTexture()
  assert.ok(checker instanceof THREE.CanvasTexture)
  assert.equal(checker.colorSpace, THREE.SRGBColorSpace)

  const grid = materials.gridTexture()
  assert.ok(grid instanceof THREE.CanvasTexture)

  const noise = materials.noiseTexture()
  assert.ok(noise instanceof THREE.CanvasTexture)

  const grad = materials.gradientTexture([
    [0, "#ff0000"],
    [1, "#0000ff"],
  ])
  assert.ok(grad instanceof THREE.CanvasTexture)

  const spark = materials.sparkTexture()
  assert.ok(spark instanceof THREE.CanvasTexture)

  const txt = materials.textTexture("Score: 100")
  assert.ok(txt instanceof THREE.CanvasTexture)
})

// ============================================================================
// 3. Models Module Tests
// ============================================================================
console.log("\n▶ Testing models.ts")

test("primitive models creation", () => {
  const b = models.box([2, 3, 4])
  assert.ok(b instanceof THREE.Mesh)
  assert.ok(b.castShadow && b.receiveShadow)

  const s = models.sphere(1.5)
  assert.ok(s.geometry instanceof THREE.SphereGeometry)

  const cyl = models.cylinder(1, 2)
  assert.ok(cyl.geometry instanceof THREE.CylinderGeometry)

  const cn = models.cone(1, 2)
  assert.ok(cn.geometry instanceof THREE.ConeGeometry)

  const cap = models.capsule(0.5, 2)
  assert.ok(cap.geometry instanceof THREE.CapsuleGeometry)

  const tor = models.torus(1, 0.2)
  assert.ok(tor.geometry instanceof THREE.TorusGeometry)
})

test("ground plane and arena boundaries", () => {
  const g = models.ground(50)
  assert.ok(g instanceof THREE.Mesh)
  assert.equal(g.rotation.x, -Math.PI / 2)

  const ar = models.arena(30)
  assert.ok(ar instanceof THREE.Group)
  assert.equal(ar.children.length, 4)
  assert.equal(ar.userData.bounds.size, 30)
})

test("prefabs: crate, coin, tree, rock, cloud, character, vehicle, label", () => {
  const cr = models.crate(2)
  assert.ok(cr instanceof THREE.Group)

  const cn = models.coin()
  assert.ok(cn.userData.update)
  cn.userData.update(0.016, 1)

  const tr = models.tree()
  assert.ok(tr instanceof THREE.Group)

  const rk = models.rock()
  assert.ok(rk instanceof THREE.Mesh)

  const cld = models.cloud()
  assert.ok(cld instanceof THREE.Group)

  const ch = models.character()
  assert.ok(ch.userData.parts.head)
  assert.ok(ch.userData.parts.body)
  assert.ok(ch.userData.parts.legLeft)
  assert.ok(ch.userData.animate)
  ch.userData.animate(1, 1)

  const vh = models.vehicle()
  assert.ok(vh instanceof THREE.Group)

  const rng = models.ring()
  assert.ok(rng instanceof THREE.Mesh)

  const lbl = models.label("Hello")
  assert.ok(lbl instanceof THREE.Sprite)
  assert.equal(typeof lbl.setText, "function")
  lbl.setText("World")
})

test("instances management", () => {
  const geom = new THREE.BoxGeometry(1, 1, 1)
  const mat = new THREE.MeshBasicMaterial()
  const inst = models.instances(geom, mat, 10)
  assert.ok(inst instanceof THREE.InstancedMesh)
  inst.place(0, [1, 2, 3], { scale: 2 })
  inst.tint(0, "#ff0000")
  inst.hide(1)
})

test("mesh geometry merging", () => {
  const m1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  const m2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  m2.position.set(2, 0, 0)
  const merged = models.merge([m1, m2])
  assert.ok(merged instanceof THREE.Mesh)
})

test("createPool recycling", () => {
  const pool = models.createPool(() => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), { size: 4 })
  assert.equal(pool.count, 0)
  const item1 = pool.take()
  assert.equal(pool.count, 1)
  assert.equal(item1.visible, true)
  pool.give(item1)
  assert.equal(pool.count, 0)
  assert.equal(item1.visible, false)
})

// ============================================================================
// 4. Physics Module Tests
// ============================================================================
console.log("\n▶ Testing physics.ts")

test("physics world creation and step simulation", () => {
  const world = physics.createPhysics({ gravity: -20 })
  assert.equal(world.gravity, -20)

  const ground = world.addGround(0)
  assert.equal(ground.y, 0)

  const body = world.addBody({ position: [0, 5, 0], radius: 0.5 })
  assert.equal(body.position.y, 5)
  assert.equal(body.grounded, false)

  // Step gravity down
  for (let i = 0; i < 60; i++) {
    world.step(0.016)
  }

  // Body should fall and land on ground (y = floor + radius = 0.5)
  assert.ok(body.position.y <= 0.51)
  assert.equal(body.grounded, true)
})

test("box collision resolution and penetration escape", () => {
  const world = physics.createPhysics({ gravity: 0 })
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2))
  wallMesh.position.set(5, 0, 0)
  world.addBox(wallMesh)

  const body = world.addBody({ position: [4.4, 0, 0], radius: 0.5 })
  world.step(0.016)
  // Should push body out to min.x - radius = 4 - 0.5 = 3.5
  assert.ok(body.position.x <= 3.51)
})

test("trigger enter and exit callbacks", () => {
  const world = physics.createPhysics({ gravity: 0 })
  let entered = false
  let exited = false

  const trigger = world.addBody({
    position: [0, 0, 0],
    radius: 1,
    trigger: true,
    onEnter: () => {
      entered = true
    },
    onExit: () => {
      exited = true
    },
  })

  const body = world.addBody({ position: [5, 0, 0], radius: 0.5 })
  world.step(0.016)
  assert.equal(entered, false)

  // Move body inside trigger
  body.position.set(0, 0, 0)
  world.step(0.016)
  assert.equal(entered, true)

  // Move body outside trigger
  body.position.set(5, 0, 0)
  world.step(0.016)
  assert.equal(exited, true)
})

test("hits and inside helpers", () => {
  const a = { position: new THREE.Vector3(0, 0, 0) }
  const b = { position: new THREE.Vector3(0.5, 0, 0) }
  const c = { position: new THREE.Vector3(10, 0, 0) }
  assert.equal(physics.hits(a, b, 0.5, 0.5), true)
  assert.equal(physics.hits(a, c, 0.5, 0.5), false)

  const pt = new THREE.Vector3(1, 1, 1)
  const center = new THREE.Vector3(0, 0, 0)
  const size = new THREE.Vector3(4, 4, 4)
  assert.equal(physics.inside(pt, center, size), true)
})

// ============================================================================
// 5. Animation Module Tests
// ============================================================================
console.log("\n▶ Testing animation.ts")

test("tweens step progression and completion", async () => {
  const tweens = animation.createTweens()
  const obj = { x: 0 }
  let completed = false

  const p = tweens.to(obj, { x: 10 }, {
    duration: 0.1,
    onComplete: () => {
      completed = true
    },
  })

  // Advance frames
  tweens.step(0.05)
  assert.ok(obj.x > 0 && obj.x < 10)
  assert.equal(completed, false)

  tweens.step(0.06)
  assert.equal(obj.x, 10)
  assert.equal(completed, true)
  await p
})

test("Spring physics oscillator", () => {
  const spring = new animation.Spring({ stiffness: 100, damping: 10, value: 0 })
  spring.target = 10
  assert.equal(spring.value, 0)

  spring.update(0.05)
  assert.ok(spring.value > 0)

  spring.impulse(5)
  assert.ok(spring.velocity > 0)
})

test("SpringVec3 tracking", () => {
  const s3 = new animation.SpringVec3()
  s3.setTarget(new THREE.Vector3(5, 10, 15))
  const out = new THREE.Vector3()
  s3.update(0.05, out)
  assert.ok(out.x > 0)
  assert.ok(out.y > 0)
  assert.ok(out.z > 0)
})

// ============================================================================
// 6. State Module Tests
// ============================================================================
console.log("\n▶ Testing state.ts")

test("event bus on, emit, once, off", () => {
  const bus = state.createEvents()
  let count = 0
  const off = bus.on("test", (val: number) => {
    count += val
  })
  bus.emit("test", 5)
  assert.equal(count, 5)
  off()
  bus.emit("test", 5)
  assert.equal(count, 5)

  let onceCount = 0
  bus.once("single", () => {
    onceCount++
  })
  bus.emit("single")
  bus.emit("single")
  assert.equal(onceCount, 1)
})

test("state machine transitions and timers", () => {
  let enteredMenu = false
  let enteredGame = false

  const sm = state.createStateMachine({
    menu: {
      enter: () => {
        enteredMenu = true
      },
    },
    game: {
      enter: () => {
        enteredGame = true
      },
    },
  }, "menu")

  assert.equal(sm.current, "menu")
  assert.equal(enteredMenu, true)
  assert.equal(sm.is("menu"), true)

  sm.go("game")
  assert.equal(sm.current, "game")
  assert.equal(enteredGame, true)
})

test("score tracker and high-score storage", () => {
  const score = state.createScore({ key: "test-game", initial: 0 })
  assert.equal(score.value, 0)
  score.add(10)
  assert.equal(score.value, 10)
  assert.equal(score.best, 10)
  score.reset()
  assert.equal(score.value, 0)
  assert.equal(score.best, 10)
})

test("timer and formatTime", () => {
  assert.equal(state.formatTime(83), "1:23")
  assert.equal(state.formatTime(5), "0:05")

  let ended = false
  const timer = state.createTimer({
    duration: 1,
    onEnd: () => {
      ended = true
    },
  })
  timer.update(0.5)
  assert.equal(timer.done, false)
  timer.update(0.6)
  assert.equal(timer.done, true)
  assert.equal(ended, true)
})

test("difficulty ramping and tickers", () => {
  const diff = state.createDifficulty({ rampSeconds: 10, max: 1 })
  assert.equal(diff.level, 0)
  diff.update(5)
  assert.ok(diff.level > 0 && diff.level < 1)
  assert.ok(diff.between(10, 20) > 10)

  let ticks = 0
  const ticker = state.createTicker(0.1, () => {
    ticks++
  })
  ticker.update(0.25)
  assert.equal(ticks, 2)
})

test("cooldown management", () => {
  const cd = state.createCooldown(1.0)
  assert.equal(cd.ready(), true)
  cd.use()
  assert.equal(cd.ready(), false)
  assert.equal(cd.progress, 0)
  cd.update(0.5)
  assert.equal(cd.ready(), false)
  assert.ok(Math.abs(cd.progress - 0.5) < 0.01)
  cd.update(0.6)
  assert.equal(cd.ready(), true)
})

// ============================================================================
// 7. Engine & Index Module Tests
// ============================================================================
console.log("\n▶ Testing engine.ts and index.ts exports")

test("runtime top-level exports surface matches existing JS runtime", () => {
  assert.ok(runtime.math)
  assert.ok(runtime.models)
  assert.ok(runtime.materials)
  assert.ok(runtime.lights)
  assert.ok(runtime.effects)
  assert.ok(runtime.anim)
  assert.ok(runtime.debug)
  assert.equal(typeof runtime.createEngine, "function")
  assert.equal(typeof runtime.createGame, "function")
  assert.equal(typeof runtime.createInput, "function")
  assert.equal(typeof runtime.createHud, "function")
  assert.equal(typeof runtime.createAudio, "function")
  assert.equal(typeof runtime.createPhysics, "function")
  assert.equal(typeof runtime.createPostFX, "function")
  assert.equal(typeof runtime.createTweens, "function")
  assert.equal(typeof runtime.createStateMachine, "function")
  assert.equal(typeof runtime.createScore, "function")
  assert.equal(typeof runtime.orbitCamera, "function")
  assert.equal(typeof runtime.followCamera, "function")
  assert.equal(typeof runtime.firstPerson, "function")
  assert.equal(typeof runtime.thirdPerson, "function")
  assert.equal(typeof runtime.platformer, "function")
  assert.ok(runtime.brand)
  assert.ok(runtime.DRACO_DECODER_PATH)
})

test("draco decoder path export", () => {
  assert.ok(runtime.DRACO_DECODER_PATH)
  assert.ok(runtime.DRACO_DECODER_PATH.startsWith("https://"))
})

console.log("\n▶ Testing game-feel.ts")
test("ShakeRig trauma decay and deterministic camera offsets", () => {
  const shake = new gameFeel.ShakeRig()
  assert.equal(shake.trauma, 0)
  shake.addTrauma(0.5)
  assert.equal(shake.trauma, 0.5)
  shake.addTrauma(0.8)
  assert.equal(shake.trauma, 1.0)

  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  shake.update(0.016, cam)
  assert.ok(Math.abs(cam.position.x) > 0 || Math.abs(cam.position.y) > 0 || Math.abs(cam.rotation.z) > 0)

  shake.update(1.0, cam)
  assert.ok(shake.trauma < 0.1)
  shake.update(1.0, cam)
  assert.equal(shake.trauma, 0)
})

test("HitstopManager timeScale freeze and auto-recovery", () => {
  const hitstop = new gameFeel.HitstopManager()
  assert.equal(hitstop.isFrozen(), false)
  assert.equal(hitstop.getTimeScale(), 1.0)

  hitstop.trigger(100, 0.05)
  assert.equal(hitstop.isFrozen(), true)
  assert.equal(hitstop.getTimeScale(), 0.05)

  const scaledDelta = hitstop.update(0.05)
  assert.ok(scaledDelta < 0.05)
  assert.equal(hitstop.isFrozen(), true)

  const scaleEnd = hitstop.update(0.06)
  assert.equal(scaleEnd, 0.06)
  assert.equal(hitstop.isFrozen(), false)
})

test("squashAndStretch volume preservation and step", () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  const controller = gameFeel.squashAndStretch(mesh, { squashY: 0.5, durationSec: 0.2 })
  const vol = mesh.scale.x * mesh.scale.y * mesh.scale.z
  assert.ok(Math.abs(vol - 1.0) < 0.05)

  controller.step(0.1)
  assert.ok(mesh.scale.y > 0.5)

  controller.step(0.2)
  assert.equal(mesh.scale.x, 1)
  assert.equal(mesh.scale.y, 1)
  assert.equal(mesh.scale.z, 1)
})

test("FovPuncher camera kick and exponential recovery", () => {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  const fovPuncher = new gameFeel.FovPuncher(cam)
  assert.equal(cam.fov, 60)
  fovPuncher.punch(8)
  fovPuncher.update(0.01)
  assert.ok(cam.fov > 60)
  fovPuncher.update(2.0)
  assert.equal(cam.fov, 60)
})

test("flashHit emissive pulse and material restoration", () => {
  const mat = new THREE.MeshStandardMaterial({ emissive: new THREE.Color("#000000") })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
  gameFeel.flashHit(mesh, { color: "#ffffff", peak: 2.0 })
  assert.ok(mat.userData.baseEmissive !== undefined)
})

console.log("\n▶ Testing AAA materials and procedural textures")
test("PBR material presets and shader cookbook", () => {
  const metal = runtime.paintedMetal({ color: "#2563eb", roughness: 0.3 })
  assert.equal(metal.metalness, 0.1)
  assert.equal(metal.clearcoat, 0.9)

  const rubber = runtime.rubber({ color: "#18181b" })
  assert.equal(rubber.metalness, 0.0)
  assert.equal(rubber.roughness, 0.94)

  const glass = runtime.cheapGlass({ opacity: 0.3 })
  assert.equal(glass.transparent, true)
  assert.equal(glass.opacity, 0.3)

  const emissive = runtime.emissiveSignal("#ff0000", 3.0)
  assert.equal(emissive.emissiveIntensity, 3.0)
})

test("procedural canvas textures generators", () => {
  const trim = runtime.proceduralTextures.trimSheet()
  assert.ok(trim instanceof THREE.CanvasTexture)
  assert.equal(trim.colorSpace, THREE.SRGBColorSpace)
  assert.equal(trim.wrapS, THREE.RepeatWrapping)

  const stripes = runtime.proceduralTextures.hazardStripes()
  assert.ok(stripes instanceof THREE.CanvasTexture)

  const tiles = runtime.proceduralTextures.stoneTiles()
  assert.ok(tiles instanceof THREE.CanvasTexture)
})

test("custom shader hooks and sky dome", () => {
  const mat = new THREE.MeshStandardMaterial()
  runtime.applyFresnelRim(mat, { color: "#00ffff" })
  assert.equal(typeof mat.onBeforeCompile, "function")
  assert.equal(mat.customProgramCacheKey(), "fresnel-rim")

  const scene = new THREE.Scene()
  const sky = runtime.createSkyDome(scene, { topColor: "#0f172a", horizonColor: "#38bdf8" })
  assert.ok(sky instanceof THREE.Mesh)
  assert.ok(sky.material instanceof THREE.ShaderMaterial)
})

console.log("\n▶ Testing authored model factories and diagnostics")
test("createHeroVehicle model factory result", () => {
  const vehicle = runtime.createHeroVehicle({ hullColor: "#2563eb" })
  assert.ok(vehicle.root)
  assert.ok(vehicle.collision)
  assert.ok(vehicle.bounds)
  assert.ok(vehicle.parts?.hull)
  assert.ok(vehicle.parts?.cockpit)
  assert.ok((vehicle.diagnostics?.triangles ?? 0) > 0)
  assert.ok((vehicle.diagnostics?.meshes ?? 0) > 0)
})

test("createHeroCharacter articulated humanoid result", () => {
  const hero = runtime.createHeroCharacter({ armorColor: "#475569" })
  assert.ok(hero.root)
  assert.ok(hero.collision)
  assert.ok(hero.parts?.torso)
  assert.ok(hero.parts?.head)
  assert.ok(hero.parts?.legLeft)
  assert.ok(hero.parts?.legRight)
  assert.ok((hero.diagnostics?.triangles ?? 0) > 0)
})

test("createObstacle, createReward, createWorldPropKit", () => {
  const obstacle = runtime.createObstacle("barrier")
  assert.ok(obstacle.root)
  assert.ok(obstacle.collision)

  const reward = runtime.createReward("token")
  assert.ok(reward.root)
  assert.ok(reward.collision)

  const props = runtime.createWorldPropKit()
  const crate = props.createCrate()
  assert.ok(crate instanceof THREE.Group)
})

console.log("\n▶ Testing CameraRig")
test("CameraRig follow damping and lookAhead", () => {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  const rig = new camera.CameraRig(cam, new THREE.Vector3(0, 4, 10))
  const targetPos = new THREE.Vector3(0, 0, 0)
  rig.snapTo(targetPos)
  assert.equal(cam.position.z, 10)
  rig.addTrauma(0.5)
  rig.punchFov(5)
  rig.update(0.016, targetPos)
  assert.ok(cam.fov > 60)
})

console.log("\n▶ Testing AAA HUD components")
test("HUD components creation and API", () => {
  const healthBar = runtime.createHealthBar({ current: 80, max: 100, showShield: true, shield: 20 })
  assert.ok(healthBar.element)
  healthBar.setHealth(60)
  healthBar.setShield(10)
  healthBar.setLabel("SHIELDED")
  healthBar.remove()

  const card = runtime.createObjectiveCard({ title: "TEST", current: 1, total: 5, timeRemaining: 120 })
  assert.ok(card.element)
  card.setProgress(2, 5)
  card.setTimer(119)
  card.complete()
  card.remove()

  const badge = runtime.createScoreBadge({ score: 1000, highScore: 5000, combo: 2 })
  assert.ok(badge.element)
  badge.addScore(250)
  badge.setCombo(3, 2.5)
  badge.bump()
  badge.remove()

  const modal = runtime.createModalOverlay({ title: "VICTORY", type: "victory", stats: [{ label: "TIME", value: "01:23" }] })
  assert.ok(modal.element)
  modal.updateStats([{ label: "TIME", value: "01:23", highlight: true }])
  modal.close()

  const touch = runtime.createTouchControls({ onlyOnTouch: false })
  assert.ok(touch.element)
  assert.equal(typeof touch.vector.x, "number")
  touch.remove()
})

console.log("\n▶ Testing engine diagnostics and environment")
test("Engine diagnostics and neutral environment exports", () => {
  assert.equal(typeof runtime.setupNeutralEnvironment, "function")
  const mockScene = new THREE.Scene()
  const mockRenderer = {} as any
  const envResult = runtime.setupNeutralEnvironment(mockRenderer, mockScene)
  assert.equal(envResult, null)

  const win = (globalThis as any).window
  win.__THREE_GAME_DIAGNOSTICS__ = {
    frame: 100,
    elapsed: 1.66,
    fps: 60,
    renderer: { calls: 12, triangles: 450, geometries: 8, textures: 4 },
  }
  assert.ok(win.__THREE_GAME_DIAGNOSTICS__)
  assert.equal(win.__THREE_GAME_DIAGNOSTICS__.frame, 100)
  assert.equal(win.__THREE_GAME_DIAGNOSTICS__.renderer.calls, 12)
})

console.log("\n▶ Testing MaterialKit and Seeded Random")
test("createMaterialKit returns cohesive role materials", () => {
  const kit = runtime.createMaterialKit({
    primary: "#1e293b",
    secondary: "#475569",
    trim: "#f59e0b",
  })
  assert.ok(kit.bodyPrimary)
  assert.ok(kit.bodySecondary)
  assert.ok(kit.trim)
  assert.ok(kit.hazard)
  assert.ok(kit.reward)
  assert.ok(kit.shieldBoost)
  assert.ok(kit.glass)
  assert.ok(kit.emissiveSignal)
  assert.ok(kit.groundContact)
  assert.ok(kit.decalDark)
  assert.ok(kit.decalLight)
})

test("createSeededRandom reproducibility", () => {
  const rngA = runtime.createSeededRandom(1234)
  const rngB = runtime.createSeededRandom(1234)
  const valA1 = rngA()
  const valA2 = rngA()
  const valB1 = rngB()
  const valB2 = rngB()
  assert.equal(valA1, valB1)
  assert.equal(valA2, valB2)
  assert.notEqual(valA1, valA2)
})

console.log("\n▶ Testing Audio System channels, ducking, cooldown, and spatial playAt")
test("Audio channels, ducking, cooldown, and 3D spatial playAt", () => {
  const audio = runtime.createAudio()
  assert.equal(audio.getGroupVolume("master"), 0.35)
  assert.equal(audio.getGroupVolume("sfx"), 1)
  assert.equal(audio.getGroupVolume("ui"), 0.8)

  audio.setGroupVolume("sfx", 0.7)
  assert.equal(audio.getGroupVolume("sfx"), 0.7)

  assert.equal(audio.isGroupMuted("music"), false)
  audio.muteGroup("music", true)
  assert.equal(audio.isGroupMuted("music"), true)
  audio.muteGroup("music", false)
  assert.equal(audio.isGroupMuted("music"), false)

  audio.duck(0.5, 0.2)

  // Test new sounds presence
  const expectedSounds = [
    "hover", "confirm", "cancel", "pause",
    "dash", "boost", "drift", "shield", "score", "checkpoint", "warning", "impact"
  ]
  for (const name of expectedSounds) {
    assert.ok(audio.sounds[name], `Sound '${name}' must be registered`)
  }

  // Play with cooldown
  audio.playWithCooldown("hover", 50)
  audio.playWithCooldown("hover", 50) // within cooldown window

  // Spatial playAt
  audio.playAt("jump", [5, 0, 5], [0, 0, 0], { maxDistance: 20 })

  audio.dispose()
})

console.log("\n▶ Testing window.__THREE_GAME_TEST_HOOKS__")
test("Engine installs and responds to __THREE_GAME_TEST_HOOKS__", () => {
  const win = (globalThis as any).window
  const mockContainer = new MockElement()
  const mockCanvas = new MockElement()
  const engine = runtime.createEngine({ container: mockContainer as any, canvas: mockCanvas as any })

  assert.ok(win.__THREE_GAME_TEST_HOOKS__)
  const hooks = win.__THREE_GAME_TEST_HOOKS__
  assert.equal(typeof hooks.seed, "function")
  assert.equal(typeof hooks.setState, "function")
  assert.equal(typeof hooks.setPausedForScreenshot, "function")
  assert.equal(typeof hooks.setReducedMotion, "function")
  assert.equal(typeof hooks.hideDebugUi, "function")

  // seed hook
  hooks.seed(999)
  assert.ok(engine.rng)

  // setState hook
  const ackPlay = hooks.setState("active-play")
  assert.deepEqual(ackPlay, { state: "active-play" })
  const ackPause = hooks.setState("pause")
  assert.deepEqual(ackPause, { state: "pause" })
  const ackComplete = hooks.setState("complete")
  assert.deepEqual(ackComplete, { state: "complete" })

  // setPausedForScreenshot and setReducedMotion
  hooks.setPausedForScreenshot(true)
  hooks.setReducedMotion(true)
  assert.equal(engine.reducedMotion, true)
  hooks.hideDebugUi(true)

  engine.dispose()
  assert.equal(win.__THREE_GAME_TEST_HOOKS__, undefined)
})

console.log(`\n========================================`)
console.log(`Test Results: ${passed} passed, ${failed} failed`)
console.log(`========================================\n`)

if (failed > 0) {
  process.exit(1)
}

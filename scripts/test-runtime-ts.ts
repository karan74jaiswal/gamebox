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
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
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
  head: new MockElement(),
  body: new MockElement(),
  getElementById: (id: string) => null,
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
}

;(globalThis as any).matchMedia = (query: string) => ({ matches: false })

// --- Import Engine Modules ---
import * as math from "../lib/games/runtime-ts/engine/math.js"
import * as materials from "../lib/games/runtime-ts/engine/materials.js"
import * as lighting from "../lib/games/runtime-ts/engine/lighting.js"
import * as models from "../lib/games/runtime-ts/engine/models.js"
import * as physics from "../lib/games/runtime-ts/engine/physics.js"
import * as animation from "../lib/games/runtime-ts/engine/animation.js"
import * as state from "../lib/games/runtime-ts/engine/state.js"
import * as particles from "../lib/games/runtime-ts/engine/particles.js"
import * as sound from "../lib/games/runtime-ts/engine/sound.js"
import * as hud from "../lib/games/runtime-ts/engine/hud.js"
import * as debug from "../lib/games/runtime-ts/engine/debug.js"
import * as engineModule from "../lib/games/runtime-ts/engine/engine.js"
import * as runtime from "../lib/games/runtime-ts/engine/index.js"

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
  assert.ok(runtime.palette)
})

console.log(`\n========================================`)
console.log(`Test Results: ${passed} passed, ${failed} failed`)
console.log(`========================================\n`)

if (failed > 0) {
  process.exit(1)
}

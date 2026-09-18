import * as THREE from "three"

import type { ColorLike, Engine, PhysicsWorld } from "./types.ts"

/**
 * Things to look at while building, and to take out before shipping.
 *
 * Worth having because the alternative is `console.log` in a render loop, which
 * floods the console and drops the framerate enough to hide the problem being
 * investigated.
 */

export interface StatsOptions {
  at?: string
}

export interface StatsHandle {
  element: HTMLElement
  remove: () => void
}

/** A framerate and draw-call readout in the corner. */
export function showStats(
  engine: Engine,
  options: StatsOptions = {}
): StatsHandle {
  const { at = "top-right" } = options
  const element = document.createElement("div")
  element.style.cssText = `
    position: absolute; ${at.includes("top") ? "top" : "bottom"}: 8px;
    ${at.includes("right") ? "right" : "left"}: 8px;
    z-index: 50; pointer-events: none;
    font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #a1a1a1; background: rgba(10,10,10,0.6);
    padding: 6px 9px; border-radius: 8px; white-space: pre;
  `
  engine.container.appendChild(element)

  let accumulated = 0
  engine.onLateUpdate((dt: number) => {
    accumulated += dt
    // Four times a second: any faster and the numbers are unreadable, and the
    // DOM write itself starts showing up in the measurement.
    if (accumulated < 0.25) return
    accumulated = 0
    const info = engine.renderer.info
    element.textContent = [
      `${engine.fps.toFixed(0)} fps`,
      `${info.render.calls} draws`,
      `${(info.render.triangles / 1000).toFixed(1)}k tris`,
      `${info.memory.geometries} geo  ${info.memory.textures} tex`,
    ].join("\n")
  })

  return { element, remove: () => element.remove() }
}

export interface HelpersOptions {
  grid?: number
  axes?: number
  light?: THREE.Light | null
}

export interface HelpersHandle {
  helpers: THREE.Object3D[]
  remove: () => void
}

/** Grid, axes, and the shadow camera's frustum — where things actually are. */
export function showHelpers(
  engine: Engine,
  options: HelpersOptions = {}
): HelpersHandle {
  const { grid = 40, axes = 5, light = null } = options
  const added: THREE.Object3D[] = []

  if (grid) {
    const helper = new THREE.GridHelper(grid, grid, 0x444444, 0x222222)
    engine.scene.add(helper)
    added.push(helper)
  }
  if (axes) {
    const helper = new THREE.AxesHelper(axes)
    engine.scene.add(helper)
    added.push(helper)
  }
  if (light && "shadow" in light) {
    const shadowCamera = (light as { shadow?: { camera?: THREE.Camera } }).shadow?.camera
    if (shadowCamera) {
      const helper = new THREE.CameraHelper(shadowCamera)
      engine.scene.add(helper)
      added.push(helper)
    }
  }

  return {
    helpers: added,
    remove() {
      for (const helper of added) {
        if ("dispose" in helper && typeof (helper as { dispose?: () => void }).dispose === "function") {
          (helper as { dispose: () => void }).dispose()
        }
        engine.scene.remove(helper)
      }
    },
  }
}

export interface CollidersOptions {
  color?: ColorLike
}

export interface CollidersHandle {
  group: THREE.Group
  remove: () => void
}

/** Draws a physics world's colliders, so mismatches with the art are visible. */
export function showColliders(
  engine: Engine,
  physics: PhysicsWorld,
  options: CollidersOptions = {}
): CollidersHandle {
  const { color = "#22c55e" } = options
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({ color, wireframe: true })
  engine.scene.add(group)

  for (const collider of physics.statics) {
    if (collider.type !== "box") continue
    const size = collider.box.getSize(new THREE.Vector3())
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      material
    )
    mesh.position.copy(collider.box.getCenter(new THREE.Vector3()))
    group.add(mesh)
  }

  const bodyMeshes = physics.bodies.map((body) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(body.radius, 12, 8),
      new THREE.MeshBasicMaterial({ color: "#f97316", wireframe: true })
    )
    group.add(mesh)
    return { body, mesh }
  })

  engine.onLateUpdate(() => {
    for (const { body, mesh } of bodyMeshes) mesh.position.copy(body.position)
  })

  return { group, remove: () => engine.scene.remove(group) }
}

/**
 * A throttled logger for values that change every frame.
 */
const lastLogged = new Map<string, number>()
export function log(label: string, value: unknown, everySeconds: number = 0.5): void {
  const now = performance.now() / 1000
  if (now - (lastLogged.get(label) ?? -Infinity) < everySeconds) return
  lastLogged.set(label, now)
  console.log(`${label}:`, value)
}

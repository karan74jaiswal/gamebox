import * as THREE from "three"

import type { Engine, EngineOptions, FogConfig, RenderTarget } from "./types.ts"
import { clamp } from "./math.ts"

/**
 * The renderer, scene, camera and frame loop, set up the way a game wants them.
 *
 * This is the one module a game always uses. It exists so no game has to spend
 * its first fifty lines on colour space, pixel ratio, resize handling and a
 * requestAnimationFrame loop — that code is identical in every game and getting
 * any of it slightly wrong is what makes a scene look washed out or blurry.
 *
 *   const engine = createEngine({ background: "#0a0a0a" })
 *   engine.onUpdate((dt) => { cube.rotation.y += dt })
 *   engine.start()
 */

/** A frame after a stall — a tab in the background, a long GC — can arrive with
 *  a `dt` of several seconds. Physics integrated over that jumps through walls,
 *  so the loop reports at most this and lets the game run slow instead. */
const MAX_DELTA = 1 / 15

export function createEngine(options: EngineOptions = {}): Engine {
  const {
    container = typeof document !== "undefined"
      ? document.body
      : ({} as HTMLElement),
    background = "#0a0a0a",
    fog = null,
    fov = 60,
    near = 0.1,
    far = 500,
    cameraPosition = [0, 4, 10],
    lookAt = [0, 0, 0],
    antialias = true,
    alpha = false,
    shadows = true,
    maxPixelRatio = 2,
    toneMapping = THREE.ACESFilmicToneMapping,
    exposure = 1,
    pauseWhenHidden = true,
  } = options

  const renderer = new THREE.WebGLRenderer({
    antialias,
    alpha,
    powerPreference: "high-performance",
  })
  renderer.setPixelRatio(
    typeof window !== "undefined"
      ? Math.min(window.devicePixelRatio, maxPixelRatio)
      : 1
  )
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = toneMapping
  renderer.toneMappingExposure = exposure

  if (shadows) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }

  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  canvas.style.touchAction = "none"
  container.appendChild(canvas)

  const scene = new THREE.Scene()
  if (background !== null && background !== undefined) {
    scene.background = new THREE.Color(background)
  }
  if (fog) {
    if (typeof fog === "number") {
      scene.fog = new THREE.FogExp2(
        new THREE.Color(background ?? "#0a0a0a").getHex(),
        fog
      )
    } else {
      const fogConfig = fog as FogConfig
      scene.fog = new THREE.Fog(
        fogConfig.color ?? background ?? "#0a0a0a",
        fogConfig.near ?? 10,
        fogConfig.far ?? 80
      )
    }
  }

  const camera = new THREE.PerspectiveCamera(fov, 1, near, far)
  const [camX, camY, camZ] = Array.isArray(cameraPosition)
    ? cameraPosition
    : cameraPosition instanceof THREE.Vector3
      ? [cameraPosition.x, cameraPosition.y, cameraPosition.z]
      : [cameraPosition.x, cameraPosition.y, cameraPosition.z]
  camera.position.set(camX, camY, camZ)

  const [lookX, lookY, lookZ] = Array.isArray(lookAt)
    ? lookAt
    : lookAt instanceof THREE.Vector3
      ? [lookAt.x, lookAt.y, lookAt.z]
      : [lookAt.x, lookAt.y, lookAt.z]
  camera.lookAt(new THREE.Vector3(lookX, lookY, lookZ))
  scene.add(camera)

  const updates = new Set<(dt: number, elapsed: number) => void>()
  const lateUpdates = new Set<(dt: number, elapsed: number) => void>()
  const resizes = new Set<(width: number, height: number) => void>()

  // Modern THREE.Timer with THREE.Clock backward-compatibility
  const timer = new THREE.Timer()
  if (typeof document !== "undefined") {
    timer.connect(document)
  }
  const clock = new THREE.Clock(false)

  let running = false
  let paused = false
  let elapsed = 0
  let frame = 0
  let fps = 60

  let renderTarget: RenderTarget = {
    render: () => renderer.render(scene, camera),
  }

  const size = { width: 1, height: 1 }

  function resize() {
    const rect = container.getBoundingClientRect?.()
    const width = Math.max(
      1,
      Math.floor(
        rect?.width || (typeof window !== "undefined" ? window.innerWidth : 1)
      )
    )
    const height = Math.max(
      1,
      Math.floor(
        rect?.height || (typeof window !== "undefined" ? window.innerHeight : 1)
      )
    )
    if (width === size.width && height === size.height) return

    size.width = width
    size.height = height

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    renderTarget.setSize?.(width, height)

    for (const fn of resizes) fn(width, height)
  }

  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null
  if (observer && typeof document !== "undefined" && container !== document.body) {
    observer.observe(container)
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", resize)
  }
  resize()

  function tick(timestamp?: number) {
    timer.update(timestamp)
    const raw = timer.getDelta()
    if (paused) {
      renderTarget.render()
      return
    }

    const dt = clamp(raw, 0, MAX_DELTA) * engine.timeScale
    elapsed += dt
    frame++
    if (raw > 0) fps += (1 / raw - fps) * 0.1

    engine.dt = dt
    engine.elapsed = elapsed
    engine.frame = frame
    engine.fps = fps

    for (const fn of updates) fn(dt, elapsed)
    for (const fn of lateUpdates) fn(dt, elapsed)

    renderTarget.render()
  }

  function onVisibility() {
    if (typeof document !== "undefined" && document.hidden) engine.pause()
    else engine.resume()
  }
  if (pauseWhenHidden && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility)
  }

  const engine: Engine = {
    renderer,
    scene,
    camera,
    canvas,
    container,
    clock,
    timer,
    size,
    dt: 0,
    elapsed: 0,
    frame: 0,
    fps: 60,
    /** Slow motion, bullet time, and a freeze that still renders. 1 is normal. */
    timeScale: 1,

    get running() {
      return running
    },
    get paused() {
      return paused
    },

    /** Runs every frame with the frame's delta in seconds. Returns an unsubscribe. */
    onUpdate(fn: (dt: number, elapsed: number) => void): () => void {
      updates.add(fn)
      return () => updates.delete(fn)
    },
    /** Runs after every `onUpdate`. Where cameras follow and input clears. */
    onLateUpdate(fn: (dt: number, elapsed: number) => void): () => void {
      lateUpdates.add(fn)
      return () => lateUpdates.delete(fn)
    },
    onResize(fn: (width: number, height: number) => void): () => void {
      resizes.add(fn)
      fn(size.width, size.height)
      return () => resizes.delete(fn)
    },

    add(...objects: THREE.Object3D[]): THREE.Object3D | undefined {
      scene.add(...objects)
      return objects[0]
    },
    remove(...objects: THREE.Object3D[]): void {
      scene.remove(...objects)
    },

    start() {
      if (running) return engine
      running = true
      paused = false
      clock.start()
      timer.reset()
      renderer.setAnimationLoop((time) => tick(time))
      return engine
    },
    stop() {
      running = false
      clock.stop()
      renderer.setAnimationLoop(null)
    },
    pause() {
      paused = true
    },
    resume() {
      clock.getDelta()
      timer.reset()
      paused = false
    },

    /** Hands rendering to something else — see `createPostFX`. */
    setRenderTarget(target: RenderTarget | null) {
      renderTarget = target ?? { render: () => renderer.render(scene, camera) }
      renderTarget.setSize?.(size.width, size.height)
    },

    dispose() {
      engine.stop()
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", resize)
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility)
      }
      observer?.disconnect()
      timer.dispose()
      disposeObject(scene)
      renderer.dispose()
      canvas.remove()
    },
  }

  return engine
}

/**
 * Frees the GPU memory behind an object and everything under it.
 *
 * Geometries, materials and textures live on the graphics card and are not
 * reachable by the garbage collector, so a game that respawns a level every
 * round leaks until it crashes the tab unless the old one goes through here.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
  root.parent?.remove(root)
}

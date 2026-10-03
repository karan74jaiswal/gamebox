import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

import type {
  Engine,
  EngineOptions,
  FogConfig,
  RandomSource,
  RenderTarget,
  TestHooks,
  TestHooksHandlers,
} from "./types.ts"
import { clamp, createRandom } from "./math.ts"
import { HitstopManager } from "./game-feel.ts"

/**
 * Creates and applies a neutral RoomEnvironment IBL using PMREMGenerator.
 * Physical/Standard PBR materials reflect realistic neutral ambient light without loading external HDRIs.
 */
export function setupNeutralEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): THREE.Texture | null {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    const room = new RoomEnvironment()
    const envTarget = pmrem.fromScene(room)
    scene.environment = envTarget.texture
    room.dispose()
    pmrem.dispose()
    return envTarget.texture
  } catch {
    // In headless mock environments or when WebGL context is unavailable, fail silently
    return null
  }
}

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
    container = (options.canvas?.parentElement ??
      (typeof document !== "undefined"
        ? document.body
        : ({} as HTMLElement))),
    canvas: existingCanvas,
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
    environment = true,
  } = options

  const renderer =
    options.renderer ??
    (function (): THREE.WebGLRenderer {
      try {
        const r = new THREE.WebGLRenderer({
          canvas: existingCanvas,
          antialias,
          alpha,
          powerPreference: "high-performance",
        })
        r.setPixelRatio(
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio, maxPixelRatio)
            : 1
        )
        r.outputColorSpace = THREE.SRGBColorSpace
        r.toneMapping = toneMapping
        r.toneMappingExposure = exposure

        if (shadows) {
          r.shadowMap.enabled = true
          r.shadowMap.type = THREE.PCFSoftShadowMap
        }
        return r
      } catch {
        return {
          domElement: existingCanvas ?? (typeof document !== "undefined" ? document.createElement("canvas") : ({} as HTMLCanvasElement)),
          info: {
            render: { calls: 0, triangles: 0, points: 0, lines: 0 },
            memory: { geometries: 0, textures: 0 },
          },
          shadowMap: { enabled: false, type: 0 },
          setPixelRatio: () => {},
          getPixelRatio: () => 1,
          setSize: () => {},
          render: () => {},
          setAnimationLoop: () => {},
          dispose: () => {},
        } as unknown as THREE.WebGLRenderer
      }
    })()

  const canvas = renderer.domElement
  if (!existingCanvas && container && typeof container.appendChild === "function") {
    canvas.style.display = "block"
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    canvas.style.touchAction = "none"
    container.appendChild(canvas)
  }

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

  function applyEnvironment(envSetting: "neutral" | THREE.Texture | boolean | null): THREE.Texture | null {
    if (envSetting === false || envSetting === null) {
      scene.environment = null
      return null
    }
    if (envSetting instanceof THREE.Texture) {
      scene.environment = envSetting
      return envSetting
    }
    return setupNeutralEnvironment(renderer, scene)
  }

  if (environment !== false) {
    applyEnvironment(environment)
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

  const hitstopManager = new HitstopManager()
  let diagnosticsExtra: Record<string, unknown> = {}
  let pausedForScreenshot = false
  let reducedMotion = false
  let currentRng = createRandom(1)
  let activeTestHooks: TestHooks | undefined

  function publishDiagnostics(extra?: Record<string, unknown>) {
    if (extra) {
      diagnosticsExtra = { ...diagnosticsExtra, ...extra }
    }
    if (typeof window !== "undefined") {
      const info = renderer.info
      const win = window as unknown as { __THREE_GAME_DIAGNOSTICS__?: Record<string, unknown> }
      win.__THREE_GAME_DIAGNOSTICS__ = {
        frame,
        elapsed,
        fps: Math.round(fps),
        renderer: {
          calls: info.render.calls,
          triangles: info.render.triangles,
          points: info.render.points,
          lines: info.render.lines,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        },
        canvas: {
          clientWidth: canvas.clientWidth || size.width,
          clientHeight: canvas.clientHeight || size.height,
          width: canvas.width || size.width,
          height: canvas.height || size.height,
          dpr: typeof renderer.getPixelRatio === "function" ? renderer.getPixelRatio() : 1,
        },
        ...diagnosticsExtra,
      }
    }
  }

  function tick(timestamp?: number) {
    timer.update(timestamp)
    const raw = timer.getDelta()
    if (paused || pausedForScreenshot) {
      renderTarget.render()
      publishDiagnostics()
      return
    }

    const rawDt = clamp(raw, 0, MAX_DELTA)
    const hitstopDt = hitstopManager.update(rawDt)
    const dt = hitstopDt * engine.timeScale
    elapsed += dt
    frame++
    if (raw > 0) fps += (1 / raw - fps) * 0.1

    engine.rawDt = rawDt
    engine.dt = dt
    engine.elapsed = elapsed
    engine.frame = frame
    engine.fps = fps

    for (const fn of updates) fn(dt, elapsed)
    for (const fn of lateUpdates) fn(dt, elapsed)

    renderTarget.render()
    publishDiagnostics()
  }

  function installTestHooks(handlers: TestHooksHandlers = {}): TestHooks {
    const hooks: TestHooks = {
      seed: (value: number) => {
        currentRng = createRandom(value)
        engine.rng = currentRng
        handlers.onSeed?.(value)
      },
      setState: (name: string) => {
        if (handlers.onSetState) {
          const res = handlers.onSetState(name)
          if (res && typeof res === "object" && "state" in res) return res
        }
        if (name === "active-play") {
          pausedForScreenshot = false
          engine.resume()
          engine.timeScale = 1
        } else if (name === "pause") {
          engine.pause()
        } else if (name === "complete") {
          publishDiagnostics({ complete: true })
        }
        renderTarget.render()
        publishDiagnostics()
        return { state: name }
      },
      setPausedForScreenshot: (pausedVal: boolean) => {
        pausedForScreenshot = pausedVal
        handlers.onSetPausedForScreenshot?.(pausedVal)
        renderTarget.render()
        publishDiagnostics()
      },
      setReducedMotion: (enabled: boolean) => {
        reducedMotion = enabled
        engine.reducedMotion = enabled
        handlers.onSetReducedMotion?.(enabled)
        renderTarget.render()
        publishDiagnostics()
      },
      hideDebugUi: (hidden: boolean) => {
        handlers.onHideDebugUi?.(hidden)
        if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
          const els = document.querySelectorAll<HTMLElement>(
            "#debug-tools, .debug-panel, .lil-gui, .stats-js, #stats"
          )
          els.forEach((el) => {
            el.style.display = hidden ? "none" : ""
          })
        }
      },
    }

    if (typeof window !== "undefined") {
      window.__THREE_GAME_TEST_HOOKS__ = hooks
    }
    activeTestHooks = hooks
    engine.testHooks = hooks
    return hooks
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
    rawDt: 0,
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

    hitstop(durationMs = 80, timeScale = 0.05) {
      hitstopManager.trigger(durationMs, timeScale)
    },
    setupEnvironment(mode = "neutral") {
      return applyEnvironment(mode)
    },
    publishDiagnostics,

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

    get reducedMotion() {
      return reducedMotion
    },
    set reducedMotion(val: boolean) {
      reducedMotion = val
    },
    get rng() {
      return currentRng
    },
    set rng(val: RandomSource) {
      currentRng = val
    },
    get testHooks() {
      return activeTestHooks
    },
    set testHooks(val: TestHooks | undefined) {
      activeTestHooks = val
    },
    installTestHooks,

    dispose() {
      engine.stop()
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", resize)
        const win = window as unknown as {
          __THREE_GAME_DIAGNOSTICS__?: unknown
          __THREE_GAME_TEST_HOOKS__?: unknown
        }
        win.__THREE_GAME_DIAGNOSTICS__ = undefined
        win.__THREE_GAME_TEST_HOOKS__ = undefined
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

  engine.installTestHooks()

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

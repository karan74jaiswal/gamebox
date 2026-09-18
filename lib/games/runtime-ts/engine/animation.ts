import * as THREE from "three"

import type {
  ColorLike,
  Engine,
  MixerController,
  MixerPlayOptions,
  TweenManager,
  TweenOptions,
  TweenPromise,
} from "./types.ts"
import { clamp01, ease, type EaseFunction } from "./math.ts"

/**
 * Motion that isn't the game loop: tweens, springs, shakes, hit flashes, and
 * the machinery for playing clips off a loaded model.
 *
 * The reason to reach for these rather than writing `mesh.position.y += 0.1` is
 * that everything here is expressed in seconds and eased. A pickup that pops
 * over 0.3s with `outBack` reads as designed; the same pickup moved a fixed
 * amount per frame reads as a bug on a 144Hz monitor.
 */

interface ActiveTween<T = object> {
  target: T
  values: Record<string, { from: unknown; to: unknown }>
  keys: string[]
  duration: number
  delay: number
  ease: EaseFunction
  elapsed: number
  onUpdate?: (eased: number, target: T) => void
  onComplete?: (target: T) => void
  resolve?: (value: T) => void
}

/**
 * The tween manager. One per game; hook it to the engine and forget it.
 *
 *   const tweens = createTweens(engine)
 *   tweens.to(chest.position, { y: 2 }, { duration: 0.4, ease: ease.outBack })
 */
export function createTweens(engine: Engine | null = null): TweenManager {
  const active = new Set<ActiveTween<object>>()

  function step(dt: number) {
    for (const tween of active) {
      tween.elapsed += dt
      if (tween.elapsed < tween.delay) continue

      const t = clamp01((tween.elapsed - tween.delay) / tween.duration)
      const eased = tween.ease(t)
      const done = t >= 1

      for (const key of tween.keys) {
        const item = tween.values[key]
        if (!item) continue
        const { from, to } = item
        const targetObj = tween.target as Record<string, unknown>
        if (typeof to === "number" && typeof from === "number") {
          targetObj[key] = done ? to : from + (to - from) * eased
        } else if (
          to &&
          typeof to === "object" &&
          "lerp" in to &&
          typeof (to as { lerp: unknown }).lerp === "function"
        ) {
          const current = targetObj[key] as {
            copy: (source: unknown) => unknown
            lerp: (target: unknown, alpha: number) => unknown
          } | undefined
          if (current && typeof current.copy === "function" && typeof current.lerp === "function") {
            if (done) current.copy(to)
            else {
              current.copy(from)
              current.lerp(to, eased)
            }
          }
        }
      }

      tween.onUpdate?.(eased, tween.target)

      if (done) {
        active.delete(tween)
        tween.onComplete?.(tween.target)
        tween.resolve?.(tween.target)
      }
    }
  }

  const manager: TweenManager = {
    /**
     * Animates properties of `target` to `props`. Returns a promise that
     * settles when it lands, so sequences read as `await` rather than nested
     * callbacks.
     */
    to<T extends object>(
      target: T,
      props: { [K in keyof T]?: unknown },
      options: TweenOptions<T> = {}
    ): TweenPromise<T> {
      const {
        duration = 0.3,
        delay = 0,
        ease: curve = ease.outCubic,
        onUpdate,
        onComplete,
      } = options

      const targetObj = target as Record<string, unknown>
      const values: Record<string, { from: unknown; to: unknown }> = {}
      for (const [key, to] of Object.entries(props)) {
        const current = targetObj[key]
        const cloneFn = (current as { clone?: () => unknown } | null | undefined)?.clone
        const toCloneFn = (to as { clone?: () => unknown } | null | undefined)?.clone
        values[key] =
          typeof to === "number"
            ? { from: current, to }
            : {
                from: typeof cloneFn === "function" ? cloneFn.call(current) : current,
                to: typeof toCloneFn === "function" ? toCloneFn.call(to) : to,
              }
      }

      const tween: ActiveTween<T> = {
        target,
        values,
        keys: Object.keys(values),
        duration: Math.max(duration, 1e-6),
        delay,
        ease: curve,
        elapsed: 0,
        onUpdate,
        onComplete,
      }
      active.add(tween as unknown as ActiveTween<object>)

      const promise = new Promise<T>((resolve) => {
        tween.resolve = resolve
      }) as TweenPromise<T>

      promise.stop = () => active.delete(tween as unknown as ActiveTween<object>)
      return promise
    },

    /** Starts at `props` and animates to where the target already is. */
    from<T extends object>(
      target: T,
      props: { [K in keyof T]?: unknown },
      options: TweenOptions<T> = {}
    ): TweenPromise<T> {
      const targetObj = target as Record<string, unknown>
      const destination: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(props)) {
        const current = targetObj[key]
        const cloneFn = (current as { clone?: () => unknown } | null | undefined)?.clone
        destination[key] =
          typeof current === "number"
            ? current
            : typeof cloneFn === "function"
              ? cloneFn.call(current)
              : current
        targetObj[key] = val
      }
      return manager.to(target, destination as { [K in keyof T]?: unknown }, options)
    },

    /**
     * A tween of a bare number, reported through `onUpdate`. For anything
     * that isn't a property — a shader uniform, a HUD value, a volume.
     */
    value(from: number, to: number, options: TweenOptions<{ v: number }> = {}): TweenPromise<{ v: number }> {
      return manager.to({ v: from }, { v: to }, options)
    },

    /**
     * `await tweens.wait(0.5)` — a pause that respects the engine's timeScale
     * and stops when the game is paused, which `setTimeout` does not.
     */
    wait(seconds: number): TweenPromise<{ v: number }> {
      return manager.value(0, 1, { duration: seconds, ease: ease.linear })
    },

    stopAll() {
      active.clear()
    },

    step,
  }

  if (engine) engine.onUpdate(step)
  return manager
}

export interface SpringOptions {
  stiffness?: number
  damping?: number
  value?: number
}

/**
 * A spring: chases a target with overshoot and settle rather than easing.
 *
 * Use it where the destination keeps changing — a camera zoom that follows
 * speed, a UI element tracking a value, a weapon that kicks. A tween has to be
 * restarted when the target moves; a spring just keeps going.
 */
export class Spring {
  stiffness: number
  damping: number
  value: number
  target: number
  velocity: number

  constructor(options: SpringOptions = {}) {
    const { stiffness = 180, damping = 18, value = 0 } = options
    this.stiffness = stiffness
    this.damping = damping
    this.value = value
    this.target = value
    this.velocity = 0
  }

  /** Kicks the spring without moving its target — recoil, impact, a bump. */
  impulse(amount: number): this {
    this.velocity += amount
    return this
  }

  update(dt: number): number {
    const steps = Math.max(1, Math.ceil(dt * 120))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      const force =
        -this.stiffness * (this.value - this.target) -
        this.damping * this.velocity
      this.velocity += force * h
      this.value += this.velocity * h
    }
    return this.value
  }
}

/** Three springs in a trenchcoat, for positions and scales. */
export class SpringVec3 {
  x: Spring
  y: Spring
  z: Spring

  constructor(options: SpringOptions = {}) {
    this.x = new Spring(options)
    this.y = new Spring(options)
    this.z = new Spring(options)
  }

  setTarget(vector: { x: number; y: number; z: number }): this {
    this.x.target = vector.x
    this.y.target = vector.y
    this.z.target = vector.z
    return this
  }

  /** Call each frame, after whatever else moves the object. */
  update(dt: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.x.update(dt), this.y.update(dt), this.z.update(dt))
  }
}

export interface ShakeOptions {
  decay?: number
  frequency?: number
}

export interface ShakeController {
  add: (strength?: number) => void
  update: (dt: number) => void
  reset: () => void
}

/**
 * Screen shake as a decaying offset, applied to any object.
 *
 * Shake is the cheapest way to give an impact weight, and the easiest thing to
 * overdo — 0.15 for a footstep-scale event, 0.5 for an explosion, and it should
 * always be over inside half a second.
 */
export function createShake(
  object: THREE.Object3D,
  options: ShakeOptions = {}
): ShakeController {
  const { decay = 5, frequency = 30 } = options
  const base = object.position.clone()
  let amount = 0
  let time = 0

  return {
    add(strength = 0.3) {
      amount = Math.max(amount, strength)
    },
    update(dt) {
      if (amount <= 0.0001) return
      time += dt * frequency
      object.position.x += Math.sin(time * 1.7) * amount
      object.position.y += Math.sin(time * 2.3 + 1.7) * amount
      object.position.z += Math.sin(time * 1.1 + 3.4) * amount * 0.5
      amount *= Math.exp(-decay * dt)
    },
    reset() {
      amount = 0
      object.position.copy(base)
    },
  }
}

export interface FlashOptions {
  color?: ColorLike
  duration?: number
  intensity?: number
}

/**
 * Flashes a mesh's emissive colour and returns it. The universal "that hit".
 *
 * Without a hit flash, damage in a 3D game is invisible — the player fires,
 * the enemy's health drops, and nothing on screen says the two are connected.
 */
export function flash<T extends THREE.Object3D>(
  object: T,
  options: FlashOptions = {}
): T {
  const { color = "#ffffff", duration = 0.12, intensity = 1 } = options
  const targets: Array<{
    material: THREE.MeshStandardMaterial
    color: THREE.Color
    intensity: number
  }> = []

  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    const mat = mesh.material as THREE.MeshStandardMaterial | undefined
    if (!mesh.isMesh || !mat?.emissive) return
    targets.push({
      material: mat,
      color: mat.emissive.clone(),
      intensity: mat.emissiveIntensity,
    })
    mat.emissive.set(color)
    mat.emissiveIntensity = intensity
  })

  setTimeout(() => {
    for (const entry of targets) {
      entry.material.emissive.copy(entry.color)
      entry.material.emissiveIntensity = entry.intensity
    }
  }, duration * 1000)

  return object
}

export interface PopOptions {
  scale?: number
  duration?: number
}

/** A squash-and-stretch pop. Landings, pickups, buttons, anything that lands. */
export function pop(
  object: THREE.Object3D,
  tweens: TweenManager,
  options: PopOptions = {}
): TweenPromise<THREE.Vector3> {
  const { scale = 1.25, duration = 0.24 } = options
  const base = object.scale.clone()
  object.scale.set(base.x * scale, base.y / scale, base.z * scale)
  return tweens.to(
    object.scale,
    { x: base.x, y: base.y, z: base.z },
    {
      duration,
      ease: ease.outElastic,
    }
  )
}

export interface HoverOptions {
  amplitude?: number
  speed?: number
  spin?: number
  phase?: number
}

/** Idle motion, so nothing in the scene is ever perfectly still. */
export function hover(
  object: THREE.Object3D,
  options: HoverOptions = {}
): (dt: number, elapsed: number) => void {
  const {
    amplitude = 0.15,
    speed = 2,
    spin = 0.6,
    phase = Math.random() * 10,
  } = options
  const baseY = object.position.y
  return (dt: number, elapsed: number) => {
    object.position.y = baseY + Math.sin((elapsed + phase) * speed) * amplitude
    object.rotation.y += spin * dt
  }
}

/**
 * Plays clips from a loaded GLTF, by name, with crossfades.
 *
 * Switching animation with `.stop()` then `.play()` snaps between poses; a
 * crossfade is what makes idle-to-run look like the same character.
 */
export function createMixer(
  model: THREE.Object3D,
  clips?: THREE.AnimationClip[],
  engine: Engine | null = null
): MixerController {
  const mixer = new THREE.AnimationMixer(model)
  const actions = new Map<string, THREE.AnimationAction>()
  let current: string | null = null

  for (const clip of clips ?? []) {
    actions.set(clip.name, mixer.clipAction(clip))
  }

  const api: MixerController = {
    mixer,
    actions,
    get playing() {
      return current
    },
    names: () => [...actions.keys()],

    play(name: string, options: MixerPlayOptions = {}) {
      const { fade = 0.25, loop = true, speed = 1 } = options
      const next = actions.get(name)
      if (!next || (current !== null && next === actions.get(current))) return api

      next.reset()
      next.timeScale = speed
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      next.clampWhenFinished = !loop

      const previous = current ? actions.get(current) : undefined
      if (previous && fade > 0) previous.crossFadeTo(next, fade, true)
      next.play()
      current = name
      return api
    },

    stop(name?: string) {
      actions.get(name ?? (current || ""))?.fadeOut(0.2)
      if (!name || name === current) current = null
    },

    update: (dt: number) => mixer.update(dt),
    dispose: () => mixer.stopAllAction(),
  }

  if (engine) engine.onUpdate(api.update)
  return api
}

export { ease }

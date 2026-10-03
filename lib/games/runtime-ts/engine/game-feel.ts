import * as THREE from "three"
import { easeOutBack, type EaseFunction } from "./math.ts"

/**
 * Game Feel & Juice Systems conforming 100% to threejs-gameplay-systems / game-feel.md.
 *
 * Implements:
 * 1. ShakeRig — trauma-based screenshake (trauma² with linear decay and deterministic noise).
 * 2. HitstopManager — timeScale manager scaling gameplay delta while keeping camera/VFX live.
 * 3. squashAndStretch — volume-preserving squash & stretch deformation with easeOutBack overshoot.
 * 4. FovPuncher / punchFov — camera kick with exponential decay and projection update.
 * 5. flashHit — emissive flare pulse targeting material userData.baseEmissive.
 */

// --- 1. Deterministic Trauma-Based Screenshake Rig ---

const TRAUMA_MAX = 1.0
const TRAUMA_DECAY = 1.4 // trauma units per second
const MAX_OFFSET = 0.55 // world units at full shake
const MAX_ROLL = 0.1 // radians at full shake

// Deterministic value noise in [-1, 1]; per-axis seed keeps axes independent.
function pseudoNoise(t: number, seed: number): number {
  const x = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

export class ShakeRig {
  private _trauma = 0
  private time = 0

  /** Add trauma on events: pickup 0.15, hit 0.4, explosion 0.7. Hard-capped at 1.0. */
  addTrauma(amount: number): void {
    this._trauma = Math.min(TRAUMA_MAX, this._trauma + amount)
  }

  get trauma(): number {
    return this._trauma
  }

  getTrauma(): number {
    return this._trauma
  }

  reset(): void {
    this._trauma = 0
    this.time = 0
  }

  /**
   * Call every frame AFTER CameraRig has written the base transform.
   * Offset does not accumulate because camera position/lookAt re-derive every frame.
   */
  update(delta: number, camera: THREE.PerspectiveCamera): void {
    this.time += delta
    this._trauma = Math.max(0, this._trauma - TRAUMA_DECAY * delta)
    if (this._trauma <= 0) return

    const shake = this._trauma * this._trauma // Quadratic response
    const freq = this.time * 32

    camera.position.x += MAX_OFFSET * shake * pseudoNoise(freq, 1)
    camera.position.y += MAX_OFFSET * shake * pseudoNoise(freq, 2)
    camera.rotation.z += MAX_ROLL * shake * pseudoNoise(freq, 3)
  }
}

// --- 2. Hitstop (Game Time Scaling for Impact Weight) ---

export class HitstopManager {
  private _timeScale = 1.0
  private remainingSec = 0

  /**
   * Freezes gameplay for durationMs (recommended 60-90ms at scale 0.05 on heavy contact).
   * Scales gameplayDelta while camera, shake, tweens, and HUD continue on real delta.
   */
  trigger(durationMs: number, scale = 0.05): void {
    this.remainingSec = Math.max(this.remainingSec, durationMs / 1000)
    this._timeScale = scale
  }

  update(realDelta: number): number {
    if (this.remainingSec > 0) {
      this.remainingSec -= realDelta
      if (this.remainingSec <= 0) {
        this._timeScale = 1.0
        this.remainingSec = 0
      }
    }
    return realDelta * this._timeScale
  }

  getTimeScale(): number {
    return this._timeScale
  }

  isFrozen(): boolean {
    return this.remainingSec > 0
  }

  reset(): void {
    this._timeScale = 1.0
    this.remainingSec = 0
  }
}

// --- 3. Volume-Preserving Squash and Stretch ---

export interface SquashOptions {
  squashY?: number
  durationSec?: number
  easing?: EaseFunction
  onComplete?: () => void
}

/**
 * Volume-preserving squash & stretch.
 * When one axis scales by s, the other two scale by 1 / sqrt(s) to conserve visual mass.
 * squashY < 1 for landing/impact; squashY > 1 for jump takeoff.
 */
export function squashAndStretch(
  target: THREE.Object3D,
  options: SquashOptions = {}
): { step: (dt: number) => boolean; cancel: () => void } {
  const {
    squashY = 0.85,
    durationSec = 0.18,
    easing = easeOutBack,
    onComplete,
  } = options

  const startXZ = 1 / Math.sqrt(Math.max(0.01, squashY))
  let elapsed = 0
  let active = true

  const step = (dt: number) => {
    if (!active) return true
    elapsed += dt
    const t = Math.min(elapsed / durationSec, 1)
    const eased = easing(t)

    const y = squashY + (1 - squashY) * eased
    const xz = startXZ + (1 - startXZ) * eased
    target.scale.set(xz, y, xz)

    if (t >= 1) {
      target.scale.set(1, 1, 1)
      active = false
      onComplete?.()
      return true
    }
    return false
  }

  return {
    step,
    cancel: () => {
      active = false
      target.scale.set(1, 1, 1)
    },
  }
}

// --- 4. Camera Kick / FOV Punch ---

export class FovPuncher {
  private baseFov: number
  private fovPunch = 0

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.baseFov = camera.fov
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov
  }

  /**
   * Punches FOV by degrees (clamped to max +12°). Decays exponentially.
   * Recommended +4..8° on boost, dash, or heavy hit.
   */
  punch(degrees: number): void {
    this.fovPunch = Math.min(12, this.fovPunch + degrees)
  }

  update(delta: number): void {
    if (this.fovPunch <= 0.001) {
      if (this.camera.fov !== this.baseFov) {
        this.camera.fov = this.baseFov
        this.camera.updateProjectionMatrix()
      }
      return
    }

    this.fovPunch *= Math.exp(-delta / 0.2) // ~200ms time constant
    if (this.fovPunch < 0.001) this.fovPunch = 0

    this.camera.fov = this.baseFov + this.fovPunch
    this.camera.updateProjectionMatrix() // Mandatory after FOV modification
  }

  reset(): void {
    this.fovPunch = 0
    this.camera.fov = this.baseFov
    this.camera.updateProjectionMatrix()
  }
}

// --- 5. Impact Flash (Emissive Pulse) ---

export interface FlashHitOptions {
  peak?: number
  durationSec?: number
  color?: THREE.ColorRepresentation
  onComplete?: () => void
}

/**
 * Pulses emissiveIntensity on a MeshStandardMaterial / MeshPhysicalMaterial and restores base.
 * Automatically preserves and re-reads material.userData.baseEmissive.
 */
export function flashHit(
  target: THREE.Object3D | THREE.Material,
  options: FlashHitOptions = {}
): void {
  const { peak = 2.4, durationSec = 0.22, color, onComplete } = options

  const materials: Array<{
    mat: THREE.MeshStandardMaterial
    baseIntensity: number
    baseColor: THREE.Color
  }> = []

  const inspect = (mat: unknown) => {
    if (mat && typeof mat === "object" && "emissive" in mat && "emissiveIntensity" in mat) {
      const m = mat as THREE.MeshStandardMaterial
      if (!m.userData.baseEmissive) {
        m.userData.baseEmissive = m.emissiveIntensity
      }
      if (!m.userData.baseEmissiveColor) {
        m.userData.baseEmissiveColor = m.emissive.clone()
      }
      materials.push({
        mat: m,
        baseIntensity: m.userData.baseEmissive,
        baseColor: m.userData.baseEmissiveColor,
      })
    }
  }

  if (target instanceof THREE.Material) {
    inspect(target)
  } else if (target instanceof THREE.Object3D) {
    target.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
        const m = (child as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach(inspect)
        else inspect(m)
      }
    })
  }

  if (materials.length === 0) return

  for (const item of materials) {
    if (color !== undefined) {
      item.mat.emissive.set(color)
    } else if (item.mat.emissive.getHex() === 0) {
      item.mat.emissive.setHex(0xffffff)
    }
    item.mat.emissiveIntensity = peak
  }

  let elapsed = 0
  const timer = setInterval(() => {
    elapsed += 0.016
    const t = Math.min(elapsed / durationSec, 1)
    const factor = 1 - t // Linear decay from peak down to base

    for (const item of materials) {
      item.mat.emissiveIntensity =
        item.baseIntensity + (peak - item.baseIntensity) * factor
    }

    if (t >= 1) {
      clearInterval(timer)
      for (const item of materials) {
        item.mat.emissiveIntensity = item.baseIntensity
        item.mat.emissive.copy(item.baseColor)
      }
      onComplete?.()
    }
  }, 16)
}

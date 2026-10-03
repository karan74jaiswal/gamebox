import * as THREE from "three"
import { ShakeRig, FovPuncher } from "./game-feel.ts"

export interface ChaseCameraOptions {
  distance?: number
  height?: number
  lookAhead?: number
  fov?: number
  speedFov?: number
  lambda?: number
  rollTilt?: number
}

/**
 * Professional chase camera rig with relative-space damping, horizon roll lean,
 * and speed-dependent FOV expansion (extracted and generalized from knightfall).
 */
export function createChaseCamera(
  camera: THREE.PerspectiveCamera,
  options: ChaseCameraOptions = {}
) {
  const {
    distance = 5,
    height = 1.8,
    lookAhead = 3,
    fov = 45,
    speedFov = 65,
    lambda = 6,
    rollTilt = 0.25,
  } = options

  const currentOffset = new THREE.Vector3(0, height, -distance)
  const desiredOffset = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  const smoothedLook = new THREE.Vector3()
  let shakeIntensity = 0

  camera.fov = fov
  camera.updateProjectionMatrix()

  return {
    snap(position: THREE.Vector3, heading: number = 0) {
      const cos = Math.cos(heading)
      const sin = Math.sin(heading)
      currentOffset.set(-sin * distance, height, -cos * distance)
      smoothedLook.set(sin * lookAhead, height * 0.5, cos * lookAhead)
      camera.position.copy(position).add(currentOffset)
      camera.lookAt(position.clone().add(smoothedLook))
    },

    update(
      dt: number,
      targetPosition: THREE.Vector3,
      heading: number,
      pitch: number = 0,
      roll: number = 0,
      speedNorm: number = 0
    ) {
      const cosH = Math.cos(heading)
      const sinH = Math.sin(heading)
      const cosP = Math.cos(pitch)
      const sinP = Math.sin(pitch)

      // Compute desired offset in target's heading orientation
      desiredOffset.set(
        -sinH * distance * cosP,
        height - sinP * distance,
        -cosH * distance * cosP
      )

      // Damp RELATIVE to target position to prevent trailing creep at high speeds
      const effectiveLambda = lambda + speedNorm * 2
      currentOffset.x = THREE.MathUtils.damp(currentOffset.x, desiredOffset.x, effectiveLambda, dt)
      currentOffset.y = THREE.MathUtils.damp(currentOffset.y, desiredOffset.y, effectiveLambda, dt)
      currentOffset.z = THREE.MathUtils.damp(currentOffset.z, desiredOffset.z, effectiveLambda, dt)

      const targetLook = new THREE.Vector3(
        sinH * lookAhead * cosP,
        height * 0.4 + sinP * lookAhead,
        cosH * lookAhead * cosP
      )
      smoothedLook.x = THREE.MathUtils.damp(smoothedLook.x, targetLook.x, 8, dt)
      smoothedLook.y = THREE.MathUtils.damp(smoothedLook.y, targetLook.y, 8, dt)
      smoothedLook.z = THREE.MathUtils.damp(smoothedLook.z, targetLook.z, 8, dt)

      camera.position.copy(targetPosition).add(currentOffset)

      // Apply screen shake
      if (shakeIntensity > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shakeIntensity
        camera.position.y += (Math.random() - 0.5) * shakeIntensity
        camera.position.z += (Math.random() - 0.5) * shakeIntensity
        shakeIntensity = THREE.MathUtils.damp(shakeIntensity, 0, 5, dt)
      }

      lookTarget.copy(targetPosition).add(smoothedLook)
      camera.lookAt(lookTarget)

      // Horizon roll lean
      if (rollTilt > 0) {
        camera.rotation.z = -roll * rollTilt
      }

      // Dynamic FOV widening with speed
      const targetFov = THREE.MathUtils.lerp(fov, speedFov, THREE.MathUtils.clamp(speedNorm, 0, 1))
      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 4, dt)
        camera.updateProjectionMatrix()
      }
    },

    shake(intensity: number = 0.3) {
      shakeIntensity = Math.max(shakeIntensity, intensity)
    },
  }
}

export interface FirstPersonBobOptions {
  bobSpeed?: number
  bobAmount?: number
  swayAmount?: number
}

/**
 * First-person weapon view bobbing and camera sway rig (generalized from mossbound).
 */
export function createFirstPersonBob(options: FirstPersonBobOptions = {}) {
  const { bobSpeed = 10, bobAmount = 0.04, swayAmount = 0.02 } = options
  let stepTimer = 0

  return {
    update(dt: number, isMoving: boolean, moveSpeed: number = 1) {
      if (isMoving) {
        stepTimer += dt * bobSpeed * moveSpeed
      } else {
        stepTimer = THREE.MathUtils.damp(stepTimer, Math.round(stepTimer / Math.PI) * Math.PI, 6, dt)
      }

      const bobY = Math.sin(stepTimer) * bobAmount
      const bobX = Math.cos(stepTimer * 0.5) * swayAmount

      return { bobX, bobY }
    },
    reset() {
      stepTimer = 0
    },
  }
}

/**
 * Unified CameraRig matching threejs-gameplay-systems / CameraRig.ts.
 * Smoothly follows target with exponential damping, lookTarget lead,
 * and built-in ShakeRig trauma screenshake and FOV punch.
 */
export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3()
  private readonly lookTarget = new THREE.Vector3()
  readonly shake = new ShakeRig()
  readonly fovPunch: FovPuncher

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    readonly offset = new THREE.Vector3(0, 9.5, 9.5),
    readonly lookOffset = new THREE.Vector3(0, 0.35, -1.2)
  ) {
    this.fovPunch = new FovPuncher(camera)
  }

  snapTo(target: THREE.Vector3): void {
    this.desiredPosition.copy(target).add(this.offset)
    this.camera.position.copy(this.desiredPosition)
    this.lookTarget.copy(target).add(this.lookOffset)
    this.camera.lookAt(this.lookTarget)
  }

  update(delta: number, target: THREE.Vector3, lag = 0.12): void {
    this.desiredPosition.copy(target).add(this.offset)
    const factor = 1 - Math.exp(-delta / Math.max(0.001, lag))
    this.camera.position.lerp(this.desiredPosition, factor)
    this.lookTarget.copy(target).add(this.lookOffset)
    this.camera.lookAt(this.lookTarget)

    // Update shake and FOV kick
    this.shake.update(delta, this.camera)
    this.fovPunch.update(delta)
  }

  addTrauma(amount: number): void {
    this.shake.addTrauma(amount)
  }

  punchFov(degrees: number): void {
    this.fovPunch.punch(degrees)
  }
}


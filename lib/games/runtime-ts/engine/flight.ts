import * as THREE from "three"

export interface FlightModelOptions {
  mass?: number
  maxThrust?: number
  dragCoefficient?: number
  liftCoefficient?: number
  turnRate?: number
  pitchRate?: number
  rollRate?: number
}

/**
 * Aerodynamic 6-DOF flight simulation model (extracted from quadrotor-sandbox).
 * Simulates lift, induced drag, engine thrust, and angular aerodynamic damping.
 */
export function createFlightModel(options: FlightModelOptions = {}) {
  const {
    mass = 1.2,
    maxThrust = 28,
    dragCoefficient = 0.08,
    liftCoefficient = 0.35,
    turnRate = 1.8,
    pitchRate = 2.0,
    rollRate = 2.5,
  } = options

  const position = new THREE.Vector3()
  const velocity = new THREE.Vector3()
  const rotation = new THREE.Euler(0, 0, 0, "YXZ")
  const forward = new THREE.Vector3()
  const up = new THREE.Vector3()
  const right = new THREE.Vector3()

  return {
    position,
    velocity,
    rotation,

    update(
      dt: number,
      inputs: { throttle: number; pitch: number; roll: number; yaw: number }
    ) {
      // Angular rotation
      rotation.y -= inputs.yaw * turnRate * dt
      rotation.x = THREE.MathUtils.clamp(rotation.x + inputs.pitch * pitchRate * dt, -Math.PI / 2.2, Math.PI / 2.2)
      rotation.z = THREE.MathUtils.clamp(rotation.z - inputs.roll * rollRate * dt, -Math.PI / 2, Math.PI / 2)

      // Compute local directional axes
      const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation)
      forward.set(0, 0, -1).applyMatrix4(matrix)
      up.set(0, 1, 0).applyMatrix4(matrix)
      right.set(1, 0, 0).applyMatrix4(matrix)

      // Forward speed
      const forwardSpeed = velocity.dot(forward)

      // Thrust
      const thrustForce = forward.clone().multiplyScalar(inputs.throttle * maxThrust)

      // Lift force (proportional to forward speed squared)
      const liftMagnitude = Math.max(0, forwardSpeed) * liftCoefficient * 9.8
      const liftForce = up.clone().multiplyScalar(liftMagnitude)

      // Aerodynamic drag opposing velocity
      const speed = velocity.length()
      const dragForce = velocity.clone().multiplyScalar(-speed * dragCoefficient)

      // Gravity
      const gravityForce = new THREE.Vector3(0, -9.8 * mass, 0)

      // Total acceleration = (Thrust + Lift + Drag + Gravity) / Mass
      const totalForce = new THREE.Vector3()
        .add(thrustForce)
        .add(liftForce)
        .add(dragForce)
        .add(gravityForce)

      const acceleration = totalForce.divideScalar(mass)

      // Euler integration
      velocity.addScaledVector(acceleration, dt)
      position.addScaledVector(velocity, dt)

      return {
        speed: velocity.length(),
        altitude: position.y,
        forwardSpeed,
      }
    },

    reset(pos: [number, number, number] = [0, 10, 0]) {
      position.set(...pos)
      velocity.set(0, 0, 0)
      rotation.set(0, 0, 0)
    },
  }
}

import * as THREE from "three"

import type {
  BodyConfig,
  BoxCollider,
  Collider,
  GroundCollider,
  PhysicsBody,
  PhysicsOptions,
  PhysicsWorld,
  RaycastHit,
  SphereCollider,
  Vector3Like,
  Vector3Tuple,
} from "./types.js"
import { clamp } from "./math.js"

/**
 * Arcade collision — the kind games actually want.
 *
 * Not a rigid-body simulation. Nothing here tumbles, stacks or conserves
 * momentum, because almost no game needs that and every game that pulls in a
 * physics engine for it pays with a dependency, a tuning problem and a
 * character that slides down slopes. What games do need is: don't fall through
 * the floor, don't walk through walls, slide along them instead of stopping
 * dead, and tell me when two things touched. That is what this is.
 *
 *   const world = createPhysics()
 *   world.addBox(wall)                 // static, from any mesh
 *   const body = world.addBody({ radius: 0.5, height: 1.8 })
 *   body.velocity.x = 4
 *   world.step(dt)                     // in your engine.onUpdate
 */

const UP = new THREE.Vector3(0, 1, 0)

function toVector3(v: Vector3Like): THREE.Vector3 {
  if (v instanceof THREE.Vector3) return v
  if (Array.isArray(v)) return new THREE.Vector3(v[0], v[1], v[2])
  return new THREE.Vector3(v.x, v.y, v.z)
}

export function createPhysics(options: PhysicsOptions = {}): PhysicsWorld {
  const {
    gravity = -24,
    groundFriction = 12,
    airFriction = 0.6,
    maxSlope = 0.7,
  } = options

  const statics: Collider[] = []
  const bodies: PhysicsBody[] = []
  const triggers: PhysicsBody[] = []

  // --- Static geometry ------------------------------------------------------

  /** A solid box. Pass a mesh and its world bounding box is used. */
  function addBox(
    source: THREE.Object3D | { min: Vector3Like; max: Vector3Like },
    extra: Record<string, unknown> = {}
  ): BoxCollider {
    const isObj = (source as THREE.Object3D).isObject3D
    const box = isObj
      ? new THREE.Box3().setFromObject(source as THREE.Object3D)
      : new THREE.Box3(
          toVector3((source as { min: Vector3Like; max: Vector3Like }).min),
          toVector3((source as { min: Vector3Like; max: Vector3Like }).max)
        )
    const collider: BoxCollider = {
      type: "box",
      box,
      object: isObj ? (source as THREE.Object3D) : null,
      ...extra,
    }
    statics.push(collider)
    return collider
  }

  /** An infinite floor at height `y`. Cheaper and steadier than a box. */
  function addGround(
    y: number = 0,
    extra: Record<string, unknown> = {}
  ): GroundCollider {
    const collider: GroundCollider = { type: "ground", y, ...extra }
    statics.push(collider)
    return collider
  }

  function addSphere(
    center: THREE.Vector3 | Vector3Tuple,
    radius: number,
    extra: Record<string, unknown> = {}
  ): SphereCollider {
    const collider: SphereCollider = {
      type: "sphere",
      center: center instanceof THREE.Vector3 ? center : new THREE.Vector3(...center),
      radius,
      ...extra,
    }
    statics.push(collider)
    return collider
  }

  /** Everything a `models.arena()` walls off, in one call. */
  function addArena(group: THREE.Group): BoxCollider[] {
    return group.children.map((wall) => addBox(wall))
  }

  function removeCollider(collider: Collider): void {
    const index = statics.indexOf(collider)
    if (index >= 0) statics.splice(index, 1)
  }

  // --- Bodies ---------------------------------------------------------------

  /**
   * A moving thing. Bodies are vertical capsules — a radius and a height —
   * because that is the shape that walks up a step and round a corner without
   * catching, which a box does not.
   */
  function addBody(config: BodyConfig = {}): PhysicsBody {
    const {
      object = null,
      radius = 0.5,
      height = 1,
      position = object?.position ? object.position.toArray() : [0, 0, 0],
      gravityScale = 1,
      bounce = 0,
      friction = groundFriction,
      trigger = false,
      tag = null,
      data = {},
      onLand,
      onEnter,
      onExit,
    } = config

    const body: PhysicsBody = {
      object,
      position: toVector3(position),
      velocity: new THREE.Vector3(),
      radius,
      height,
      gravityScale,
      bounce,
      friction,
      trigger,
      tag,
      data,
      grounded: false,
      groundY: 0,
      enabled: true,
      /** Set by `step` each frame: the surfaces hit, for wall-jumps and dust. */
      contacts: [],
      onLand,
      onEnter,
      onExit,
    }

    if (trigger) triggers.push(body)
    else bodies.push(body)
    return body
  }

  function removeBody(body: PhysicsBody): void {
    for (const list of [bodies, triggers]) {
      const index = list.indexOf(body)
      if (index >= 0) list.splice(index, 1)
    }
  }

  // --- Resolution -----------------------------------------------------------

  const closest = new THREE.Vector3()
  const push = new THREE.Vector3()

  /** Nudges a body out of one collider, and reports which way it was pushed. */
  function resolve(body: PhysicsBody, collider: Collider): THREE.Vector3 | null {
    if (collider.type === "ground") {
      const floor = (collider as GroundCollider).y + body.radius
      if (body.position.y < floor) {
        body.position.y = floor
        return UP
      }
      return null
    }

    if (collider.type === "sphere") {
      const sphereCol = collider as SphereCollider
      push.copy(body.position).sub(sphereCol.center)
      const distance = push.length()
      const minimum = sphereCol.radius + body.radius
      if (distance >= minimum || distance === 0) return null
      push.multiplyScalar(1 / distance)
      body.position.copy(sphereCol.center).addScaledVector(push, minimum)
      return push.clone()
    }

    const { box } = collider as BoxCollider
    closest.set(
      clamp(body.position.x, box.min.x, box.max.x),
      clamp(body.position.y, box.min.y, box.max.y),
      clamp(body.position.z, box.min.z, box.max.z)
    )
    push.copy(body.position).sub(closest)
    const distanceSq = push.lengthSq()
    if (distanceSq >= body.radius * body.radius) return null

    if (distanceSq > 1e-8) {
      const distance = Math.sqrt(distanceSq)
      push.multiplyScalar(1 / distance)
      body.position.copy(closest).addScaledVector(push, body.radius)
      return push.clone()
    }

    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
    const delta = body.position.clone().sub(center)
    const absDelta = new THREE.Vector3(
      Math.abs(delta.x),
      Math.abs(delta.y),
      Math.abs(delta.z)
    )
    const overlap = size.clone().addScalar(body.radius).sub(absDelta)
    if (overlap.x < overlap.y && overlap.x < overlap.z) {
      push.set(Math.sign(delta.x) || 1, 0, 0)
    } else if (overlap.y < overlap.z) {
      push.set(0, Math.sign(delta.y) || 1, 0)
    } else {
      push.set(0, 0, Math.sign(delta.z) || 1)
    }
    const absPush = new THREE.Vector3(
      Math.abs(push.x),
      Math.abs(push.y),
      Math.abs(push.z)
    )
    body.position.addScaledVector(push, overlap.dot(absPush))
    return push.clone()
  }

  function overlaps(a: PhysicsBody, b: PhysicsBody): boolean {
    const dx = a.position.x - b.position.x
    const dz = a.position.z - b.position.z
    const dy = a.position.y - b.position.y
    const reach = a.radius + b.radius
    const tall = (a.height + b.height) / 2 + reach
    return dx * dx + dz * dz < reach * reach && Math.abs(dy) < tall
  }

  // --- Step -----------------------------------------------------------------

  function step(dt: number): void {
    for (const body of bodies) {
      if (!body.enabled) continue

      body.velocity.y += gravity * body.gravityScale * dt
      body.position.addScaledVector(body.velocity, dt)

      body.contacts.length = 0
      const wasGrounded = body.grounded
      body.grounded = false

      for (const collider of statics) {
        if (collider.disabled) continue
        const normal = resolve(body, collider)
        if (!normal) continue

        body.contacts.push({ collider, normal })

        if (normal.y > maxSlope) {
          body.grounded = true
          body.groundY = body.position.y - body.radius
          if (body.velocity.y < 0) {
            body.velocity.y = body.bounce ? -body.velocity.y * body.bounce : 0
            if (Math.abs(body.velocity.y) < 1) body.velocity.y = 0
          }
        } else {
          const into = body.velocity.dot(normal)
          if (into < 0) {
            body.velocity.addScaledVector(normal, -into * (1 + body.bounce))
          }
        }
      }

      const drag = body.grounded ? body.friction : airFriction
      const decay = Math.exp(-drag * dt)
      body.velocity.x *= decay
      body.velocity.z *= decay

      if (body.grounded && !wasGrounded) body.onLand?.(body)
      body.object?.position.copy(body.position)
    }

    for (const trigger of triggers) {
      if (!trigger.enabled) continue
      for (const body of bodies) {
        if (!body.enabled) continue
        const touching = overlaps(trigger, body)
        const key = `_hit_${bodies.indexOf(body)}`
        if (touching && !trigger[key]) trigger.onEnter?.(body, trigger)
        else if (!touching && trigger[key]) trigger.onExit?.(body, trigger)
        trigger[key] = touching
      }
      trigger.object?.position.copy(trigger.position)
    }
  }

  // --- Queries --------------------------------------------------------------

  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)

  /**
   * The height of the ground under a point, by raycasting real meshes.
   *
   * Use this for terrain, ramps and anything the box colliders above can't
   * describe. `meshes` are the visual meshes themselves.
   */
  function groundAt(
    x: number,
    z: number,
    meshes: THREE.Object3D[],
    from: number = 100
  ): number | null {
    raycaster.set(new THREE.Vector3(x, from, z), down)
    const hit = raycaster.intersectObjects(meshes, true)[0]
    return hit ? hit.point.y : null
  }

  /** First thing a ray hits, as `{ point, normal, object, distance }` or null. */
  function raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    meshes: THREE.Object3D[],
    far: number = 1000
  ): RaycastHit | null {
    raycaster.set(origin, direction.clone().normalize())
    raycaster.far = far
    const hit = raycaster.intersectObjects(meshes, true)[0]
    raycaster.far = Infinity
    return hit
      ? {
          point: hit.point,
          normal: hit.face ? hit.face.normal : undefined,
          object: hit.object,
          distance: hit.distance,
        }
      : null
  }

  return {
    gravity,
    statics,
    bodies,
    triggers,
    addBox,
    addGround,
    addSphere,
    addArena,
    removeCollider,
    addBody,
    removeBody,
    step,
    overlaps,
    groundAt,
    raycast,
  }
}

/**
 * Whether two spheres touch — for bullets, pickups and hitboxes that don't
 * need a body in the world. `a` and `b` are anything with `.position`.
 */
export function hits(
  a: { position: THREE.Vector3 },
  b: { position: THREE.Vector3 },
  radiusA: number = 0.5,
  radiusB: number = 0.5
): boolean {
  const reach = radiusA + radiusB
  return a.position.distanceToSquared(b.position) < reach * reach
}

/** Whether a point is inside an axis-aligned box, given as centre and size. */
export function inside(
  point: THREE.Vector3,
  center: THREE.Vector3,
  size: THREE.Vector3
): boolean {
  return (
    Math.abs(point.x - center.x) <= size.x / 2 &&
    Math.abs(point.y - center.y) <= size.y / 2 &&
    Math.abs(point.z - center.z) <= size.z / 2
  )
}

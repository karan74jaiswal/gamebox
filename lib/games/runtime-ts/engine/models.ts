import * as THREE from "three"
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"

import type { ColorLike, Vector3Tuple } from "./types.js"
import {
  matte,
  palette,
  shade,
  checkerTexture,
  textTexture,
} from "./materials.js"
import { randRange, randInt, TAU } from "./math.js"

/**
 * Things to put in the scene, built out of primitives.
 *
 * There is no art in the sandbox and no model to download, so every object in
 * every game is assembled from boxes, spheres and cylinders. That constraint is
 * fine — it is what most stylised games look like anyway — but only if the
 * assembling is already done. These are the pieces.
 *
 * Everything returns a `Group` or `Mesh` with shadows already configured, so
 * dropping one into a lit scene looks right immediately.
 */

/** Casts and receives, recursively. The step everyone forgets. */
export function castShadows<T extends THREE.Object3D>(
  object: T,
  cast: boolean = true,
  receive: boolean = true
): T {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = cast
      child.receiveShadow = receive
    }
  })
  return object
}

// --- Primitives -------------------------------------------------------------

function build(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  position?: Vector3Tuple
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  if (position) mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export interface PrimitiveOptions {
  color?: ColorLike
  material?: THREE.Material | THREE.Material[]
  position?: Vector3Tuple
}

export interface BoxOptions extends PrimitiveOptions {
  radius?: number
}

export function box(
  size: number | [number, number, number] = 1,
  options: BoxOptions = {}
): THREE.Mesh {
  const [w, h, d] = Array.isArray(size) ? size : [size, size, size]
  const {
    color = palette.mist,
    material = matte(color),
    position,
    radius = 0,
  } = options
  const geometry = radius
    ? new RoundedBoxGeometry(
        w,
        h,
        d,
        4,
        Math.min(radius, Math.min(w, h, d) / 2)
      )
    : new THREE.BoxGeometry(w, h, d)
  return build(geometry, material, position)
}

export interface SphereOptions extends PrimitiveOptions {
  segments?: number
}

export function sphere(
  radius: number = 0.5,
  options: SphereOptions = {}
): THREE.Mesh {
  const {
    color = palette.mist,
    material = matte(color),
    position,
    segments = 24,
  } = options
  return build(
    new THREE.SphereGeometry(radius, segments, Math.floor(segments / 2)),
    material,
    position
  )
}

export interface CylinderOptions extends PrimitiveOptions {
  segments?: number
}

export function cylinder(
  radius: number = 0.5,
  height: number = 1,
  options: CylinderOptions = {}
): THREE.Mesh {
  const {
    color = palette.mist,
    material = matte(color),
    position,
    segments = 20,
  } = options
  return build(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material,
    position
  )
}

export interface ConeOptions extends PrimitiveOptions {
  segments?: number
}

export function cone(
  radius: number = 0.5,
  height: number = 1,
  options: ConeOptions = {}
): THREE.Mesh {
  const {
    color = palette.mist,
    material = matte(color),
    position,
    segments = 20,
  } = options
  return build(
    new THREE.ConeGeometry(radius, height, segments),
    material,
    position
  )
}

export function capsule(
  radius: number = 0.4,
  height: number = 1,
  options: PrimitiveOptions = {}
): THREE.Mesh {
  const { color = palette.mist, material = matte(color), position } = options
  return build(
    new THREE.CapsuleGeometry(radius, height, 6, 16),
    material,
    position
  )
}

export function torus(
  radius: number = 0.6,
  tube: number = 0.2,
  options: PrimitiveOptions = {}
): THREE.Mesh {
  const { color = palette.mist, material = matte(color), position } = options
  return build(
    new THREE.TorusGeometry(radius, tube, 16, 48),
    material,
    position
  )
}

export interface GroundOptions {
  color?: string
  accent?: string
  texture?: THREE.CanvasTexture | null
  repeat?: number
  material?: THREE.Material
}

/**
 * The floor. Big, checkered by default, and lying in the XZ plane already.
 *
 * A plain-coloured ground gives the player no sense of speed or distance; the
 * repeating texture is what makes movement legible, so it is the default.
 */
export function ground(
  size: number = 100,
  options: GroundOptions = {}
): THREE.Mesh {
  const {
    color = "#1f1f1f",
    accent = "#171717",
    texture = checkerTexture({ light: color, dark: accent, squares: 2 }),
    repeat = size / 4,
    material,
  } = options

  if (texture) {
    texture.repeat.set(repeat, repeat)
    texture.needsUpdate = true
  }

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    material ?? matte(color, { map: texture ?? undefined })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  // A floor has nothing under it to shadow, and casting from it only costs.
  mesh.castShadow = false
  return mesh
}

export interface ArenaOptions {
  height?: number
  thickness?: number
  color?: ColorLike
  material?: THREE.Material
}

/** Four walls around the play area, so nothing can wander off the level. */
export function arena(
  size: number = 40,
  options: ArenaOptions = {}
): THREE.Group {
  const {
    height = 3,
    thickness = 1,
    color = palette.slate,
    material = matte(color),
  } = options
  const group = new THREE.Group()
  const half = size / 2
  const spans: Array<[number, number, number, number, number, number]> = [
    [
      size + thickness * 2,
      height,
      thickness,
      0,
      height / 2,
      -half - thickness / 2,
    ],
    [
      size + thickness * 2,
      height,
      thickness,
      0,
      height / 2,
      half + thickness / 2,
    ],
    [thickness, height, size, -half - thickness / 2, height / 2, 0],
    [thickness, height, size, half + thickness / 2, height / 2, 0],
  ]
  for (const [w, h, d, x, y, z] of spans) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    wall.position.set(x, y, z)
    wall.castShadow = true
    wall.receiveShadow = true
    group.add(wall)
  }
  // Handed back so a physics world can be built from the same walls.
  group.userData.bounds = { size, height, thickness }
  return group
}

// --- Prefabs ----------------------------------------------------------------

export interface CrateOptions {
  color?: ColorLike
  accent?: ColorLike
}

/** A crate. Rounded corners and a darker frame read better than a bare cube. */
export function crate(size: number = 1, options: CrateOptions = {}): THREE.Group {
  const { color = "#a16207", accent = shade(color, -0.15) } = options
  const group = new THREE.Group()
  group.add(box(size, { color, radius: size * 0.08 }))
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(accent) })
  )
  group.add(frame)
  return castShadows(group)
}

export interface CoinOptions {
  radius?: number
  color?: ColorLike
  thickness?: number
}

/** A collectible: spins on its own, hovers, and glows. Returns `update(dt)`. */
export function coin(options: CoinOptions = {}): THREE.Group {
  const { radius = 0.35, color = "#facc15", thickness = 0.08 } = options
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, thickness, 24),
    matte(color, {
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.5,
      metalness: 0.4,
      roughness: 0.3,
    })
  )
  // Lying flat would make it invisible from above; a coin faces the player.
  mesh.rotation.x = Math.PI / 2
  const group = new THREE.Group()
  group.add(mesh)
  castShadows(group)

  const baseY = 0
  group.userData.update = (dt: number, elapsed: number = 0) => {
    group.rotation.y += dt * 2.5
    group.position.y = baseY + Math.sin(elapsed * 2.5) * 0.12
  }
  return group
}

export interface TreeOptions {
  height?: number
  trunk?: ColorLike
  leaves?: ColorLike
  tiers?: number
}

/** A low-poly tree. Randomised so a forest of them doesn't look stamped. */
export function tree(options: TreeOptions = {}): THREE.Group {
  const {
    height = randRange(2.5, 4),
    trunk = "#78350f",
    leaves = "#15803d",
    tiers = randInt(2, 3),
  } = options
  const group = new THREE.Group()
  const trunkHeight = height * 0.4
  group.add(
    cylinder(height * 0.06, trunkHeight, {
      color: trunk,
      position: [0, trunkHeight / 2, 0],
    })
  )

  for (let i = 0; i < tiers; i++) {
    const t = i / tiers
    const tierRadius = height * 0.32 * (1 - t * 0.45)
    const tierHeight = height * 0.42 * (1 - t * 0.2)
    const y = trunkHeight + height * 0.2 * i + tierHeight / 2
    group.add(
      cone(tierRadius, tierHeight, {
        color: shade(leaves, i * 0.05),
        position: [0, y, 0],
        segments: 7,
      })
    )
  }
  group.rotation.y = Math.random() * TAU
  return castShadows(group)
}

export interface RockOptions {
  radius?: number
  color?: ColorLike
  jitter?: number
}

/** A boulder — a sphere with its vertices shoved about. Never twice the same. */
export function rock(options: RockOptions = {}): THREE.Mesh {
  const { radius = 0.8, color = "#57534e", jitter = 0.22 } = options
  const geometry = new THREE.IcosahedronGeometry(radius, 1)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const scale = 1 + randRange(-jitter, jitter)
    position.setXYZ(
      i,
      position.getX(i) * scale,
      position.getY(i) * scale * 0.8,
      position.getZ(i) * scale
    )
  }
  // Faceted rather than smooth: recomputed normals per face are the whole look.
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, matte(color, { flatShading: true }))
  mesh.rotation.set(
    Math.random() * TAU,
    Math.random() * TAU,
    Math.random() * TAU
  )
  return castShadows(mesh)
}

export interface CloudOptions {
  color?: ColorLike
  puffs?: number
  spread?: number
}

export function cloud(options: CloudOptions = {}): THREE.Group {
  const { color = "#f8fafc", puffs = 5, spread = 2 } = options
  const group = new THREE.Group()
  const material = matte(color, { roughness: 1 })
  for (let i = 0; i < puffs; i++) {
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(randRange(0.6, 1.1), 1),
      material
    )
    puff.position.set(
      randRange(-spread, spread),
      randRange(-0.2, 0.3),
      randRange(-0.6, 0.6)
    )
    puff.castShadow = false
    puff.receiveShadow = false
    group.add(puff)
  }
  return group
}

export interface CharacterParts {
  body: THREE.Mesh
  head: THREE.Mesh
  armLeft: THREE.Group
  armRight: THREE.Group
  legLeft: THREE.Group
  legRight: THREE.Group
  [key: string]: THREE.Object3D
}

export interface CharacterOptions {
  skin?: ColorLike
  shirt?: ColorLike
  trousers?: ColorLike
  height?: number
}

/**
 * A blocky humanoid, with every part named so the game can animate it.
 *
 * `character.parts` holds head, body, armLeft, armRight, legLeft, legRight —
 * enough for a walk cycle, a wave, a hit reaction and a death flop. The group's
 * origin is at the feet, which is what movement and ground checks assume.
 */
export function character(options: CharacterOptions = {}): THREE.Group {
  const {
    skin = palette.amber,
    shirt = palette.ember,
    trousers = palette.slate,
    height = 1.8,
  } = options

  const unit = height / 8
  const group = new THREE.Group()
  const parts: Partial<CharacterParts> = {}

  const bodyHeight = unit * 3
  parts.body = box([unit * 2.2, bodyHeight, unit * 1.2], {
    color: shirt,
    radius: unit * 0.2,
    position: [0, unit * 3 + bodyHeight / 2, 0],
  })

  parts.head = box([unit * 1.7, unit * 1.7, unit * 1.7], {
    color: skin,
    radius: unit * 0.35,
    position: [0, unit * 6 + unit * 1.1, 0],
  })

  const limb = (x: number, color: ColorLike, length: number, y: number): THREE.Group => {
    // Pivot at the shoulder/hip, not the middle: a limb group rotated about its
    // centre bends in the wrong place and nothing looks like walking.
    const pivot = new THREE.Group()
    pivot.position.set(x, y, 0)
    const mesh = box([unit * 0.75, length, unit * 0.75], {
      color,
      radius: unit * 0.2,
      position: [0, -length / 2, 0],
    })
    pivot.add(mesh)
    return pivot
  }

  const armY = unit * 6
  const armLength = unit * 2.8
  parts.armLeft = limb(-unit * 1.5, shirt, armLength, armY)
  parts.armRight = limb(unit * 1.5, shirt, armLength, armY)

  const legY = unit * 3
  const legLength = unit * 3
  parts.legLeft = limb(-unit * 0.6, trousers, legLength, legY)
  parts.legRight = limb(unit * 0.6, trousers, legLength, legY)

  group.add(...(Object.values(parts) as THREE.Object3D[]))
  group.userData.parts = parts
  group.userData.height = height

  /**
   * A walk cycle from a sine wave. `speed` 0 settles into an idle sway.
   * Call every frame with the elapsed time and how fast the character is going.
   */
  group.userData.animate = (elapsed: number, speed: number = 1) => {
    const swing = Math.sin(elapsed * 9) * Math.min(speed, 1)
    if (parts.legLeft) parts.legLeft.rotation.x = swing * 0.8
    if (parts.legRight) parts.legRight.rotation.x = -swing * 0.8
    if (parts.armLeft) parts.armLeft.rotation.x = -swing * 0.6
    if (parts.armRight) parts.armRight.rotation.x = swing * 0.6
    if (parts.body) {
      parts.body.position.y =
        unit * 3 + bodyHeight / 2 + Math.abs(swing) * unit * 0.12
    }
    if (parts.head) {
      parts.head.rotation.z =
        Math.sin(elapsed * 2) * 0.04 * (1 - Math.min(speed, 1))
    }
  }

  return castShadows(group)
}

export interface VehicleOptions {
  color?: ColorLike
  accent?: ColorLike
  length?: number
  width?: number
}

/** A simple car/ship body. Points down -Z, which is three.js's "forward". */
export function vehicle(options: VehicleOptions = {}): THREE.Group {
  const {
    color = palette.ember,
    accent = palette.slate,
    length = 3,
    width = 1.6,
  } = options
  const group = new THREE.Group()

  group.add(
    box([width, 0.5, length], { color, radius: 0.18, position: [0, 0.5, 0] })
  )
  group.add(
    box([width * 0.75, 0.45, length * 0.42], {
      color: accent,
      radius: 0.12,
      position: [0, 0.95, -0.1],
    })
  )

  const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 16)
  const wheelMaterial = matte("#111111")
  for (const [x, z] of [
    [-width / 2, -length / 3],
    [width / 2, -length / 3],
    [-width / 2, length / 3],
    [width / 2, length / 3],
  ]) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.34, z)
    group.add(wheel)
  }

  return castShadows(group)
}

export interface RingOptions {
  radius?: number
  color?: ColorLike
  thickness?: number
}

/** An expanding ring for impacts, shockwaves and pickup pops. */
export function ring(options: RingOptions = {}): THREE.Mesh {
  const { radius = 0.5, color = palette.ember, thickness = 0.08 } = options
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius - thickness, radius, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  )
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

export interface LabelOptions {
  color?: string
  size?: number
  background?: string
  font?: string
}

export interface LabelSprite extends THREE.Sprite {
  material: THREE.SpriteMaterial
  setText: (next: string) => void
}

/**
 * Floating text that always faces the camera — damage numbers, names, signs.
 *
 * A Sprite rather than a mesh, so it never turns away from the player and never
 * needs to be re-aimed as the camera moves.
 */
export function label(text: string, options: LabelOptions = {}): LabelSprite {
  const {
    color = "#ffffff",
    size = 0.5,
    background = "transparent",
    font,
  } = options
  const draw = (value: string): THREE.CanvasTexture =>
    textTexture(value, { color, background, ...(font ? { font } : {}) })

  const texture = draw(text)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  ) as LabelSprite

  const fit = (map: THREE.CanvasTexture) => {
    const image = map.image as { width: number; height: number }
    sprite.scale.set((size * image.width) / image.height, size, 1)
  }
  fit(texture)

  /** Swaps the text in place — for a live score, a timer, a nameplate. */
  sprite.setText = (next: string) => {
    sprite.material.map?.dispose()
    const updated = draw(next)
    sprite.material.map = updated
    fit(updated)
  }
  return sprite
}

// --- Many of the same thing -------------------------------------------------

export interface InstancesMesh extends THREE.InstancedMesh {
  place: (
    index: number,
    pos: Vector3Tuple | THREE.Vector3,
    options?: { rotation?: Vector3Tuple; scale?: number | Vector3Tuple }
  ) => InstancesMesh
  hide: (index: number) => InstancesMesh
  tint: (index: number, color: ColorLike) => InstancesMesh
}

/**
 * One draw call for thousands of copies of one mesh.
 *
 * A field of a thousand separate trees is a thousand draw calls and a slideshow;
 * as an InstancedMesh it is one. Use this for grass, stars, bullets, debris —
 * anything numerous that shares a shape.
 *
 *   const stars = instances(geometry, material, 2000)
 *   stars.place(i, [x, y, z], { scale: 0.3 })
 */
export function instances(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  count: number
): InstancesMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count) as InstancesMesh
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)
  const euler = new THREE.Euler()

  mesh.place = (index, pos, options = {}) => {
    if (Array.isArray(pos)) {
      position.set(pos[0], pos[1], pos[2])
    } else {
      position.set(pos.x, pos.y, pos.z)
    }
    if (options.rotation) {
      euler.set(...options.rotation)
      quaternion.setFromEuler(euler)
    } else {
      quaternion.identity()
    }
    const s = options.scale ?? 1
    if (Array.isArray(s)) {
      scale.set(s[0], s[1], s[2])
    } else {
      scale.set(s, s, s)
    }
    matrix.compose(position, quaternion, scale)
    mesh.setMatrixAt(index, matrix)
    // Deferred: setting it per instance would upload the whole buffer each time.
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  }

  /** Sends an instance off-screen — the cheapest way to "remove" one. */
  mesh.hide = (index) => mesh.place(index, [0, -9999, 0], { scale: 0.0001 })

  mesh.tint = (index, color) => {
    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(count * 3).fill(1),
        3
      )
    }
    mesh.setColorAt(index, new THREE.Color(color))
    mesh.instanceColor.needsUpdate = true
    return mesh
  }

  return mesh
}

/** Welds static meshes into one geometry. Scenery that never moves, made free. */
export function merge(meshes: THREE.Mesh[]): THREE.Mesh {
  const geometries = meshes.map((m) => {
    const geometry = m.geometry.clone()
    m.updateWorldMatrix(true, false)
    geometry.applyMatrix4(m.matrixWorld)
    return geometry
  })
  const merged = mergeGeometries(geometries, false)
  if (!merged) throw new Error("Failed to merge geometries")
  const mesh = new THREE.Mesh(merged, meshes[0].material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  for (const geometry of geometries) geometry.dispose()
  return mesh
}

export interface PoolOptions<T> {
  size?: number
  parent?: THREE.Object3D | null
  onTake?: ((item: T) => void) | null
  onGive?: ((item: T) => void) | null
}

export interface Pool<T> {
  live: Set<T>
  readonly count: number
  take: () => T
  give: (item: T) => void
  each: (fn: (item: T) => boolean | void) => void
  clear: () => void
}

/**
 * Recycles objects instead of making and destroying them.
 *
 * Spawning a bullet per shot allocates, and the garbage collector eventually
 * pauses the frame to clean up — which the player feels as a stutter exactly
 * when the screen is busiest. A pool never allocates after warm-up.
 *
 *   const bullets = createPool(() => sphere(0.1), { size: 64 })
 *   const b = bullets.take(); ... bullets.give(b)
 */
export function createPool<T extends THREE.Object3D>(
  factory: () => T,
  options: PoolOptions<T> = {}
): Pool<T> {
  const { size = 32, parent = null, onTake = null, onGive = null } = options
  const free: T[] = []
  const live = new Set<T>()

  for (let i = 0; i < size; i++) {
    const item = factory()
    item.visible = false
    parent?.add(item)
    free.push(item)
  }

  return {
    live,
    get count() {
      return live.size
    },
    /** An idle object, or a new one if the pool has run dry. */
    take(): T {
      const item = free.pop() ?? factory()
      if (parent && !item.parent) parent.add(item)
      item.visible = true
      live.add(item)
      onTake?.(item)
      return item
    },
    give(item: T) {
      if (!live.delete(item)) return
      item.visible = false
      onGive?.(item)
      free.push(item)
    },
    /** Runs `fn(item)` over everything in flight; return true to retire it. */
    each(fn: (item: T) => boolean | void) {
      for (const item of [...live]) {
        if (fn(item) === true) this.give(item)
      }
    },
    clear() {
      for (const item of [...live]) this.give(item)
    },
  }
}

// --- Loading ----------------------------------------------------------------

const gltfLoader = new GLTFLoader()
const textureLoader = new THREE.TextureLoader()

export interface LoadedModel {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  gltf: GLTF
}

/**
 * Loads a .glb/.gltf from a url. There is no local model in the sandbox, so
 * this is only for a CDN url you are certain resolves — a wrong one leaves the
 * game with nothing on screen.
 */
export function loadModel(url: string): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        castShadows(gltf.scene)
        resolve({ scene: gltf.scene, animations: gltf.animations, gltf })
      },
      undefined,
      reject
    )
  })
}

export interface LoadTextureOptions {
  data?: boolean
  repeat?: [number, number]
}

export function loadTexture(
  url: string,
  options: LoadTextureOptions = {}
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = options.data
          ? THREE.NoColorSpace
          : THREE.SRGBColorSpace
        if (options.repeat) {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(...options.repeat)
        }
        resolve(texture)
      },
      undefined,
      reject
    )
  })
}

import * as THREE from "three"
import type { ColorLike, MaterialKit, MaterialKitOptions } from "./types.ts"

/**
 * Colour, surfaces, and textures drawn in code.
 *
 * The sandbox ships no art, so every texture a game uses has to be generated —
 * these draw to a canvas and hand back a three.js texture. A checkerboard floor
 * and a gradient sky are the difference between "a grey box in a void" and a
 * scene, and they cost nothing to make.
 */

/** The product's own colours, for anything that should look like it belongs. */
export const brand: Record<string, string> = {
  ember: "#ea580c",
  flame: "#f97316",
  amber: "#fb923c",
  ink: "#0a0a0a",
  ash: "#171717",
  slate: "#262626",
  smoke: "#525252",
  mist: "#a1a1a1",
  snow: "#ededed",
}

/** A general game palette — saturated enough to read at speed, and coherent. */
export const palette: Record<string, string> = {
  ...brand,
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#facc15",
  lime: "#84cc16",
  green: "#22c55e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#a855f7",
  pink: "#ec4899",
  brown: "#92400e",
  sand: "#e7d3a1",
  sky: "#7dd3fc",
  night: "#0f172a",
  white: "#ffffff",
  black: "#000000",
}

/** Blends two colours — `mix("#ea580c", "#ffffff", 0.5)` for a lighter face. */
export function mix(a: ColorLike, b: ColorLike, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t)
}

/** Nudges a colour's lightness. Negative darkens. Good for shading facets. */
export function shade(color: ColorLike, amount: number): THREE.Color {
  const c = new THREE.Color(color)
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 })
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0, 1))
  return c
}

// --- Surfaces ---------------------------------------------------------------

/** The default. Lit, shadowed, and responds to the scene's environment. */
export function standard(
  options: THREE.MeshStandardMaterialParameters = {}
): THREE.MeshStandardMaterial {
  const { color = palette.mist, ...rest } = options
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.75,
    metalness: 0,
    ...rest,
  })
}

/** Matte plastic — the safest look for toy-like, readable game objects. */
export function matte(
  color: ColorLike,
  options: THREE.MeshStandardMaterialParameters = {}
): THREE.MeshStandardMaterial {
  return standard({ color, roughness: 0.95, metalness: 0, ...options })
}

export function metal(
  color: ColorLike,
  options: THREE.MeshStandardMaterialParameters = {}
): THREE.MeshStandardMaterial {
  return standard({ color, roughness: 0.28, metalness: 1, ...options })
}

export interface GlowOptions extends THREE.MeshStandardMaterialParameters {
  intensity?: number
}

/** Glows. Pair with `createPostFX({ bloom: true })` and it actually blooms. */
export function glow(
  color: ColorLike,
  options: GlowOptions = {}
): THREE.MeshStandardMaterial {
  const { intensity = 1.6, ...rest } = options
  return standard({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.4,
    ...rest,
  })
}

/** Unlit flat colour. Ignores every light, which is exactly what UI, skies,
 *  wireframes and stylised low-poly art usually want. */
export function flat(
  color: ColorLike,
  options: THREE.MeshBasicMaterialParameters = {}
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    ...options,
  })
}

/** Cel shading: banded light instead of a smooth falloff. Instant cartoon. */
export function toon(
  color: ColorLike,
  steps: number = 4,
  options: THREE.MeshToonMaterialParameters = {}
): THREE.MeshToonMaterial {
  const data = new Uint8Array(steps)
  for (let i = 0; i < steps; i++) data[i] = Math.round((i / (steps - 1)) * 255)
  const gradient = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.needsUpdate = true
  return new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: gradient,
    ...options,
  })
}

export function glass(
  color: ColorLike = "#ffffff",
  options: THREE.MeshPhysicalMaterialParameters = {}
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.05,
    metalness: 0,
    transmission: 0.95,
    thickness: 0.5,
    ior: 1.4,
    ...options,
  })
}

export function wireframe(
  color: ColorLike = palette.ember,
  options: THREE.MeshBasicMaterialParameters = {}
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    wireframe: true,
    ...options,
  })
}

export interface OutlineOptions {
  color?: ColorLike
  thickness?: number
}

/**
 * A dark shell drawn on the inside of the geometry, one step larger.
 *
 * The cheapest good-looking outline in three.js — no post-processing pass, no
 * extra render target. Add the returned mesh as a child of the mesh to outline.
 */
export function outline(
  mesh: THREE.Mesh,
  options: OutlineOptions = {}
): THREE.Mesh {
  const { color = "#000000", thickness = 0.04 } = options
  const shell = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  )
  shell.scale.multiplyScalar(1 + thickness)
  shell.castShadow = false
  shell.receiveShadow = false
  mesh.add(shell)
  return shell
}

// --- Procedural textures ----------------------------------------------------

function canvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (ctx) draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Without this a tiled floor turns to mush the moment it recedes.
  texture.anisotropy = 8
  return texture
}

export interface CheckerTextureOptions {
  light?: string
  dark?: string
  squares?: number
  size?: number
}

/** A checkerboard. On a big ground plane it is what makes speed readable. */
export function checkerTexture(
  options: CheckerTextureOptions = {}
): THREE.CanvasTexture {
  const {
    light = "#2a2a2a",
    dark = "#1c1c1c",
    squares = 8,
    size = 512,
  } = options
  return canvasTexture(size, (ctx, s) => {
    const cell = s / squares
    for (let y = 0; y < squares; y++) {
      for (let x = 0; x < squares; x++) {
        ctx.fillStyle = (x + y) % 2 ? dark : light
        ctx.fillRect(x * cell, y * cell, cell, cell)
      }
    }
  })
}

export interface GridTextureOptions {
  background?: string
  line?: string
  divisions?: number
  lineWidth?: number
  size?: number
}

/** Thin bright lines on a dark field — the arcade/synthwave floor. */
export function gridTexture(
  options: GridTextureOptions = {}
): THREE.CanvasTexture {
  const {
    background = "#0a0a0a",
    line = brand.ember,
    divisions = 8,
    lineWidth = 2,
    size = 512,
  } = options
  return canvasTexture(size, (ctx, s) => {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = line
    ctx.lineWidth = lineWidth
    const cell = s / divisions
    for (let i = 0; i <= divisions; i++) {
      ctx.beginPath()
      ctx.moveTo(i * cell, 0)
      ctx.lineTo(i * cell, s)
      ctx.moveTo(0, i * cell)
      ctx.lineTo(s, i * cell)
      ctx.stroke()
    }
  })
}

export interface NoiseTextureOptions {
  size?: number
  scale?: number
  contrast?: number
  tint?: ColorLike
}

/** Value noise — grain for rock, rust, dirt, or a roughness map. */
export function noiseTexture(
  options: NoiseTextureOptions = {}
): THREE.CanvasTexture {
  const { size = 256, scale = 32, contrast = 1, tint = "#ffffff" } = options
  return canvasTexture(size, (ctx, s) => {
    const image = ctx.createImageData(s, s)
    const color = new THREE.Color(tint)
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        // Smoothed cell noise: sample a coarse lattice and blend, so the result
        // reads as a surface rather than television static.
        const n = smoothNoise(x / (s / scale), y / (s / scale))
        const v = THREE.MathUtils.clamp((n - 0.5) * contrast + 0.5, 0, 1)
        const i = (y * s + x) * 4
        image.data[i] = v * color.r * 255
        image.data[i + 1] = v * color.g * 255
        image.data[i + 2] = v * color.b * 255
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  })
}

const noiseSeeds = new Map<number, number>()
function hashNoise(x: number, y: number): number {
  const key = x * 65536 + y
  let value = noiseSeeds.get(key)
  if (value === undefined) {
    value = Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1
    noiseSeeds.set(key, value)
  }
  return value
}

function smoothNoise(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hashNoise(x0, y0)
  const b = hashNoise(x0 + 1, y0)
  const c = hashNoise(x0, y0 + 1)
  const d = hashNoise(x0 + 1, y0 + 1)
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
}

export type GradientStops =
  | Array<[number, string]>
  | Record<string | number, string>
  | string[]

export interface GradientTextureOptions {
  size?: number
}

/** A vertical two- or three-stop ramp. Sky domes, water, health bars. */
export function gradientTexture(
  stops: GradientStops,
  options: GradientTextureOptions = {}
): THREE.CanvasTexture {
  const { size = 256 } = options
  const entries: Array<[number | string, string]> = Array.isArray(stops)
    ? (stops.every((s) => Array.isArray(s))
        ? (stops as Array<[number, string]>)
        : (stops as string[]).map((c, i) => [i / ((stops as string[]).length - 1), c]))
    : (Object.entries(stops) as Array<[string, string]>)

  return canvasTexture(size, (ctx, s) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, s)
    entries.forEach(([offset, color], index) => {
      const numOffset =
        typeof offset === "number"
          ? offset
          : isNaN(Number(offset))
            ? index / (entries.length - 1)
            : Number(offset)
      gradient.addColorStop(numOffset, color)
    })
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, s, s)
  })
}

export interface SparkTextureOptions {
  size?: number
  color?: ColorLike
  softness?: number
}

/** A soft round blob on transparent black. Every particle needs one of these. */
export function sparkTexture(
  options: SparkTextureOptions = {}
): THREE.CanvasTexture {
  const { size = 128, color = "#ffffff", softness = 1 } = options
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    )
    const c = new THREE.Color(color)
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`
    gradient.addColorStop(0, `rgba(${rgb},1)`)
    gradient.addColorStop(0.4 / softness, `rgba(${rgb},0.55)`)
    gradient.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export interface TextTextureOptions {
  color?: string
  background?: string
  font?: string
  padding?: number
}

/**
 * Renders text to a texture, for signs, labels and floating damage numbers.
 * Returns a texture whose canvas is sized to the text's aspect.
 */
export function textTexture(
  text: string,
  options: TextTextureOptions = {}
): THREE.CanvasTexture {
  const {
    color = "#ffffff",
    background = "transparent",
    font = "700 96px ui-sans-serif, system-ui, sans-serif",
    padding = 32,
  } = options
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  let width = 256
  const height = 128 + padding * 2
  if (ctx) {
    ctx.font = font
    width = Math.ceil(ctx.measureText(text).width) + padding * 2
  }
  canvas.width = width
  canvas.height = height

  const draw = canvas.getContext("2d")
  if (draw) {
    if (background !== "transparent") {
      draw.fillStyle = background
      draw.fillRect(0, 0, width, height)
    }
    draw.font = font
    draw.fillStyle = color
    draw.textAlign = "center"
    draw.textBaseline = "middle"
    draw.fillText(text, width / 2, height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * Paints the scene background as a vertical gradient.
 *
 * A flat background colour is the single clearest tell of an unfinished 3D
 * scene; this is one call and fixes it.
 */
export function skyGradient(
  scene: THREE.Scene,
  top: string = "#1b2a4a",
  bottom: string = "#ea580c"
): THREE.CanvasTexture {
  const texture = gradientTexture([
    [0, top],
    [1, bottom],
  ])
  scene.background = texture
  return texture
}

// ============================================================================
// AAA PBR Material Recipes (from shader-cookbook.md)
// ============================================================================

/** Painted metal (car body, ship hull panel) — clearcoat dielectric over reflective body */
export function paintedMetal(options: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  const { color = 0x1f6feb, ...rest } = options
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0.1,
    roughness: 0.45,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.0,
    ...rest,
  })
}

/** Bare brushed metal (steel frame, mechanical joints, weapon barrels) */
export function brushedMetal(options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const { color = 0xaeb4bd, ...rest } = options
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 1.0,
    roughness: 0.38,
    envMapIntensity: 1.1,
    ...rest,
  })
}

/** Rubber & tires — near-black, zero reflection, kills env reflections */
export function rubber(options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const { color = 0x0a0a0b, ...rest } = options
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.0,
    roughness: 0.94,
    envMapIntensity: 0.3,
    ...rest,
  })
}

/** Matte plastic (housings, crates, bumpers) */
export function mattePlastic(options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const { color = 0xd23b3b, ...rest } = options
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    metalness: 0.0,
    roughness: 0.62,
    envMapIntensity: 0.6,
    ...rest,
  })
}

/** Glossy ceramic / polished armor plate */
export function glossyCeramic(options: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  const { color = 0xf5f5f5, ...rest } = options
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0.0,
    roughness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.0,
    ...rest,
  })
}

/** Emissive signal (beacon, pickup core, visor) — dark base feeds intense bloom */
export function emissiveSignal(
  glowColor: THREE.ColorRepresentation = 0x18e0ff,
  intensity: number = 2.5,
  options: THREE.MeshStandardMaterialParameters = {}
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x0c0c0c),
    emissive: new THREE.Color(glowColor),
    emissiveIntensity: intensity,
    metalness: 0.0,
    roughness: 0.4,
    ...options,
  })
}

/** Cloth & fabric with soft edge sheen */
export function cloth(options: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  const { color = 0x3a4a6b, ...rest } = options
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0.0,
    roughness: 0.9,
    sheen: 1.0,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x8899bb),
    envMapIntensity: 0.5,
    ...rest,
  })
}

/** Cheap fake glass — no transmission buffer, fast transparent draw with clearcoat */
export function cheapGlass(options: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  const { color = 0x88ccff, opacity = 0.28, ...rest } = options
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: 0.0,
    roughness: 0.08,
    transparent: true,
    opacity,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.5,
    depthWrite: false,
    ...rest,
  })
}

/** Real refractive glass — uses transmission buffer for hero cockpits and vials */
export function refractiveGlass(options: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    metalness: 0.0,
    roughness: 0.05,
    transmission: 1.0,
    thickness: 0.5,
    ior: 1.5,
    envMapIntensity: 1.0,
    ...options,
  })
}

// ============================================================================
// Procedural Textures & Trim Sheets (from technical-art.md)
// ============================================================================

function createConfiguredCanvasTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

export interface TrimSheetOptions {
  size?: number
  baseColor?: string
  trimColor?: string
  accentColor?: string
  repeat?: [number, number]
}

/** Generates an authored PBR trim sheet with panel bands, bolt rivets, and bevel seams */
export function createTrimSheetTexture(options: TrimSheetOptions = {}): THREE.CanvasTexture {
  const {
    size = 512,
    baseColor = "#1e293b",
    trimColor = "#334155",
    accentColor = "#0284c7",
    repeat = [1, 1],
  } = options

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.fillStyle = baseColor
    ctx.fillRect(0, 0, size, size)

    // Horizontal trim bands
    const bandHeight = size / 8
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? trimColor : baseColor
      ctx.fillRect(0, i * bandHeight, size, bandHeight)

      // Bevel seam highlight and shadow
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)"
      ctx.fillRect(0, i * bandHeight, size, 2)
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)"
      ctx.fillRect(0, (i + 1) * bandHeight - 2, size, 2)

      // Rivets / bolts
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)"
      for (let x = 16; x < size; x += 32) {
        ctx.beginPath()
        ctx.arc(x, i * bandHeight + bandHeight / 2, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Accent warning stripe in center
    ctx.fillStyle = accentColor
    ctx.fillRect(0, size * 0.48, size, size * 0.04)
  }
  return createConfiguredCanvasTexture(canvas, repeat[0], repeat[1])
}

export interface HazardStripesOptions {
  size?: number
  stripeWidth?: number
  colorA?: string
  colorB?: string
  repeat?: [number, number]
}

/** Generates diagonal caution / hazard stripes (e.g. industrial ramps, danger zones) */
export function createHazardStripesTexture(options: HazardStripesOptions = {}): THREE.CanvasTexture {
  const {
    size = 256,
    stripeWidth = 24,
    colorA = "#eab308",
    colorB = "#18181b",
    repeat = [1, 1],
  } = options

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.fillStyle = colorA
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = colorB
    ctx.beginPath()
    const step = stripeWidth * 2
    for (let x = -size; x < size * 2; x += step) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x + stripeWidth, 0)
      ctx.lineTo(x + stripeWidth - size, size)
      ctx.lineTo(x - size, size)
      ctx.closePath()
    }
    ctx.fill()
  }
  return createConfiguredCanvasTexture(canvas, repeat[0], repeat[1])
}

export interface PanelLinesOptions {
  size?: number
  gridCount?: number
  baseColor?: string
  lineColor?: string
  repeat?: [number, number]
}

/** Generates clean sci-fi / structural hull panel lines with recessed seams */
export function createPanelLinesTexture(options: PanelLinesOptions = {}): THREE.CanvasTexture {
  const {
    size = 512,
    gridCount = 8,
    baseColor = "#27272a",
    lineColor = "#09090b",
    repeat = [1, 1],
  } = options

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.fillStyle = baseColor
    ctx.fillRect(0, 0, size, size)

    const step = size / gridCount
    for (let i = 0; i <= gridCount; i++) {
      const pos = i * step
      // Shadow seam
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, size)
      ctx.moveTo(0, pos)
      ctx.lineTo(size, pos)
      ctx.stroke()

      // Light bevel edge
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pos + 2, 0)
      ctx.lineTo(pos + 2, size)
      ctx.moveTo(0, pos + 2)
      ctx.lineTo(size, pos + 2)
      ctx.stroke()
    }
  }
  return createConfiguredCanvasTexture(canvas, repeat[0], repeat[1])
}

export interface StoneTilesOptions {
  size?: number
  cols?: number
  rows?: number
  baseColor?: string
  mortarColor?: string
  repeat?: [number, number]
}

/** Generates medieval stone tiles / dungeon cobblestone courses */
export function createStoneTilesTexture(options: StoneTilesOptions = {}): THREE.CanvasTexture {
  const {
    size = 512,
    cols = 6,
    rows = 10,
    baseColor = "#44403c",
    mortarColor = "#1c1917",
    repeat = [1, 1],
  } = options

  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.fillStyle = mortarColor
    ctx.fillRect(0, 0, size, size)

    const tileW = size / cols
    const tileH = size / rows

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (tileW / 2)
      for (let c = -1; c <= cols; c++) {
        const x = c * tileW + offset + 2
        const y = r * tileH + 2
        const w = tileW - 4
        const h = tileH - 4

        // Stone variation
        const lightnessMod = ((c + r) % 3) * 10
        ctx.fillStyle = shade(baseColor, (lightnessMod - 10) / 100).getStyle()
        ctx.fillRect(x, y, w, h)

        // Stone bevel highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.14)"
        ctx.fillRect(x, y, w, 2)
        ctx.fillRect(x, y, 2, h)

        // Stone bottom shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)"
        ctx.fillRect(x, y + h - 2, w, 2)
        ctx.fillRect(x + w - 2, y, 2, h)
      }
    }
  }
  return createConfiguredCanvasTexture(canvas, repeat[0], repeat[1])
}

export interface NoiseGrainOptions {
  size?: number
  baseColor?: string
  contrast?: number
  repeat?: [number, number]
}

/** Generates procedural surface roughness noise */
export function createNoiseGrainTexture(options: NoiseGrainOptions = {}): THREE.CanvasTexture {
  const { size = 256, baseColor = "#808080", contrast = 0.15, repeat = [1, 1] } = options
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.fillStyle = baseColor
    ctx.fillRect(0, 0, size, size)
    const imgData = ctx.getImageData(0, 0, size, size)
    const data = imgData.data
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 255 * contrast
      data[i] = Math.min(255, Math.max(0, data[i] + noise))
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise))
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise))
    }
    ctx.putImageData(imgData, 0, 0)
  }
  return createConfiguredCanvasTexture(canvas, repeat[0], repeat[1])
}

export const proceduralTextures = {
  trimSheet: createTrimSheetTexture,
  hazardStripes: createHazardStripesTexture,
  panelLines: createPanelLinesTexture,
  stoneTiles: createStoneTilesTexture,
  noiseGrain: createNoiseGrainTexture,
}

// ============================================================================
// onBeforeCompile Shaders & Sky (from shader-cookbook.md)
// ============================================================================

export interface FresnelRimOptions {
  color?: THREE.ColorRepresentation
  power?: number
  strength?: number
}

/** Injects Fresnel rim glow on shields, cloak states, and hero silhouette edges */
export function applyFresnelRim(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  options: FresnelRimOptions = {}
): void {
  const { color = 0x33ccff, power = 3.0, strength = 1.5 } = options
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color) }
    shader.uniforms.uRimPower = { value: power }
    shader.uniforms.uRimStrength = { value: strength }
    shader.fragmentShader =
      "uniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;\n" +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float fres = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), uRimPower);
         totalEmissiveRadiance += uRimColor * fres * uRimStrength;`
      )
  }
  material.customProgramCacheKey = () => "fresnel-rim"
}

export interface ScrollingEmissiveOptions {
  color?: THREE.ColorRepresentation
  speed?: number
  frequency?: number
}

/** Injects animated scrolling emissive bands (energy conduits, boost lanes) */
export function applyScrollingEmissive(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  options: ScrollingEmissiveOptions = {}
): { update: (dt: number) => void } {
  const { color = 0x18e0ff, speed = 0.5, frequency = 6.0 } = options
  let time = 0

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uPanelColor = { value: new THREE.Color(color) }
    material.userData.shader = shader
    shader.vertexShader =
      "varying vec2 vCookUv;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n vCookUv = uv;"
      )
    shader.fragmentShader =
      "uniform float uTime;\nuniform vec3 uPanelColor;\nvarying vec2 vCookUv;\n" +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float scroll = fract(vCookUv.y * ${frequency.toFixed(1)} - uTime * ${speed.toFixed(2)});
         float band = smoothstep(0.46, 0.5, scroll) * smoothstep(0.54, 0.5, scroll);
         totalEmissiveRadiance += uPanelColor * band * 2.0;`
      )
  }
  material.customProgramCacheKey = () => "scroll-emissive"

  return {
    update(dt: number) {
      time += dt
      if (material.userData.shader) {
        material.userData.shader.uniforms.uTime.value = time
      }
    },
  }
}

/** Injects wind sway on foliage, flags, and antennae (tips move most, base stays planted) */
export function applyWindSway(
  material: THREE.Material,
  speed = 1.5,
  amplitude = 0.08
): { update: (dt: number) => void } {
  let time = 0
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    material.userData.shader = shader
    shader.vertexShader =
      "uniform float uTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           float phase = instanceMatrix[3].x + instanceMatrix[3].z;
         #else
           float phase = 0.0;
         #endif
         float h = max(position.y, 0.0);
         transformed.x += sin(uTime * ${speed.toFixed(2)} + phase) * ${amplitude.toFixed(3)} * h;
         transformed.z += cos(uTime * ${(speed * 0.73).toFixed(2)} + phase) * ${(amplitude * 0.62).toFixed(3)} * h;`
      )
  }
  material.customProgramCacheKey = () => "wind-sway"

  return {
    update(dt: number) {
      time += dt
      if (material.userData.shader) {
        material.userData.shader.uniforms.uTime.value = time
      }
    },
  }
}

export interface SkyDomeOptions {
  topColor?: THREE.ColorRepresentation
  horizonColor?: THREE.ColorRepresentation
  sunColor?: THREE.ColorRepresentation
  sunDirection?: THREE.Vector3
  radius?: number
}

/** Gradient sky dome with sun disc and atmospheric halo (cheaper and crisper than cubemaps) */
export function createSkyDome(scene: THREE.Scene, options: SkyDomeOptions = {}): THREE.Mesh {
  const {
    topColor = 0x3a6fb0,
    horizonColor = 0xcfe4f5,
    sunColor = 0xfff2cc,
    sunDirection = new THREE.Vector3(0.4, 0.28, 0.6).normalize(),
    radius = 500,
  } = options

  const uniforms = {
    uTop: { value: new THREE.Color(topColor) },
    uHorizon: { value: new THREE.Color(horizonColor) },
    uSunColor: { value: new THREE.Color(sunColor) },
    uSunDir: { value: sunDirection },
  }

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDir;
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir;
        void main(){
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.6));
          float d = clamp(dot(normalize(vDir), normalize(uSunDir)), 0.0, 1.0);
          col += uSunColor * (pow(d, 800.0) + pow(d, 8.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  )
  sky.frustumCulled = false
  scene.add(sky)
  return sky
}

/**
 * Factory creating a complete cohesive MaterialKit with named shared roles
 * (bodyPrimary, bodySecondary, trim, hazard, reward, shieldBoost, glass,
 * emissiveSignal, groundContact, decalDark, decalLight) as specified by technical art standards.
 */
export function createMaterialKit(options: MaterialKitOptions = {}): MaterialKit {
  const hazardColor = options.hazard ?? palette.orange
  const rewardColor = options.reward ?? palette.yellow
  const shieldColor = options.shieldBoost ?? palette.cyan

  return {
    bodyPrimary: standard({
      color: options.primary ?? palette.slate,
      roughness: 0.45,
      metalness: 0.15,
    }),
    bodySecondary: standard({
      color: options.secondary ?? palette.mist,
      roughness: 0.55,
      metalness: 0.05,
    }),
    trim: brushedMetal({ color: options.trim ?? palette.ember }),
    hazard: standard({
      color: hazardColor,
      roughness: 0.4,
      metalness: 0.1,
      emissive: new THREE.Color(hazardColor).multiplyScalar(0.2),
    }),
    reward: standard({
      color: rewardColor,
      roughness: 0.2,
      metalness: 0.8,
      emissive: new THREE.Color(rewardColor).multiplyScalar(0.35),
    }),
    shieldBoost: standard({
      color: shieldColor,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
      emissive: new THREE.Color(shieldColor).multiplyScalar(0.5),
    }),
    glass: refractiveGlass({ color: options.glass ?? "#d8f0ff", opacity: 0.4 }),
    emissiveSignal: emissiveSignal(options.emissive ?? palette.teal, 2.0),
    groundContact: matte(options.ground ?? "#151713", { roughness: 0.98, metalness: 0 }),
    decalDark: flat("#000000", { transparent: true, opacity: 0.75, depthWrite: false }),
    decalLight: flat("#ffffff", { transparent: true, opacity: 0.85, depthWrite: false }),
  }
}

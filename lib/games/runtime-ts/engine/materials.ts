import * as THREE from "three"
import type { ColorLike } from "./types.js"

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

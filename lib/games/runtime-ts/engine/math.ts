/**
 * Numbers a game needs before it needs anything else.
 *
 * Everything here is framerate-independent where that is possible: a game
 * running at 144Hz and the same game at 30Hz should feel the same, which means
 * no `x += 0.1` per frame anywhere. Pass the frame's `dt` and let these do it.
 */

export const TAU: number = Math.PI * 2
export const DEG: number = Math.PI / 180

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Where `value` sits between `a` and `b`, as 0..1. The inverse of `lerp`. */
export function inverseLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : clamp01((value - a) / (b - a))
}

export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value))
}

/**
 * Exponential smoothing that doesn't change speed with the framerate.
 *
 * The naive `current += (target - current) * 0.1` moves ten times further in a
 * second at 120fps than at 12fps. This is the same easing expressed as a decay
 * per second, so `lambda` reads as "how fast", not "how fast at 60fps".
 * Roughly: lambda 1 is lazy, 8 is snappy, 20 is nearly instant.
 */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number
): number {
  return lerp(target, current, Math.exp(-lambda * dt))
}

/** `damp` for anything with `.lerp` — Vector2/3, Color, Quaternion via slerp. */
export function dampVec<T extends { lerp(target: T, alpha: number): T }>(
  current: T,
  target: T,
  lambda: number,
  dt: number
): T {
  return current.lerp(target, 1 - Math.exp(-lambda * dt))
}

export function dampQuat<T extends { slerp(target: T, alpha: number): T }>(
  current: T,
  target: T,
  lambda: number,
  dt: number
): T {
  return current.slerp(target, 1 - Math.exp(-lambda * dt))
}

/** Walks `current` toward `target` at a fixed speed, never overshooting. */
export function moveTowards(
  current: number,
  target: number,
  maxDelta: number
): number {
  const delta = target - current
  return Math.abs(delta) <= maxDelta
    ? target
    : current + Math.sign(delta) * maxDelta
}

/** Keeps a value inside [min, max) by wrapping — for angles, tiling, looping. */
export function wrap(value: number, min: number, max: number): number {
  const span = max - min
  return min + ((((value - min) % span) + span) % span)
}

/** The shortest way round from angle `a` to angle `b`, in radians. */
export function angleDelta(a: number, b: number): number {
  return wrap(b - a, -Math.PI, Math.PI)
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDelta(a, b) * t
}

export function dampAngle(
  current: number,
  target: number,
  lambda: number,
  dt: number
): number {
  return current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt))
}

/** Kills tiny stick/axis noise so a resting control reads as exactly zero. */
export function deadzone(value: number, threshold: number = 0.15): number {
  if (Math.abs(value) < threshold) return 0
  return Math.sign(value) * ((Math.abs(value) - threshold) / (1 - threshold))
}

export function smoothstep(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

export function pingPong(t: number, length: number = 1): number {
  return length - Math.abs(wrap(t, 0, length * 2) - length)
}

// --- Random -----------------------------------------------------------------

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1))
}

/** Symmetric spread around zero — the shape most jitter and scatter wants. */
export function randSpread(magnitude: number = 1): number {
  return (Math.random() - 0.5) * 2 * magnitude
}

export function chance(probability: number): boolean {
  return Math.random() < probability
}

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

export function shuffle<T>(list: readonly T[]): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export interface RandomSource {
  next: () => number
  range: (min: number, max: number) => number
  int: (min: number, max: number) => number
  spread: (magnitude?: number) => number
  chance: (probability: number) => boolean
  pick: <T>(list: readonly T[]) => T
}

/**
 * A seeded random source, for levels that should be different every run but
 * identical on a replay — mulberry32, small and good enough for games.
 */
export function createRandom(seed: number = 1): RandomSource {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    range: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    spread: (magnitude: number = 1) => (next() - 0.5) * 2 * magnitude,
    chance: (probability: number) => next() < probability,
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
  }
}

// --- Easing -----------------------------------------------------------------

export type EaseFunction = (t: number) => number

/**
 * Curves for `tween` and anything else taking a 0..1 progress.
 *
 * `outBack` and `outElastic` overshoot past 1 — they are what makes a UI pop
 * land instead of arrive, and what a menu or a pickup should almost always use.
 */
export const ease: Record<string, EaseFunction> = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inQuart: (t: number) => t ** 4,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  inExpo: (t: number) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  inBack: (t: number) => 2.70158 * t * t * t - 1.70158 * t * t,
  outElastic: (t: number) =>
    t === 0 || t === 1
      ? t
      : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * TAU) / 3) + 1,
  outBounce: (t: number) => {
    const n = 7.5625
    const d = 2.75
    let current = t
    if (current < 1 / d) return n * current * current
    if (current < 2 / d) return n * (current -= 1.5 / d) * current + 0.75
    if (current < 2.5 / d) return n * (current -= 2.25 / d) * current + 0.9375
    return n * (current -= 2.625 / d) * current + 0.984375
  },
}

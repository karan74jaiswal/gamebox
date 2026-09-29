
export interface Hitbox {
  x: number
  y: number
  z?: number
  radius: number
  damage: number
  baseKnockback: number
  knockbackGrowth: number
  angle: number // radians
  facing?: number // 1 or -1
}

export interface Hurtbox {
  x: number
  y: number
  z?: number
  radius: number
}

export interface KnockbackResult {
  vx: number
  vy: number
  damageDealt: number
}

/**
 * Calculates Smash-style knockback scaling:
 * knockback = baseKnockback + (targetDamagePercent / 10) * knockbackGrowth
 */
export function calculateKnockback(
  hit: Hitbox,
  targetDamagePercent: number,
  facing: number = 1
): KnockbackResult {
  const scaledKb = hit.baseKnockback + (targetDamagePercent / 10) * hit.knockbackGrowth
  const vx = Math.cos(hit.angle) * scaledKb * facing
  const vy = Math.sin(hit.angle) * scaledKb

  return {
    vx,
    vy,
    damageDealt: hit.damage,
  }
}

/**
 * Resolves 2D/3D circular hitbox against hurtbox overlap.
 */
export function checkHit(hit: Hitbox, hurt: Hurtbox): boolean {
  const dx = hit.x - hurt.x
  const dy = hit.y - hurt.y
  const dz = (hit.z ?? 0) - (hurt.z ?? 0)
  const distSq = dx * dx + dy * dy + dz * dz
  const totalR = hit.radius + hurt.radius
  return distSq <= totalR * totalR
}

export type FighterAIDifficulty = "easy" | "medium" | "hard"

export interface FighterAIConfig {
  reactionMs?: number
  attackChance?: number
  smashChance?: number
  approachGap?: number
  recoverEagerness?: number
}

const AI_PRESETS: Record<FighterAIDifficulty, Required<FighterAIConfig>> = {
  easy: { reactionMs: 320, attackChance: 0.45, smashChance: 0.12, approachGap: 1.4, recoverEagerness: 0.5 },
  medium: { reactionMs: 140, attackChance: 0.72, smashChance: 0.28, approachGap: 1.1, recoverEagerness: 0.8 },
  hard: { reactionMs: 60, attackChance: 0.92, smashChance: 0.55, approachGap: 0.9, recoverEagerness: 1.0 },
}

/**
 * Platform fighter AI controller (adapted from kirby-smash).
 * Decides movement, attacks, spacing, and off-stage recovery.
 */
export function createFighterAI(difficulty: FighterAIDifficulty = "medium", customConfig: FighterAIConfig = {}) {
  const config = { ...AI_PRESETS[difficulty], ...customConfig }
  let timer = 0

  return {
    update(
      dt: number,
      selfPos: { x: number; y: number },
      targetPos: { x: number; y: number },
      isOffstage: boolean
    ): { moveX: number; jump: boolean; attack: boolean; smash: boolean } {
      timer -= dt * 1000
      let moveX = 0
      let jump = false
      let attack = false
      let smash = false

      if (timer <= 0) {
        timer = config.reactionMs

        // Recovery takes priority when off-stage
        if (isOffstage) {
          moveX = targetPos.x > selfPos.x ? 1 : -1
          jump = Math.random() < config.recoverEagerness
          return { moveX, jump, attack: false, smash: false }
        }

        const dist = Math.abs(selfPos.x - targetPos.x)
        if (dist > config.approachGap) {
          moveX = targetPos.x > selfPos.x ? 1 : -1
        } else {
          // Within striking distance
          if (Math.random() < config.attackChance) {
            attack = true
            smash = Math.random() < config.smashChance
          } else {
            // Space slightly away
            moveX = targetPos.x > selfPos.x ? -0.5 : 0.5
          }
        }
      }

      return { moveX, jump, attack, smash }
    },
  }
}

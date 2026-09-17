import * as THREE from "three"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { Pass } from "three/addons/postprocessing/Pass.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
import { VignetteShader } from "three/addons/shaders/VignetteShader.js"
import { FXAAShader } from "three/addons/shaders/FXAAShader.js"

import type { Engine, RenderTarget } from "./types.js"

/**
 * The pass that makes a scene look like a game rather than a viewport.
 *
 * Bloom is the one that matters: it is what makes an emissive material read as
 * something glowing rather than something painted bright, and it is why neon,
 * lasers, portals and power-ups look like themselves. Pair it with
 * `materials.glow()` and the two do the work together.
 *
 *   createPostFX(engine, { bloom: { strength: 0.8 } })
 *
 * One caveat worth knowing: post-processing costs a full-screen pass per
 * effect, so on a phone this is the first thing to turn off. The `quality`
 * option does that automatically.
 */

export interface BloomOptions {
  strength?: number
  radius?: number
  threshold?: number
}

export interface VignetteOptions {
  offset?: number
  darkness?: number
}

export interface PostFXOptions {
  bloom?: boolean | BloomOptions
  vignette?: boolean | VignetteOptions
  fxaa?: boolean
  quality?: "auto" | "off" | "on" | string
}

export interface PostFXPasses {
  bloom?: UnrealBloomPass
  vignette?: ShaderPass
  fxaa?: ShaderPass
  [key: string]: Pass | undefined
}

export interface PostFXController {
  enabled: boolean
  composer: EffectComposer | null
  passes: PostFXPasses
  setEnabled?: (value: boolean) => void
  dispose: () => void
}

export function createPostFX(
  engine: Engine,
  options: PostFXOptions = {}
): PostFXController {
  const {
    bloom = true,
    vignette = false,
    fxaa = false,
    quality = "auto",
  } = options

  const isCoarse =
    typeof matchMedia === "function"
      ? matchMedia("(pointer: coarse)").matches
      : false

  if (quality === "off" || (quality === "auto" && isCoarse)) {
    return { enabled: false, composer: null, passes: {}, dispose() {} }
  }

  const { renderer, scene, camera, size } = engine
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.setSize(size.width, size.height)

  const passes: PostFXPasses = {}

  composer.addPass(new RenderPass(scene, camera))

  if (bloom) {
    const config = typeof bloom === "boolean" ? {} : bloom
    const {
      strength = 0.55,
      radius = 0.5,
      threshold = 0.85,
    } = config
    passes.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      strength,
      radius,
      threshold
    )
    composer.addPass(passes.bloom)
  }

  if (vignette) {
    const config = typeof vignette === "boolean" ? {} : vignette
    passes.vignette = new ShaderPass(VignetteShader)
    passes.vignette.uniforms.offset.value = config.offset ?? 1.1
    passes.vignette.uniforms.darkness.value = config.darkness ?? 1.1
    composer.addPass(passes.vignette)
  }

  // Tone mapping and sRGB conversion happen here rather than in the renderer
  // once a composer is in play. Without this pass the whole image comes out
  // washed out and pale — the single most common post-processing bug.
  composer.addPass(new OutputPass())

  if (fxaa) {
    passes.fxaa = new ShaderPass(FXAAShader)
    composer.addPass(passes.fxaa)
  }

  const target: RenderTarget = {
    render: () => composer.render(),
    setSize(width: number, height: number) {
      composer.setSize(width, height)
      passes.bloom?.resolution.set(width, height)
      const ratio = renderer.getPixelRatio()
      passes.fxaa?.material.uniforms.resolution.value.set(
        1 / (width * ratio),
        1 / (height * ratio)
      )
    },
  }
  target.setSize!(size.width, size.height)
  engine.setRenderTarget(target)

  return {
    enabled: true,
    composer,
    passes,
    /** Turn the whole chain off — a quality setting, or a performance panic. */
    setEnabled(value: boolean) {
      engine.setRenderTarget(value ? target : null)
    },
    dispose() {
      engine.setRenderTarget(null)
      composer.dispose()
    },
  }
}

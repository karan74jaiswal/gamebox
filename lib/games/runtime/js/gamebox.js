import * as THREE from 'three';
import { Engine, GameState, ObjectPool } from './engine.js';
import { Controls } from './controls.js';
import { HUD } from './hud.js';
import { Sound } from './sound.js';
import { Models } from './models.js';
import { Animations, Easing, Spring, smoothDampVector3 } from './animations.js';
import { Particles } from './particles.js';
import { AABB, ArcadeBody, SpatialGrid } from './physics.js';
import { Shaders } from './shaders.js';

/**
 * Gamebox 3D Game Generation Toolkit.
 * Unified entrypoint combining Engine, Controls, HUD, Sound, Models, Animations, Particles, Physics & Shaders.
 */
export const Gamebox = {
  THREE,
  Engine,
  GameState,
  ObjectPool,
  Controls,
  HUD,
  Sound,
  Models,
  Animations,
  Easing,
  Spring,
  smoothDampVector3,
  Particles,
  AABB,
  ArcadeBody,
  SpatialGrid,
  Shaders,

  /**
   * One-line game bootstrap helper.
   * Creates an integrated, pre-wired 3D game environment ready for immediate play.
   */
  create(options = {}) {
    const engine = new Engine(options);
    const controls = new Controls(engine, options.controls);
    const hud = options.hud === false ? null : new HUD(engine, {
      title: options.title || 'Gamebox Game',
      subtitle: options.subtitle || 'Built with Gamebox 3D Engine',
      ...(typeof options.hud === 'object' ? options.hud : {}),
    });
    const sound = new Sound(options.sound);
    const models = new Models();
    const animations = new Animations(engine);
    const particles = new Particles(engine);

    // Wire up HUD Sound button to Sound synthesizer
    if (hud) {
      hud.onToggleSound = () => {
        const isMuted = sound.toggleMute();
        const soundIcon = document.getElementById('gb-icon-sound');
        if (soundIcon) {
          soundIcon.style.opacity = isMuted ? '0.35' : '1.0';
        }
      };
    }

    return {
      engine,
      controls,
      hud,
      sound,
      models,
      animations,
      particles,
      scene: engine.scene,
      camera: engine.camera,
      world: engine.world,
      entities: engine.entities,
      start: () => engine.start(),
      stop: () => engine.stop(),
    };
  },
};

// Auto-register to global window object
if (typeof window !== 'undefined') {
  window.Gamebox = Gamebox;
}

export {
  Engine,
  GameState,
  ObjectPool,
  Controls,
  HUD,
  Sound,
  Models,
  Animations,
  Easing,
  Spring,
  smoothDampVector3,
  Particles,
  AABB,
  ArcadeBody,
  SpatialGrid,
  Shaders,
};

export default Gamebox;

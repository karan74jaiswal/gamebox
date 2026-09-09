import * as THREE from 'three';

/**
 * Procedural Motion, Spring Physics, Tweening System & Skeletal Animation Helpers.
 */

// Easing Library
export const Easing = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

/**
 * 2nd-order damped spring for juicy bounciness.
 */
export class Spring {
  constructor(stiffness = 180, damping = 14) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.position = 0;
    this.velocity = 0;
    this.target = 0;
  }

  update(dt) {
    const force = -this.stiffness * (this.position - this.target);
    const dampingForce = -this.damping * this.velocity;
    this.velocity += (force + dampingForce) * dt;
    this.position += this.velocity * dt;
    return this.position;
  }

  set(val) {
    this.position = val;
    this.target = val;
    this.velocity = 0;
  }
}

/**
 * Smooth Damp algorithm for butter-smooth camera and entity following.
 */
export function smoothDampVector3(current, target, velocity, smoothTime, dt) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

  const change = current.clone().sub(target);
  const temp = velocity.clone().add(change.clone().multiplyScalar(omega)).multiplyScalar(dt);

  velocity.sub(temp.clone().multiplyScalar(omega)).multiplyScalar(exp);
  return target.clone().add(change.add(temp).multiplyScalar(exp));
}

/**
 * Master Animation Manager.
 */
export class Animations {
  constructor(engine) {
    this.engine = engine;
    this.tweens = [];
    this.activeMixers = [];
    this.walkPhases = new Map();

    if (engine) {
      engine.onUpdate((dt, elapsed) => this.update(dt, elapsed));
    }
  }

  update(dt, elapsed) {
    // 1. Update Tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      tween.elapsed += dt;
      const progress = Math.min(1, tween.elapsed / tween.duration);
      const easeVal = tween.ease(progress);

      for (const prop in tween.props) {
        const start = tween.startValues[prop];
        const end = tween.props[prop];

        if (typeof start === 'number') {
          tween.target[prop] = start + (end - start) * easeVal;
        } else if (start instanceof THREE.Vector3) {
          tween.target[prop].lerpVectors(start, end, easeVal);
        }
      }

      if (tween.onUpdate) tween.onUpdate(progress, easeVal);

      if (progress >= 1) {
        if (tween.onComplete) tween.onComplete();
        this.tweens.splice(i, 1);
      }
    }

    // 2. Update Skeletal AnimationMixers
    for (let i = 0; i < this.activeMixers.length; i++) {
      this.activeMixers[i].update(dt);
    }
  }

  /**
   * Lightweight Tween: animates properties of target over duration.
   */
  to(target, props, duration = 0.5, options = {}) {
    const easeFn = typeof options.ease === 'string' ? Easing[options.ease] || Easing.easeOutQuad : (options.ease || Easing.easeOutQuad);

    const startValues = {};
    for (const prop in props) {
      if (typeof target[prop] === 'number') {
        startValues[prop] = target[prop];
      } else if (target[prop] instanceof THREE.Vector3) {
        startValues[prop] = target[prop].clone();
      }
    }

    const tween = {
      target,
      props,
      duration,
      elapsed: 0,
      ease: easeFn,
      startValues,
      onUpdate: options.onUpdate,
      onComplete: options.onComplete,
    };

    this.tweens.push(tween);
    return tween;
  }

  /**
   * Squash and Stretch juice effect on jump, land, or impact.
   */
  squashAndStretch(mesh, factor = 0.35, duration = 0.3) {
    const origScale = mesh.scale.clone();
    const squashScale = new THREE.Vector3(
      origScale.x * (1 + factor),
      origScale.y * (1 - factor),
      origScale.z * (1 + factor)
    );

    this.to(mesh.scale, { x: squashScale.x, y: squashScale.y, z: squashScale.z }, duration * 0.4, {
      ease: Easing.easeOutQuad,
      onComplete: () => {
        this.to(mesh.scale, { x: origScale.x, y: origScale.y, z: origScale.z }, duration * 0.6, {
          ease: Easing.easeOutElastic,
        });
      },
    });
  }

  /**
   * Entity damage shake wobble / hit recoil.
   */
  shake(mesh, intensity = 0.15, duration = 0.25) {
    const origRot = mesh.rotation.clone();
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += 0.016;
      if (elapsed >= duration) {
        mesh.rotation.copy(origRot);
        clearInterval(interval);
        return;
      }
      const progress = 1 - elapsed / duration;
      mesh.rotation.z = origRot.z + (Math.random() - 0.5) * intensity * progress;
      mesh.rotation.x = origRot.x + (Math.random() - 0.5) * intensity * progress;
    }, 16);
  }

  /**
   * Smoothly rotates mesh towards target position on the Y axis.
   */
  lookAtSmooth(mesh, targetPos, speed = 10, dt = 0.016) {
    const dir = targetPos.clone().sub(mesh.position);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) return;
    const targetAngle = Math.atan2(dir.x, dir.z);
    let diff = targetAngle - mesh.rotation.y;

    // Normalize angle to [-PI, PI]
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    mesh.rotation.y += diff * Math.min(1, speed * dt);
  }

  bob(mesh, options = {}) {
    const speed = options.speed || 2.5;
    const height = options.height || 0.25;
    const basePosY = options.baseY !== undefined ? options.baseY : mesh.position.y;
    const timeOffset = options.offset || 0;

    return (elapsed) => {
      mesh.position.y = basePosY + Math.sin(elapsed * speed + timeOffset) * height;
    };
  }

  spin(mesh, options = {}) {
    const rx = options.x || 0;
    const ry = options.y || 1.5;
    const rz = options.z || 0;

    return (dt) => {
      mesh.rotation.x += rx * dt;
      mesh.rotation.y += ry * dt;
      mesh.rotation.z += rz * dt;
    };
  }

  pulse(mesh, options = {}) {
    const minScale = options.min || 0.9;
    const maxScale = options.max || 1.1;
    const speed = options.speed || 3.0;

    return (elapsed) => {
      const s = minScale + (Math.sin(elapsed * speed) * 0.5 + 0.5) * (maxScale - minScale);
      mesh.scale.set(s, s, s);
    };
  }

  walkCycle(characterRoot, speed = 0, dt = 0.016) {
    if (!characterRoot || !characterRoot.limbs) return;
    const limbs = characterRoot.limbs;

    if (!this.walkPhases.has(characterRoot)) {
      this.walkPhases.set(characterRoot, 0);
    }

    let phase = this.walkPhases.get(characterRoot);

    if (speed > 0.05) {
      phase += speed * dt * 10;
      this.walkPhases.set(characterRoot, phase);

      const armSwing = Math.sin(phase) * 0.65;
      const legSwing = Math.sin(phase) * 0.75;

      limbs.leftArm.rotation.x = -armSwing;
      limbs.rightArm.rotation.x = armSwing;
      limbs.leftLeg.rotation.x = legSwing;
      limbs.rightLeg.rotation.x = -legSwing;

      limbs.torso.position.y = 1.35 + Math.abs(Math.sin(phase * 2)) * 0.08;
    } else {
      limbs.leftArm.rotation.x *= 0.85;
      limbs.rightArm.rotation.x *= 0.85;
      limbs.leftLeg.rotation.x *= 0.85;
      limbs.rightLeg.rotation.x *= 0.85;
      limbs.torso.position.y = 1.35;
    }
  }

  createMixer(root) {
    const mixer = new THREE.AnimationMixer(root);
    this.activeMixers.push(mixer);
    return mixer;
  }
}

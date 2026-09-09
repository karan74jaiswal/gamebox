import * as THREE from 'three';

/**
 * GPU-Friendly Particle Systems & Visual Effects.
 * Handles glowing explosions, sparks, jet plumes, ambient motes, confetti, and shockwaves.
 */
export class Particles {
  constructor(engine) {
    this.engine = engine;
    this.container = engine ? engine.particles : new THREE.Group();
    this.activeEmitters = [];
    this.defaultGlowTexture = this._createGlowTexture();

    if (engine) {
      engine.onUpdate((dt) => this.update(dt));
    }
  }

  _createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(canvas);
  }

  update(dt) {
    for (let i = this.activeEmitters.length - 1; i >= 0; i--) {
      const emitter = this.activeEmitters[i];
      emitter.update(dt);
      if (emitter.isDead) {
        this.container.remove(emitter.mesh);
        emitter.dispose();
        this.activeEmitters.splice(i, 1);
      }
    }
  }

  /**
   * Spawns an arcade fiery burst explosion with soft glowing radial particles.
   */
  explode(position, options = {}) {
    const count = options.count || 35;
    const color = options.color || 0xea580c; // Gamebox orange
    const secondaryColor = options.secondaryColor || 0xfbbf24; // Amber
    const speed = options.speed || 8;
    const duration = options.duration || 0.6;
    const size = options.size || 0.45;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];

    const col1 = new THREE.Color(color);
    const col2 = new THREE.Color(secondaryColor);

    const origin = position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
      ).multiplyScalar(speed * (0.4 + Math.random() * 0.8));

      velocities.push(vel);

      const c = col1.clone().lerp(col2, Math.random());
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: size,
      map: this.defaultGlowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.container.add(points);

    let elapsed = 0;
    const emitter = {
      mesh: points,
      isDead: false,
      update: (dt) => {
        elapsed += dt;
        const progress = elapsed / duration;
        if (progress >= 1) {
          emitter.isDead = true;
          return;
        }

        const posAttr = geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          const v = velocities[i];
          posAttr.setXYZ(
            i,
            posAttr.getX(i) + v.x * dt,
            posAttr.getY(i) + v.y * dt,
            posAttr.getZ(i) + v.z * dt
          );
          v.multiplyScalar(Math.pow(0.1, dt));
        }
        posAttr.needsUpdate = true;
        material.opacity = 1.0 - Math.pow(progress, 2);
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };

    this.activeEmitters.push(emitter);
    return emitter;
  }

  /**
   * Spawns directional impact sparks with gravity.
   */
  sparks(position, direction, options = {}) {
    const count = options.count || 18;
    const color = options.color || 0xfef08a;
    const speed = options.speed || 10;
    const duration = options.duration || 0.35;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    const origin = position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position);
    const normal = direction ? direction.clone().normalize() : new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;

      const randDir = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5
      );
      const vel = normal.clone().add(randDir).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      velocities.push(vel);
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: color,
      map: this.defaultGlowTexture,
      size: 0.25,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.container.add(points);

    let elapsed = 0;
    const emitter = {
      mesh: points,
      isDead: false,
      update: (dt) => {
        elapsed += dt;
        const progress = elapsed / duration;
        if (progress >= 1) {
          emitter.isDead = true;
          return;
        }

        const posAttr = geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          const v = velocities[i];
          v.y -= 18 * dt;
          posAttr.setXYZ(
            i,
            posAttr.getX(i) + v.x * dt,
            posAttr.getY(i) + v.y * dt,
            posAttr.getZ(i) + v.z * dt
          );
        }
        posAttr.needsUpdate = true;
        material.opacity = 1.0 - progress;
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };

    this.activeEmitters.push(emitter);
    return emitter;
  }

  /**
   * Spawns an attached jet / rocket thruster plume behind a moving object.
   */
  thrusterPlume(targetMesh, localOffset = new THREE.Vector3(0, 0, 1.5), options = {}) {
    const color = options.color || 0x06b6d4; // Cyan glow
    return () => {
      const worldPos = targetMesh.position.clone().add(
        localOffset.clone().applyQuaternion(targetMesh.quaternion)
      );
      this.sparks(worldPos, new THREE.Vector3(0, 0, 1).applyQuaternion(targetMesh.quaternion), {
        count: 3,
        color: color,
        speed: 3,
        duration: 0.2,
      });
    };
  }

  /**
   * Spawns celebratory flutter confetti.
   */
  confetti(position, options = {}) {
    const count = options.count || 60;
    const duration = options.duration || 2.5;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];

    const origin = position instanceof THREE.Vector3 ? position : new THREE.Vector3(0, 5, 0);
    const palette = [0xea580c, 0x38bdf8, 0x22c55e, 0xfacc15, 0xec4899, 0xa855f7];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 2;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 4;

      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        1 + Math.random() * 4,
        (Math.random() - 0.5) * 3
      ));

      const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.32,
      map: this.defaultGlowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.container.add(points);

    let elapsed = 0;
    const emitter = {
      mesh: points,
      isDead: false,
      update: (dt) => {
        elapsed += dt;
        const progress = elapsed / duration;
        if (progress >= 1) {
          emitter.isDead = true;
          return;
        }

        const posAttr = geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          const v = velocities[i];
          v.y -= 4 * dt;
          v.x += Math.sin(elapsed * 4 + i) * 0.5 * dt;

          posAttr.setXYZ(
            i,
            posAttr.getX(i) + v.x * dt,
            posAttr.getY(i) + v.y * dt,
            posAttr.getZ(i) + v.z * dt
          );
        }
        posAttr.needsUpdate = true;
        material.opacity = Math.min(1.0, (1.0 - progress) * 1.5);
      },
      dispose: () => {
        geometry.dispose();
        material.dispose();
      },
    };

    this.activeEmitters.push(emitter);
    return emitter;
  }

  /**
   * Spawns an expanding ground shockwave ring.
   */
  shockwave(position, options = {}) {
    const maxRadius = options.radius || 4;
    const color = options.color || 0xea580c;
    const duration = options.duration || 0.45;

    const ringGeo = new THREE.RingGeometry(0.1, 0.3, 32);
    ringGeo.rotateX(-Math.PI / 2);

    const ringMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const ring = new THREE.Mesh(ringGeo, ringMat);
    const origin = position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position);
    ring.position.copy(origin);
    ring.position.y += 0.05;

    this.container.add(ring);

    let elapsed = 0;
    const emitter = {
      mesh: ring,
      isDead: false,
      update: (dt) => {
        elapsed += dt;
        const progress = elapsed / duration;
        if (progress >= 1) {
          emitter.isDead = true;
          return;
        }

        const currentRadius = 0.5 + progress * (maxRadius - 0.5);
        ring.scale.set(currentRadius, currentRadius, currentRadius);
        ringMat.opacity = (1.0 - progress) * 0.9;
      },
      dispose: () => {
        ringGeo.dispose();
        ringMat.dispose();
      },
    };

    this.activeEmitters.push(emitter);
    return emitter;
  }
}

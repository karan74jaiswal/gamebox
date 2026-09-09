import * as THREE from 'three';

/**
 * Lightweight 3D Arcade Physics & Collision System.
 * Eliminates heavy WASM bloat with fast, robust AABB/Sphere collision, gravity, jumping, and ground clamping.
 */

/**
 * Axis-Aligned Bounding Box
 */
export class AABB {
  constructor(min = new THREE.Vector3(), max = new THREE.Vector3()) {
    this.min = min.clone();
    this.max = max.clone();
  }

  setFromCenterAndSize(center, size) {
    const half = size.clone().multiplyScalar(0.5);
    this.min.copy(center).sub(half);
    this.max.copy(center).add(half);
    return this;
  }

  setFromMesh(mesh) {
    const box = new THREE.Box3().setFromObject(mesh);
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }

  intersectsAABB(other) {
    return (
      this.min.x <= other.max.x && this.max.x >= other.min.x &&
      this.min.y <= other.max.y && this.max.y >= other.min.y &&
      this.min.z <= other.max.z && this.max.z >= other.min.z
    );
  }

  intersectsSphere(center, radius) {
    let dmin = 0;
    const c = [center.x, center.y, center.z];
    const bmin = [this.min.x, this.min.y, this.min.z];
    const bmax = [this.max.x, this.max.y, this.max.z];

    for (let i = 0; i < 3; i++) {
      if (c[i] < bmin[i]) dmin += Math.pow(c[i] - bmin[i], 2);
      else if (c[i] > bmax[i]) dmin += Math.pow(c[i] - bmax[i], 2);
    }
    return dmin <= radius * radius;
  }
}

/**
 * Physics Body for arcade characters, enemies, and projectiles.
 */
export class ArcadeBody {
  constructor(mesh, options = {}) {
    this.mesh = mesh;
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this.gravity = options.gravity !== undefined ? options.gravity : -25;
    this.drag = options.drag || 0.96;
    this.groundDrag = options.groundDrag || 0.82;
    this.bounce = options.bounce || 0.0;
    this.useGravity = options.useGravity !== false;

    // Collider shape: 'box' or 'sphere'
    this.colliderType = options.colliderType || 'box';
    this.size = options.size || new THREE.Vector3(1, 2, 1);
    this.radius = options.radius || 0.6;

    this.onGround = false;
    this.aabb = new AABB();
    this.updateCollider();
  }

  updateCollider() {
    if (this.colliderType === 'box') {
      const center = this.mesh.position.clone();
      center.y += this.size.y * 0.5;
      this.aabb.setFromCenterAndSize(center, this.size);
    }
  }

  applyForce(vec) {
    this.acceleration.add(vec);
  }

  applyImpulse(vec) {
    this.velocity.add(vec);
  }

  jump(force = 12) {
    if (this.onGround) {
      this.velocity.y = force;
      this.onGround = false;
      return true;
    }
    return false;
  }

  collideWithGround(groundY = 0) {
    if (this.mesh.position.y <= groundY) {
      this.mesh.position.y = groundY;
      if (this.velocity.y < 0) {
        if (this.bounce > 0.05 && Math.abs(this.velocity.y) > 2) {
          this.velocity.y = -this.velocity.y * this.bounce;
        } else {
          this.velocity.y = 0;
          this.onGround = true;
        }
      }
    } else {
      this.onGround = false;
    }
  }

  update(dt) {
    if (this.useGravity && !this.onGround) {
      this.velocity.y += this.gravity * dt;
    }

    this.velocity.addScaledVector(this.acceleration, dt);
    this.acceleration.set(0, 0, 0);

    // Apply horizontal drag
    const currentDrag = this.onGround ? this.groundDrag : this.drag;
    this.velocity.x *= Math.pow(currentDrag, dt * 60);
    this.velocity.z *= Math.pow(currentDrag, dt * 60);

    // Move mesh
    this.mesh.position.addScaledVector(this.velocity, dt);

    this.updateCollider();
  }

  /**
   * Fast collision detection between two bodies with optional separation impulse.
   */
  intersects(other, separate = false) {
    let hit = false;

    if (this.colliderType === 'box' && other.colliderType === 'box') {
      hit = this.aabb.intersectsAABB(other.aabb);
    } else if (this.colliderType === 'sphere' && other.colliderType === 'sphere') {
      const distSq = this.mesh.position.distanceToSquared(other.mesh.position);
      const radSum = this.radius + other.radius;
      hit = distSq <= radSum * radSum;
    } else {
      // Sphere vs Box
      const sphere = this.colliderType === 'sphere' ? this : other;
      const box = this.colliderType === 'box' ? this : other;
      hit = box.aabb.intersectsSphere(sphere.mesh.position, sphere.radius);
    }

    if (hit && separate) {
      // Push apart along horizontal plane
      const delta = this.mesh.position.clone().sub(other.mesh.position);
      delta.y = 0;
      const dist = delta.length();
      if (dist > 0.001) {
        const overlap = (this.radius + other.radius) - dist;
        if (overlap > 0) {
          delta.normalize().multiplyScalar(overlap * 0.5);
          this.mesh.position.add(delta);
          other.mesh.position.sub(delta);
        }
      }
    }

    return hit;
  }
}

/**
 * Spatial Grid Hash to avoid O(N^2) collision overhead in games with many entities.
 */
export class SpatialGrid {
  constructor(cellSize = 6) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  _hash(x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx}:${cz}`;
  }

  clear() {
    this.cells.clear();
  }

  insert(entity, pos) {
    const key = this._hash(pos.x, pos.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key).push(entity);
  }

  getNearby(pos) {
    const cx = Math.floor(pos.x / this.cellSize);
    const cz = Math.floor(pos.z / this.cellSize);
    const results = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx}:${cz + dz}`;
        if (this.cells.has(key)) {
          const bucket = this.cells.get(key);
          for (let i = 0; i < bucket.length; i++) {
            results.push(bucket[i]);
          }
        }
      }
    }
    return results;
  }
}

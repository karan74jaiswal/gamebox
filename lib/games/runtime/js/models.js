import * as THREE from 'three';

/**
 * Procedural 3D Mesh Builders, Material Presets, Instanced Rendering & Asset Loaders.
 * Enables instant creation of characters, vehicles, arenas, particle sprites, skyboxes, and GLTF models.
 */
export class Models {
  constructor() {
    this.materialCache = new Map();
    this.modelCache = new Map();
    this.textureCache = new Map();
  }

  /**
   * Generates a circular radial soft glow texture dynamically using HTML5 Canvas.
   * Eliminates square point particles and gives glowing embers, lights, and bullets smooth visuals.
   */
  createGlowTexture(color = '#ffffff', size = 64) {
    const key = `glow_${color}_${size}`;
    if (this.textureCache.has(key)) return this.textureCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    this.textureCache.set(key, texture);
    return texture;
  }

  /**
   * Material Presets Library: 'neon', 'metal', 'plastic', 'glass', 'toon', 'carPaint', 'grid'
   */
  getMaterial(preset = 'plastic', color = 0xea580c, options = {}) {
    const colorHex = typeof color === 'string' ? color : `#${color.toString(16).padStart(6, '0')}`;
    const cacheKey = `${preset}_${colorHex}_${JSON.stringify(options)}`;

    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey);
    }

    let mat;
    if (preset === 'neon') {
      mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: options.intensity || 1.8,
        roughness: 0.2,
        metalness: 0.1,
        ...options,
      });
    } else if (preset === 'metal') {
      mat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: options.metalness || 0.85,
        roughness: options.roughness || 0.2,
        ...options,
      });
    } else if (preset === 'carPaint') {
      mat = new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0.9,
        roughness: 0.35,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        ...options,
      });
    } else if (preset === 'glass') {
      mat = new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0,
        roughness: 0.05,
        transmission: 0.9,
        thickness: 0.5,
        transparent: true,
        opacity: 0.85,
        ...options,
      });
    } else if (preset === 'toon') {
      mat = new THREE.MeshToonMaterial({
        color: color,
        ...options,
      });
    } else if (preset === 'grid') {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = options.bg || '#09090b';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = options.gridColor || '#ea580c';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, 128, 128);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(options.repeat || 20, options.repeat || 20);

      mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.7,
        metalness: 0.2,
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.35,
        metalness: 0.15,
        ...options,
      });
    }

    this.materialCache.set(cacheKey, mat);
    return mat;
  }

  // =========================================================================
  // Instanced Rendering (From threejs-geometry skill)
  // =========================================================================

  /**
   * Renders hundreds or thousands of instances (trees, asteroids, coins, bullets) with 1 draw call.
   */
  createInstancedField(geometry, material, count, transformFn) {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      if (transformFn) transformFn(dummy, i);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  // =========================================================================
  // Procedural Entity & Level Generators
  // =========================================================================

  /**
   * Generates an articulated low-poly robot/humanoid character with movable limbs.
   */
  createCharacter(options = {}) {
    const primaryColor = options.color || 0xea580c; // Gamebox orange
    const secondaryColor = options.accentColor || 0x27272a; // dark zinc
    const visorColor = options.visorColor || 0x38bdf8; // cyan glow

    const root = new THREE.Group();
    root.name = 'character';

    // Materials
    const bodyMat = this.getMaterial('plastic', primaryColor);
    const darkMat = this.getMaterial('plastic', secondaryColor);
    const visorMat = this.getMaterial('neon', visorColor, { intensity: 2.0 });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.8, 0.9, 0.5);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    torso.receiveShadow = true;
    root.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, 0.75, 0);
    head.castShadow = true;
    torso.add(head);

    // Visor (glowing face strip)
    const visorGeo = new THREE.BoxGeometry(0.42, 0.15, 0.1);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.05, 0.26);
    head.add(visor);

    // Arms with shoulder pivot points
    const armGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    armGeo.translate(0, -0.3, 0); // shift origin to shoulder

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.52, 0.35, 0);
    const leftArm = new THREE.Mesh(armGeo, darkMat);
    leftArm.castShadow = true;
    leftArmPivot.add(leftArm);
    torso.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.52, 0.35, 0);
    const rightArm = new THREE.Mesh(armGeo, darkMat);
    rightArm.castShadow = true;
    rightArmPivot.add(rightArm);
    torso.add(rightArmPivot);

    // Optional Weapon Attachment on right hand
    if (options.hasWeapon) {
      const weaponGeo = new THREE.BoxGeometry(0.12, 0.15, 0.6);
      const weapon = new THREE.Mesh(weaponGeo, this.getMaterial('metal', 0x71717a));
      weapon.position.set(0, -0.65, 0.25);
      rightArmPivot.add(weapon);
    }

    // Legs with hip pivot points
    const legGeo = new THREE.BoxGeometry(0.26, 0.8, 0.28);
    legGeo.translate(0, -0.4, 0); // shift origin to hip

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.25, -0.45, 0);
    const leftLeg = new THREE.Mesh(legGeo, darkMat);
    leftLeg.castShadow = true;
    leftLegPivot.add(leftLeg);
    torso.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.25, -0.45, 0);
    const rightLeg = new THREE.Mesh(legGeo, darkMat);
    rightLeg.castShadow = true;
    rightLegPivot.add(rightLeg);
    torso.add(rightLegPivot);

    root.limbs = {
      torso,
      head,
      leftArm: leftArmPivot,
      rightArm: rightArmPivot,
      leftLeg: leftLegPivot,
      rightLeg: rightLegPivot,
    };

    return root;
  }

  /**
   * Generates a sleek sci-fi spaceship fighter.
   */
  createSpaceship(options = {}) {
    const ship = new THREE.Group();
    ship.name = 'spaceship';

    const hullMat = this.getMaterial('metal', options.color || 0xea580c);
    const accentMat = this.getMaterial('plastic', options.accentColor || 0x18181b);
    const glassMat = this.getMaterial('glass', 0x38bdf8);
    const thrusterMat = this.getMaterial('neon', 0x06b6d4, { intensity: 3.0 });

    // Fuselage
    const bodyGeo = new THREE.ConeGeometry(0.8, 3.2, 5);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, hullMat);
    body.scale.set(1, 0.5, 1);
    body.castShadow = true;
    ship.add(body);

    // Cockpit
    const cockpitGeo = new THREE.SphereGeometry(0.35, 16, 12);
    cockpitGeo.scale(0.8, 0.6, 1.8);
    const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
    cockpit.position.set(0, 0.25, -0.2);
    ship.add(cockpit);

    // Swept delta wings
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(2.2, 1.2);
    wingShape.lineTo(2.0, 1.8);
    wingShape.lineTo(0, 1.0);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);
    wingGeo.center();

    const leftWing = new THREE.Mesh(wingGeo, hullMat);
    leftWing.position.set(-1.1, 0, 0.4);
    leftWing.castShadow = true;
    ship.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, hullMat);
    rightWing.position.set(1.1, 0, 0.4);
    rightWing.scale.set(-1, 1, 1);
    rightWing.castShadow = true;
    ship.add(rightWing);

    // Twin Wing-mounted Plasma Cannons
    const cannonGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
    cannonGeo.rotateX(Math.PI / 2);
    const leftCannon = new THREE.Mesh(cannonGeo, accentMat);
    leftCannon.position.set(-1.8, 0, -0.2);
    ship.add(leftCannon);

    const rightCannon = new THREE.Mesh(cannonGeo, accentMat);
    rightCannon.position.set(1.8, 0, -0.2);
    ship.add(rightCannon);

    // Glowing Thrusters
    const thrusterGeo = new THREE.CylinderGeometry(0.18, 0.12, 0.4, 12);
    thrusterGeo.rotateX(Math.PI / 2);
    const thrusterL = new THREE.Mesh(thrusterGeo, thrusterMat);
    thrusterL.position.set(-0.35, 0, 1.6);
    ship.add(thrusterL);

    const thrusterR = new THREE.Mesh(thrusterGeo, thrusterMat);
    thrusterR.position.set(0.35, 0, 1.6);
    ship.add(thrusterR);

    return ship;
  }

  /**
   * Generates an arcade racecar with rotating wheel references.
   */
  createCar(options = {}) {
    const car = new THREE.Group();
    car.name = 'car';

    const bodyMat = this.getMaterial('carPaint', options.color || 0xea580c);
    const cabinMat = this.getMaterial('glass', 0x18181b);
    const wheelMat = this.getMaterial('plastic', 0x111827);
    const rimMat = this.getMaterial('metal', 0xd4d4d8);
    const lightMat = this.getMaterial('neon', 0xffffff, { intensity: 2.5 });

    // Chassis
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.5, 3.6);
    const chassis = new THREE.Mesh(chassisGeo, bodyMat);
    chassis.position.y = 0.55;
    chassis.castShadow = true;
    car.add(chassis);

    // Cabin / Roof
    const cabinGeo = new THREE.BoxGeometry(1.4, 0.5, 1.8);
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.95, -0.1);
    cabin.castShadow = true;
    car.add(cabin);

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.35, 0.15, 0.1);
    const lightL = new THREE.Mesh(lightGeo, lightMat);
    lightL.position.set(-0.6, 0.55, 1.81);
    car.add(lightL);

    const lightR = new THREE.Mesh(lightGeo, lightMat);
    lightR.position.set(0.6, 0.55, 1.81);
    car.add(lightR);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheels = [];
    const wheelPositions = [
      [-0.95, 0.38, 1.1],
      [0.95, 0.38, 1.1],
      [-0.95, 0.38, -1.1],
      [0.95, 0.38, -1.1],
    ];

    wheelPositions.forEach(([x, y, z]) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(x, y, z);
      const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wheelMesh.castShadow = true;
      wheelGroup.add(wheelMesh);

      // Rim
      const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8);
      rimGeo.rotateZ(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      wheelGroup.add(rimMesh);

      car.add(wheelGroup);
      wheels.push(wheelGroup);
    });

    car.wheels = wheels;
    return car;
  }

  /**
   * Generates a complete 3D Arena with grid floor and perimeter boundary walls.
   */
  createArena(options = {}) {
    const size = options.size || 50;
    const wallHeight = options.wallHeight || 3;
    const arena = new THREE.Group();
    arena.name = 'arena';

    const floorMat = this.getMaterial('grid', options.floorColor || 0x09090b, {
      gridColor: options.gridColor || 0xea580c,
      repeat: Math.floor(size / 2.5),
    });

    const floorGeo = new THREE.PlaneGeometry(size, size);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    arena.add(floor);

    const wallMat = this.getMaterial('plastic', options.wallColor || 0x18181b);
    const half = size / 2;
    const wallThickness = 0.8;

    const createWall = (w, h, d, x, y, z) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      arena.add(mesh);
      return mesh;
    };

    arena.walls = [
      createWall(size, wallHeight, wallThickness, 0, wallHeight / 2, -half),
      createWall(size, wallHeight, wallThickness, 0, wallHeight / 2, half),
      createWall(wallThickness, wallHeight, size, -half, wallHeight / 2, 0),
      createWall(wallThickness, wallHeight, size, half, wallHeight / 2, 0),
    ];

    return arena;
  }

  /**
   * Generates an atmospheric Sky Dome.
   */
  createSkyDome(topColor = 0x09090b, bottomColor = 0x1e1b4b, radius = 400) {
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `;

    const uniforms = {
      topColor: { value: new THREE.Color(topColor) },
      bottomColor: { value: new THREE.Color(bottomColor) },
      offset: { value: 33 },
      exponent: { value: 0.6 },
    };

    const skyGeo = new THREE.SphereGeometry(radius, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.BackSide,
    });

    return new THREE.Mesh(skyGeo, skyMat);
  }

  /**
   * Generates a 3D Starfield Galaxy background.
   */
  createStarfield(count = 600, radius = 250) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = radius * (0.8 + Math.random() * 0.2);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0.8,
    });

    return new THREE.Points(geo, mat);
  }

  /**
   * Generates an extruded 3D Race Track / Tube path from 3D control points.
   */
  createTrack(points, options = {}) {
    const curve = new THREE.CatmullRomCurve3(points, options.closed !== false);
    const tubularSegments = options.segments || 120;
    const radius = options.radius || 2.5;
    const radialSegments = options.radialSegments || 12;

    const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, options.closed !== false);
    const mat = this.getMaterial('metal', options.color || 0x27272a);
    const track = new THREE.Mesh(geo, mat);
    track.receiveShadow = true;
    return track;
  }

  /**
   * Generates a fast fake ground shadow decal beneath floating characters.
   */
  createBlobShadow(radius = 0.6) {
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    geo.rotateX(-Math.PI / 2);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(geo, mat);
    shadow.position.y = 0.02;
    return shadow;
  }

  createCoin(options = {}) {
    const radius = options.radius || 0.5;
    const coin = new THREE.Group();
    coin.name = 'coin';

    const goldMat = this.getMaterial('metal', options.color || 0xf59e0b, {
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0xd97706,
      emissiveIntensity: 0.2,
    });

    const coinGeo = new THREE.CylinderGeometry(radius, radius, 0.12, 24);
    coinGeo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(coinGeo, goldMat);
    mesh.castShadow = true;
    coin.add(mesh);

    const starGeo = new THREE.OctahedronGeometry(radius * 0.45, 0);
    starGeo.scale(1, 1, 0.3);
    const star = new THREE.Mesh(starGeo, this.getMaterial('metal', 0xfef08a));
    coin.add(star);

    return coin;
  }

  createGem(options = {}) {
    const size = options.size || 0.6;
    const color = options.color || 0x38bdf8;
    const gemGeo = new THREE.OctahedronGeometry(size, 0);
    gemGeo.scale(1, 1.5, 1);

    const gemMat = this.getMaterial('glass', color, {
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.1,
    });

    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.castShadow = true;
    return gem;
  }

  createCrate(options = {}) {
    const size = options.size || 1.2;
    const crate = new THREE.Group();
    crate.name = 'crate';

    const woodMat = this.getMaterial('plastic', options.color || 0xca8a04);
    const frameMat = this.getMaterial('metal', 0x3f3f46);

    const boxGeo = new THREE.BoxGeometry(size, size, size);
    const innerBox = new THREE.Mesh(boxGeo, woodMat);
    innerBox.castShadow = true;
    innerBox.receiveShadow = true;
    crate.add(innerBox);

    const frameGeo = new THREE.BoxGeometry(size * 1.02, size * 1.02, size * 0.1);
    const f1 = new THREE.Mesh(frameGeo, frameMat);
    const f2 = f1.clone();
    f2.rotateY(Math.PI / 2);
    crate.add(f1);
    crate.add(f2);

    return crate;
  }

  createTree(options = {}) {
    const tree = new THREE.Group();
    const trunkMat = this.getMaterial('plastic', 0x78350f);
    const foliageMat = this.getMaterial('plastic', options.foliageColor || 0x16a34a);

    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 1.8, 8);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    tree.add(trunk);

    for (let i = 0; i < 3; i++) {
      const coneGeo = new THREE.ConeGeometry(1.4 - i * 0.3, 1.4, 7);
      const cone = new THREE.Mesh(coneGeo, foliageMat);
      cone.position.y = 1.8 + i * 0.8;
      cone.castShadow = true;
      tree.add(cone);
    }

    return tree;
  }

  createLaserBullet(options = {}) {
    const color = options.color || 0xea580c;
    const length = options.length || 0.8;
    const radius = options.radius || 0.08;

    const geo = new THREE.CylinderGeometry(radius, radius, length, 8);
    geo.rotateX(Math.PI / 2);
    const mat = this.getMaterial('neon', color, { intensity: 3.0 });

    const bullet = new THREE.Mesh(geo, mat);
    bullet.castShadow = false;
    return bullet;
  }

  // =========================================================================
  // Promisified Asset Loaders (GLTF, Textures) with Error Fallbacks
  // =========================================================================

  /**
   * Promisified GLTF loader with auto-shadows, centering, scale-to-fit, and animation extraction.
   */
  async loadGLTF(url, options = {}) {
    if (this.modelCache.has(url)) {
      return this.modelCache.get(url).clone();
    }

    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;

          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = options.castShadow !== false;
              child.receiveShadow = options.receiveShadow !== false;
            }
          });

          if (options.scaleToFit) {
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
              const scale = (options.targetSize || 2) / maxDim;
              model.scale.setScalar(scale);
            }
          }

          if (options.center) {
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
          }

          model.animations = gltf.animations || [];
          this.modelCache.set(url, model);
          resolve(model);
        },
        options.onProgress,
        (err) => {
          console.warn(`[Gamebox Models] Failed to load GLTF at ${url}:`, err);
          if (options.fallbackMesh) {
            resolve(options.fallbackMesh);
          } else {
            reject(err);
          }
        }
      );
    });
  }

  /**
   * Promisified Texture loader with sRGB color space and 1x1 fallback pixel so games never crash.
   */
  loadTexture(url, options = {}) {
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          texture.colorSpace = options.colorSpace || THREE.SRGBColorSpace;
          if (options.repeat) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(options.repeat[0], options.repeat[1]);
          }
          resolve(texture);
        },
        undefined,
        (err) => {
          console.warn(`[Gamebox Models] Texture load failed for ${url}, using fallback:`, err);
          // Fallback 1x1 magenta/orange pixel canvas texture
          const canvas = document.createElement('canvas');
          canvas.width = 2;
          canvas.height = 2;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = options.fallbackColor || '#ea580c';
          ctx.fillRect(0, 0, 2, 2);
          const fallbackTex = new THREE.CanvasTexture(canvas);
          resolve(fallbackTex);
        }
      );
    });
  }
}

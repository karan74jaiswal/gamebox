import * as THREE from 'three';

/**
 * Game states supported by Gamebox Engine
 */
export const GameState = {
  START: 'START',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY',
};

/**
 * High-performance Object Pool for reusable game entities (bullets, particles, enemies).
 */
export class ObjectPool {
  constructor(factory, initialSize = 20, maxGrowth = 500) {
    this.factory = factory;
    this.maxGrowth = maxGrowth;
    this.pool = [];
    this.active = new Set();

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  get() {
    let obj = this.pool.pop();
    if (!obj && this.active.size < this.maxGrowth) {
      obj = this.factory();
    }
    if (obj) {
      this.active.add(obj);
      if (typeof obj.onAcquire === 'function') obj.onAcquire();
    }
    return obj;
  }

  release(obj) {
    if (!obj || !this.active.has(obj)) return;
    this.active.delete(obj);
    if (typeof obj.onRelease === 'function') obj.onRelease();
    this.pool.push(obj);
  }

  releaseAll() {
    for (const obj of Array.from(this.active)) {
      this.release(obj);
    }
  }

  forEachActive(fn) {
    for (const obj of this.active) {
      fn(obj);
    }
  }
}

/**
 * Core 3D Gamebox Engine
 * Manages Three.js scene, camera, renderer, lighting presets, update loop, state transitions, and post-processing.
 */
export class Engine {
  constructor(options = {}) {
    this.options = {
      canvas: options.canvas || document.getElementById('game-canvas'),
      container: options.container || document.body,
      fov: options.fov || 60,
      near: options.near || 0.1,
      far: options.far || 1000,
      clearColor: options.clearColor !== undefined ? options.clearColor : 0x09090b,
      shadows: options.shadows !== false,
      antialias: options.antialias !== false,
      pixelRatioLimit: options.pixelRatioLimit || 2,
      cameraPos: options.cameraPos || [0, 6, 12],
      lookAt: options.lookAt || [0, 0, 0],
      fog: options.fog || null, // e.g. { color: 0x09090b, near: 10, far: 80 }
      ...options,
    };

    // 1. Create or resolve Canvas
    if (!this.options.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'game-canvas';
      this.options.container.appendChild(this.canvas);
    } else {
      this.canvas = this.options.canvas;
    }

    // 2. Scene setup
    this.scene = new THREE.Scene();
    if (this.options.clearColor !== null) {
      this.scene.background = new THREE.Color(this.options.clearColor);
    }

    if (this.options.fog) {
      if (this.options.fog.density) {
        this.scene.fog = new THREE.FogExp2(this.options.fog.color, this.options.fog.density);
      } else {
        this.scene.fog = new THREE.Fog(
          this.options.fog.color || this.options.clearColor,
          this.options.fog.near || 10,
          this.options.fog.far || 100
        );
      }
    }

    // 3. Scene Organization Groups
    this.world = new THREE.Group();
    this.entities = new THREE.Group();
    this.particles = new THREE.Group();
    this.lights = new THREE.Group();

    this.scene.add(this.world);
    this.scene.add(this.entities);
    this.scene.add(this.particles);
    this.scene.add(this.lights);

    // 4. Camera setup (Perspective by default, can switch to Orthographic)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(this.options.fov, aspect, this.options.near, this.options.far);
    this.camera.position.set(...this.options.cameraPos);
    this.camera.lookAt(new THREE.Vector3(...this.options.lookAt));

    // 5. WebGLRenderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.options.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.pixelRatioLimit));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (this.options.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // 6. Timing and Game Loop
    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.animationFrameId = null;
    this.state = GameState.START;
    this.entitiesList = [];
    this.updateCallbacks = [];
    this.stateCallbacks = {
      [GameState.START]: [],
      [GameState.PLAYING]: [],
      [GameState.PAUSED]: [],
      [GameState.GAME_OVER]: [],
      [GameState.VICTORY]: [],
    };

    // 7. Post-processing support
    this.composer = null;
    this.postPasses = {};

    // 8. Event listeners
    this._boundOnResize = this._onResize.bind(this);
    window.addEventListener('resize', this._boundOnResize);

    // Setup initial default arcade lighting
    this.setupLighting('arcade');
  }

  /**
   * Configures atmospheric lighting presets with calibrated shadows and colors.
   */
  setupLighting(preset = 'arcade') {
    // Clear existing lights
    while (this.lights.children.length > 0) {
      const child = this.lights.children[0];
      this.lights.remove(child);
      if (child.dispose) child.dispose();
    }

    if (preset === 'arcade') {
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      const hemi = new THREE.HemisphereLight(0xffedd5, 0x18181b, 0.4);
      hemi.position.set(0, 50, 0);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
      dirLight.position.set(15, 25, 15);
      this._configureShadows(dirLight, 25);

      this.lights.add(ambient);
      this.lights.add(hemi);
      this.lights.add(dirLight);
    } else if (preset === 'cyberpunk') {
      const ambient = new THREE.AmbientLight(0x0f172a, 0.4);

      const mainLight = new THREE.DirectionalLight(0x38bdf8, 1.2); // Cyan key
      mainLight.position.set(10, 20, 10);
      this._configureShadows(mainLight, 20);

      const rimLight = new THREE.DirectionalLight(0xf43f5e, 0.9); // Magenta rim
      rimLight.position.set(-15, 10, -10);

      const orangeAccent = new THREE.PointLight(0xea580c, 2.5, 30, 2);
      orangeAccent.position.set(0, 5, 0);

      this.lights.add(ambient);
      this.lights.add(mainLight);
      this.lights.add(rimLight);
      this.lights.add(orangeAccent);
    } else if (preset === 'sunset') {
      const ambient = new THREE.AmbientLight(0x4c1d95, 0.3);
      const hemi = new THREE.HemisphereLight(0xfb923c, 0x312e81, 0.5);

      const sun = new THREE.DirectionalLight(0xea580c, 1.5);
      sun.position.set(30, 15, 20);
      this._configureShadows(sun, 30);

      this.lights.add(ambient);
      this.lights.add(hemi);
      this.lights.add(sun);
    } else if (preset === 'studio') {
      const ambient = new THREE.AmbientLight(0xffffff, 0.4);

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
      keyLight.position.set(8, 12, 8);
      this._configureShadows(keyLight, 15);

      const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.5);
      fillLight.position.set(-8, 6, 8);

      const backLight = new THREE.DirectionalLight(0xffedd5, 0.6);
      backLight.position.set(0, 8, -10);

      this.lights.add(ambient);
      this.lights.add(keyLight);
      this.lights.add(fillLight);
      this.lights.add(backLight);
    }
  }

  _configureShadows(light, bounds = 20) {
    if (!this.options.shadows) return;
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 100;
    light.shadow.camera.left = -bounds;
    light.shadow.camera.right = bounds;
    light.shadow.camera.top = bounds;
    light.shadow.camera.bottom = -bounds;
    light.shadow.bias = -0.0001;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 2;
  }

  /**
   * Switches camera to Orthographic mode (ideal for 2D, retro, or isometric games).
   */
  setOrthographicCamera(frustumSize = 20) {
    const aspect = window.innerWidth / window.innerHeight;
    const oldCam = this.camera;
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    this.camera.position.copy(oldCam.position);
    this.camera.quaternion.copy(oldCam.quaternion);
    this.frustumSize = frustumSize;
    return this.camera;
  }

  /**
   * Sets up fixed isometric projection angle.
   */
  setupIsometric(frustumSize = 25, distance = 30) {
    this.setOrthographicCamera(frustumSize);
    this.camera.position.set(distance, distance, distance);
    this.camera.lookAt(0, 0, 0);
    return this.camera;
  }

  /**
   * One-line full-screen post-processing pipeline (Unreal Bloom, Vignette, FXAA).
   * Automatically loads Three.js addons and binds to window resize.
   */
  async enablePostProcessing(options = {}) {
    try {
      const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
      const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
      const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
      const { ShaderPass } = await import('three/addons/postprocessing/ShaderPass.js');
      const { FXAAShader } = await import('three/addons/shaders/FXAAShader.js');

      this.composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      // Unreal Bloom
      if (options.bloom !== false) {
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          options.bloomStrength || 1.2,
          options.bloomRadius || 0.4,
          options.bloomThreshold || 0.85
        );
        this.composer.addPass(bloomPass);
        this.postPasses.bloom = bloomPass;
      }

      // FXAA Anti-Aliasing Pass
      const fxaaPass = new ShaderPass(FXAAShader);
      const pixelRatio = this.renderer.getPixelRatio();
      fxaaPass.material.uniforms['resolution'].value.set(
        1 / (window.innerWidth * pixelRatio),
        1 / (window.innerHeight * pixelRatio)
      );
      this.composer.addPass(fxaaPass);
      this.postPasses.fxaa = fxaaPass;

      return this.composer;
    } catch (err) {
      console.warn('[Gamebox Engine] Post-processing addon load skipped:', err);
      this.composer = null;
      return null;
    }
  }

  /**
   * Game State Machine
   */
  setState(newState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;

    if (this.stateCallbacks[newState]) {
      this.stateCallbacks[newState].forEach((cb) => cb(oldState, newState));
    }
  }

  getState() {
    return this.state;
  }

  isState(state) {
    return this.state === state;
  }

  onState(state, callback) {
    if (this.stateCallbacks[state]) {
      this.stateCallbacks[state].push(callback);
    }
  }

  onStart(cb) { this.onState(GameState.START, cb); }
  onPlay(cb) { this.onState(GameState.PLAYING, cb); }
  onPause(cb) { this.onState(GameState.PAUSED, cb); }
  onGameOver(cb) { this.onState(GameState.GAME_OVER, cb); }
  onVictory(cb) { this.onState(GameState.VICTORY, cb); }

  /**
   * Entity Management
   */
  addEntity(entity) {
    this.entitiesList.push(entity);
    if (entity.mesh) {
      this.entities.add(entity.mesh);
    } else if (entity instanceof THREE.Object3D) {
      this.entities.add(entity);
    }
    if (typeof entity.init === 'function') entity.init(this);
    return entity;
  }

  removeEntity(entity) {
    const idx = this.entitiesList.indexOf(entity);
    if (idx !== -1) {
      this.entitiesList.splice(idx, 1);
    }
    if (entity.mesh) {
      this.entities.remove(entity.mesh);
    } else if (entity instanceof THREE.Object3D) {
      this.entities.remove(entity);
    }
    if (typeof entity.destroy === 'function') entity.destroy();
  }

  clearEntities() {
    while (this.entitiesList.length > 0) {
      this.removeEntity(this.entitiesList[0]);
    }
  }

  /**
   * Register custom update callback: cb(dt, elapsed)
   */
  onUpdate(callback) {
    this.updateCallbacks.push(callback);
  }

  /**
   * Starts the animation loop.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this._loop();
  }

  /**
   * Stops the animation loop.
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Core frame step.
   */
  _loop() {
    if (!this.isRunning) return;
    this.animationFrameId = requestAnimationFrame(this._loop.bind(this));

    // Clamp delta time to 0.1s max to prevent physics teleportation on frame drops/tab switch
    const rawDelta = this.clock.getDelta();
    const dt = Math.min(rawDelta, 0.1);
    const elapsed = this.clock.getElapsedTime();

    // Update active entities (only during active gameplay or as needed)
    for (let i = this.entitiesList.length - 1; i >= 0; i--) {
      const entity = this.entitiesList[i];
      if (typeof entity.update === 'function') {
        entity.update(dt, elapsed);
      }
      if (entity.isDead) {
        this.removeEntity(entity);
      }
    }

    // Call external user update callbacks
    for (const cb of this.updateCallbacks) {
      cb(dt, elapsed);
    }

    // Render frame via EffectComposer or WebGLRenderer
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Handles dynamic iframe & window resizing.
   */
  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.isOrthographicCamera && this.frustumSize) {
      this.camera.left = (this.frustumSize * aspect) / -2;
      this.camera.right = (this.frustumSize * aspect) / 2;
      this.camera.top = this.frustumSize / 2;
      this.camera.bottom = this.frustumSize / -2;
      this.camera.updateProjectionMatrix();
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.pixelRatioLimit));

    if (this.composer) {
      this.composer.setSize(width, height);
      if (this.postPasses.fxaa) {
        const pixelRatio = this.renderer.getPixelRatio();
        this.postPasses.fxaa.material.uniforms['resolution'].value.set(
          1 / (width * pixelRatio),
          1 / (height * pixelRatio)
        );
      }
    }
  }

  /**
   * Disposes all textures, materials, geometries, and DOM listeners.
   */
  dispose() {
    this.stop();
    window.removeEventListener('resize', this._boundOnResize);

    const disposeNode = (node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((m) => {
          ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'envMap'].forEach((tex) => {
            if (m[tex] && m[tex].dispose) m[tex].dispose();
          });
          m.dispose();
        });
      }
    };

    this.scene.traverse(disposeNode);
    this.renderer.dispose();
  }
}

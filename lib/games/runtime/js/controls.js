import * as THREE from 'three';

/**
 * Universal Game Controls: Keyboard, Mouse, Touch, Virtual Joystick, Raycasting & Camera Controllers.
 * Solves iframe focus, scrolling prevention, mobile touch, and smooth camera behaviors.
 */
export class Controls {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.camera = engine ? engine.camera : null;
    this.domElement = (engine && engine.canvas) || document.body;

    this.options = {
      preventScrolling: true,
      autoFocus: true,
      enableTouchJoystick: false,
      ...options,
    };

    // Keyboard state
    this.keys = new Set();
    this.keysJustPressed = new Set();

    // Mouse state
    this.mouse = {
      x: 0, // NDC (-1 to 1)
      y: 0,
      clientX: 0,
      clientY: 0,
      deltaX: 0,
      deltaY: 0,
      buttons: new Set(),
      buttonsJustPressed: new Set(),
      isPointerLocked: false,
    };

    // Virtual Joystick state
    this.virtualAxes = { x: 0, y: 0 };
    this.joystickActive = false;
    this.touchButtons = new Set();

    // Screen Shake state
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeTimer = 0;
    this.cameraShakeOffset = new THREE.Vector3();

    // Raycaster & Interactivity
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.clickables = new Map(); // mesh -> { onClick, onHoverEnter, onHoverLeave, isHovered }
    this.hoveredObject = null;

    // Active camera controller
    this.activeCameraController = null;

    // Initialize DOM listeners
    this._initEvents();

    if (this.options.enableTouchJoystick || this._isTouchDevice()) {
      this.initVirtualJoystick();
    }
  }

  _isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  _initEvents() {
    // 1. Iframe Focus Auto-capture
    if (this.options.autoFocus) {
      window.focus();
      window.addEventListener('pointerdown', () => window.focus(), { passive: true });
    }

    // 2. Keyboard Listeners
    const gamingKeys = new Set([
      'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab',
    ]);

    window.addEventListener('keydown', (e) => {
      if (this.options.preventScrolling && (gamingKeys.has(e.code) || e.code.startsWith('Arrow'))) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) {
        this.keysJustPressed.add(e.code);
      }
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // 3. Mouse Listeners
    window.addEventListener('mousemove', (e) => {
      const rect = this.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.mouse.deltaX = e.movementX || e.clientX - this.mouse.clientX;
      this.mouse.deltaY = e.movementY || e.clientY - this.mouse.clientY;
      this.mouse.clientX = e.clientX;
      this.mouse.clientY = e.clientY;
      this.mouse.x = Math.max(-1, Math.min(1, x));
      this.mouse.y = Math.max(-1, Math.min(1, y));

      this._checkHover();
    });

    this.domElement.addEventListener('mousedown', (e) => {
      this.mouse.buttons.add(e.button);
      this.mouse.buttonsJustPressed.add(e.button);

      if (e.button === 0) {
        this._checkClick();
      }
    });

    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons.delete(e.button);
    });

    this.domElement.addEventListener('contextmenu', (e) => {
      if (this.options.preventContextMenu !== false) {
        e.preventDefault();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouse.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    // End of frame clearing for "just pressed" triggers
    if (this.engine) {
      this.engine.onUpdate((dt) => this.update(dt));
    }
  }

  /**
   * Cleans up frame-specific inputs and updates camera controllers/shake.
   */
  update(dt) {
    // 1. Update Camera Shake
    if (this.shakeTimer > 0 && this.camera) {
      this.shakeTimer -= dt;
      const progress = this.shakeTimer / this.shakeDuration;
      const currentIntensity = this.shakeIntensity * Math.pow(progress, 2);

      this.cameraShakeOffset.set(
        (Math.random() - 0.5) * 2 * currentIntensity,
        (Math.random() - 0.5) * 2 * currentIntensity,
        (Math.random() - 0.5) * 2 * currentIntensity
      );

      this.camera.position.add(this.cameraShakeOffset);
    }

    // 2. Update Active Camera Controller
    if (this.activeCameraController && typeof this.activeCameraController.update === 'function') {
      this.activeCameraController.update(dt);
    }

    // 3. Clear one-frame press flags
    this.keysJustPressed.clear();
    this.mouse.buttonsJustPressed.clear();
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
  }

  /**
   * Triggers an arcade camera shake effect.
   */
  shake(intensity = 0.4, duration = 0.3) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  isDown(code) {
    if (code === 'Space' && this.touchButtons.has('action-a')) return true;
    if (code === 'KeyE' && this.touchButtons.has('action-b')) return true;
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.keysJustPressed.has(code);
  }

  getAxes() {
    let x = 0;
    let y = 0;

    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;

    if (this.joystickActive) {
      x += this.virtualAxes.x;
      y += this.virtualAxes.y;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }

    return { x, y };
  }

  isMouseDown(button = 0) {
    return this.mouse.buttons.has(button);
  }

  wasMouseClicked(button = 0) {
    return this.mouse.buttonsJustPressed.has(button);
  }

  /**
   * Projects 3D world position to 2D pixel coordinates on screen (from threejs-interaction skill).
   */
  worldToScreen(worldPos, camera = this.camera) {
    if (!camera) return { x: 0, y: 0, inView: false };
    const p = worldPos instanceof THREE.Vector3 ? worldPos.clone() : new THREE.Vector3(...worldPos);
    p.project(camera);

    const inView = p.z >= -1 && p.z <= 1;
    const x = ((p.x + 1) / 2) * window.innerWidth;
    const y = (-(p.y - 1) / 2) * window.innerHeight;

    return { x, y, inView };
  }

  /**
   * Unprojects 2D screen coordinate to 3D world position on a plane (from threejs-interaction skill).
   */
  screenToWorld(screenX, screenY, groundY = 0, camera = this.camera) {
    if (!camera) return new THREE.Vector3();
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    this.groundPlane.constant = -groundY;
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, target);
    return target;
  }

  /**
   * Projects mouse onto a 3D ground plane (Y = height).
   */
  getGroundIntersection(groundY = 0, camera = this.camera) {
    if (!camera) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(this.mouse.x, this.mouse.y), camera);
    this.groundPlane.constant = -groundY;
    const target = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, target);
  }

  /**
   * Raycasts objects from the current mouse position.
   */
  raycast(objects, recursive = true, camera = this.camera) {
    if (!camera) return [];
    this.raycaster.setFromCamera(new THREE.Vector2(this.mouse.x, this.mouse.y), camera);
    const targetList = Array.isArray(objects) ? objects : [objects];
    return this.raycaster.intersectObjects(targetList, recursive);
  }

  /**
   * Registers an object for automatic click and hover callbacks.
   */
  addClickable(mesh, onClick, onHoverEnter, onHoverLeave) {
    this.clickables.set(mesh, {
      onClick,
      onHoverEnter,
      onHoverLeave,
      isHovered: false,
    });
  }

  removeClickable(mesh) {
    this.clickables.delete(mesh);
  }

  _checkHover() {
    if (this.clickables.size === 0 || !this.camera) return;
    const meshes = Array.from(this.clickables.keys());
    const hits = this.raycast(meshes, true);

    let topMesh = null;
    if (hits.length > 0) {
      let curr = hits[0].object;
      while (curr) {
        if (this.clickables.has(curr)) {
          topMesh = curr;
          break;
        }
        curr = curr.parent;
      }
    }

    if (topMesh !== this.hoveredObject) {
      if (this.hoveredObject) {
        const entry = this.clickables.get(this.hoveredObject);
        if (entry && entry.onHoverLeave) entry.onHoverLeave(this.hoveredObject);
        document.body.style.cursor = 'default';
      }

      this.hoveredObject = topMesh;

      if (this.hoveredObject) {
        const entry = this.clickables.get(this.hoveredObject);
        if (entry && entry.onHoverEnter) entry.onHoverEnter(this.hoveredObject);
        document.body.style.cursor = 'pointer';
      }
    }
  }

  _checkClick() {
    if (!this.hoveredObject) return;
    const entry = this.clickables.get(this.hoveredObject);
    if (entry && entry.onClick) {
      entry.onClick(this.hoveredObject);
    }
  }

  requestPointerLock() {
    this.domElement.requestPointerLock();
  }

  exitPointerLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  /**
   * Wraps Three.js OrbitControls for puzzle, inspection, and builder games.
   */
  async setupOrbitControls(options = {}) {
    try {
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      const controls = new OrbitControls(this.camera, this.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = options.dampingFactor || 0.05;
      controls.minDistance = options.minDistance || 2;
      controls.maxDistance = options.maxDistance || 60;
      controls.maxPolarAngle = options.maxPolarAngle || Math.PI / 2 - 0.05;

      this.activeCameraController = {
        controls,
        update: () => controls.update(),
        dispose: () => controls.dispose(),
      };
      return controls;
    } catch (err) {
      console.warn('[Gamebox Controls] OrbitControls addon load skipped:', err);
      return null;
    }
  }

  /**
   * Sets up smooth Third-Person Follow Camera.
   */
  setupThirdPersonCamera(target, options = {}) {
    const config = {
      distance: 8,
      height: 4,
      smoothSpeed: 8,
      ...options,
    };

    const camera = this.camera;
    const currentPos = camera.position.clone();
    const currentLook = new THREE.Vector3();

    this.activeCameraController = {
      update: (dt) => {
        if (!target) return;

        const targetPos = target.position || target;
        const targetRotY = target.rotation ? target.rotation.y : 0;

        const backward = new THREE.Vector3(
          Math.sin(targetRotY) * config.distance,
          config.height,
          Math.cos(targetRotY) * config.distance
        );

        const idealCameraPos = targetPos.clone().add(backward);
        const idealLookAt = targetPos.clone().add(new THREE.Vector3(0, config.height * 0.4, 0));

        const t = 1.0 - Math.exp(-config.smoothSpeed * dt);
        currentPos.lerp(idealCameraPos, t);
        currentLook.lerp(idealLookAt, t);

        camera.position.copy(currentPos);
        camera.lookAt(currentLook);
      },
    };

    return this.activeCameraController;
  }

  /**
   * Sets up smooth Isometric / Top-Down Camera.
   */
  setupTopDownCamera(target, options = {}) {
    const config = {
      offset: new THREE.Vector3(0, 15, 12),
      smoothSpeed: 7,
      ...options,
    };

    const camera = this.camera;

    this.activeCameraController = {
      update: (dt) => {
        if (!target) return;
        const targetPos = target.position || target;
        const idealPos = targetPos.clone().add(config.offset);

        const t = 1.0 - Math.exp(-config.smoothSpeed * dt);
        camera.position.lerp(idealPos, t);
        camera.lookAt(targetPos);
      },
    };

    return this.activeCameraController;
  }

  /**
   * Sets up First-Person Camera Controller.
   */
  setupFirstPersonCamera(target, options = {}) {
    const config = {
      eyeHeight: 1.7,
      mouseSensitivity: 0.002,
      maxPitch: Math.PI / 2 - 0.05,
      minPitch: -Math.PI / 2 + 0.05,
      ...options,
    };

    let pitch = 0;
    let yaw = target ? target.rotation.y : 0;

    const onMouseMove = (e) => {
      if (!this.mouse.isPointerLocked) return;
      yaw -= e.movementX * config.mouseSensitivity;
      pitch -= e.movementY * config.mouseSensitivity;
      pitch = Math.max(config.minPitch, Math.min(config.maxPitch, pitch));
    };

    window.addEventListener('mousemove', onMouseMove);

    this.activeCameraController = {
      update: () => {
        if (!target) return;
        this.camera.position.copy(target.position).add(new THREE.Vector3(0, config.eyeHeight, 0));

        const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(euler);

        if (target.rotation) {
          target.rotation.y = yaw;
        }
      },
      dispose: () => {
        window.removeEventListener('mousemove', onMouseMove);
      },
    };

    return this.activeCameraController;
  }

  initVirtualJoystick() {
    if (document.getElementById('gb-touch-ui')) return;

    const touchUI = document.createElement('div');
    touchUI.id = 'gb-touch-ui';
    touchUI.className = 'gb-touch-controls';
    touchUI.innerHTML = `
      <div class="gb-joystick-base" id="gb-joy-base">
        <div class="gb-joystick-thumb" id="gb-joy-thumb"></div>
      </div>
      <div class="gb-touch-actions">
        <div class="gb-touch-btn" id="gb-btn-b">B</div>
        <div class="gb-touch-btn" id="gb-btn-a">A</div>
      </div>
    `;

    document.body.appendChild(touchUI);

    const base = document.getElementById('gb-joy-base');
    const thumb = document.getElementById('gb-joy-thumb');
    let touchId = null;
    let startX = 0;
    let startY = 0;
    const maxRadius = 45;

    const handleStart = (e) => {
      if (touchId !== null) return;
      const touch = e.changedTouches[0];
      touchId = touch.identifier;
      const rect = base.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
      this.joystickActive = true;
      handleMove(e);
    };

    const handleMove = (e) => {
      if (touchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === touchId) {
          let dx = touch.clientX - startX;
          let dy = touch.clientY - startY;
          const dist = Math.hypot(dx, dy);

          if (dist > maxRadius) {
            dx = (dx / dist) * maxRadius;
            dy = (dy / dist) * maxRadius;
          }

          thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          this.virtualAxes.x = dx / maxRadius;
          this.virtualAxes.y = -dy / maxRadius;
          break;
        }
      }
    };

    const handleEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) {
          touchId = null;
          thumb.style.transform = `translate(-50%, -50%)`;
          this.virtualAxes.x = 0;
          this.virtualAxes.y = 0;
          this.joystickActive = false;
          break;
        }
      }
    };

    base.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd, { passive: false });
    window.addEventListener('touchcancel', handleEnd, { passive: false });

    const btnA = document.getElementById('gb-btn-a');
    const btnB = document.getElementById('gb-btn-b');

    const setupBtn = (btn, actionName) => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchButtons.add(actionName);
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.touchButtons.delete(actionName);
      }, { passive: false });
    };

    setupBtn(btnA, 'action-a');
    setupBtn(btnB, 'action-b');
  }
}

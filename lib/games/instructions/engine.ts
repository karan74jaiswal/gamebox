/**
 * Engine instructions for the Gamebox AI agent.
 * Provides a comprehensive, in-depth architectural and API reference for the Gamebox 3D Game Engine and Primitives.
 */
export const engineInstructions = `# Gamebox 3D Engine & Primitives Reference

You are building web games powered by the **Gamebox 3D Game Engine**, an arcade-tuned Three.js framework pre-seeded directly in the sandbox at \`/home/daytona/game/js/\`.

---

## 1. Architecture & Entrypoint: \`Gamebox.create(options)\`

The primary entrypoint is \`./js/gamebox.js\`. It wires all engine subsystems, UI overlays, audio contexts, and input listeners in a single call.

\`\`\`javascript
import { Gamebox } from './js/gamebox.js';
// or individual modules:
// import { Engine, Controls, HUD, Sound, Models, Animations, Particles, Physics, Shaders } from './js/gamebox.js';

const {
  engine,      // 3D Engine: scene, camera, renderer, loop, post-processing, state machine
  controls,    // Universal input (WASD/Touch/Mouse), camera controllers, raycasting, screen shake
  hud,         // 2D/3D arcade UI, score, health bars, entity tracking bars, overlays, minimap
  sound,       // Synthesized Web Audio SFX (laser, explosion, jump, coin) & procedural BGM
  models,      // Procedural 3D mesh generators (characters, vehicles, arenas) & loaders
  animations,  // Springs, tweens, squash & stretch, smooth damp, procedural walk cycles
  particles,   // GPU particle emitters (explosions, sparks, thruster plumes, confetti)
  physics,     // Lightweight arcade 3D physics (ArcadeBody, AABB, Sphere, SpatialGrid)
  shaders,     // Custom GLSL materials (cyber grid, hologram, shield, dissolve, water)
  scene,       // THREE.Scene instance
  camera,      // THREE.PerspectiveCamera (or OrthographicCamera)
  renderer,    // THREE.WebGLRenderer
} = Gamebox.create({
  title: "Game Title",            // Displayed in HUD
  cameraPos: [0, 8, 14],          // Initial camera position
  lookAt: [0, 0, 0],              // Initial camera look target
  lighting: "arcade",             // "arcade" | "cyberpunk" | "sunset" | "studio"
  bloom: false,                   // Enable post-processing bloom (true | false)
  container: document.body,       // Container element (defaults to document.body)
  antialias: true,                // WebGL antialiasing
  shadows: true,                  // Enable shadow maps
});
\`\`\`

---

## 2. Core Engine (\`engine.js\`)

Manages the Three.js scene graph, WebGL renderer, animation loop, lighting presets, camera configurations, and game state transitions.

### Key Methods & Properties:
- \`engine.scene\`: Active \`THREE.Scene\`.
- \`engine.camera\`: Active \`THREE.PerspectiveCamera\` or \`THREE.OrthographicCamera\`.
- \`engine.renderer\`: Configured \`THREE.WebGLRenderer\` with automatic resize handling.
- \`engine.setupLighting(preset)\`:
  - \`"arcade"\`: Bright, saturated ambient light, warm directional sun with crisp shadows, and cool sky hemisphere.
  - \`"cyberpunk"\`: High-contrast dark ambient, vibrant neon magenta/cyan accents, and crisp rim lighting.
  - \`"sunset"\`: Warm golden directional sun, deep purple ambient, and peach fill.
  - \`"studio"\`: Clean neutral three-point studio lighting with soft shadows.
- \`engine.enablePostProcessing(options)\`:
  - \`options.bloom\`: Enable UnrealBloomPass.
  - \`options.bloomStrength\`: Default \`1.2\`.
  - \`options.bloomRadius\`: Default \`0.4\`.
  - \`options.bloomThreshold\`: Default \`0.85\`.
- \`engine.setOrthographicCamera(frustumSize)\`: Switches to 2D / top-down orthographic camera.
- \`engine.setupIsometric(frustumSize, distance)\`: Sets up an authentic 30-degree isometric projection for strategy/RPGs.
- \`engine.onUpdate(callback)\`:
  - Registers a tick handler: \`engine.onUpdate((dt, elapsed) => { ... })\`.
  - \`dt\` is the delta time in seconds, strictly clamped to \`<= 0.1s\` to prevent simulation explosion on tab blur or lag spikes.
  - \`elapsed\` is the total seconds since engine start.
- \`engine.start()\` / \`engine.stop()\`: Starts or pauses the internal RAF loop.
- \`engine.setState(newState)\`: Transitions game state (\`"START"\`, \`"PLAYING"\`, \`"GAME_OVER"\`, \`"VICTORY"\`).
- \`engine.onStateChange((newState, oldState) => { ... })\`: State transition callback.
- \`engine.createPool(factoryFn, initialSize)\`: Built-in object pooling for high-frequency objects (bullets, debris).

---

## 3. Universal Controls & Camera (\`controls.js\`)

Combines keyboard, mouse, and touch joystick into a unified API. Solves iframe focus, scrolling prevention, and camera follow behaviors.

### Input APIs:
- \`controls.getAxes()\`: Returns normalized \`{ x, y }\` vector (values -1 to 1) from WASD, Arrow keys, or on-screen touch joystick.
- \`controls.isDown(code)\`: Check if key is held (e.g. \`"Space"\`, \`"KeyW"\`, \`"ShiftLeft"\`).
- \`controls.wasPressed(code)\`: Check if key was pressed this frame (single-fire trigger).
- \`controls.pointer\`: Normalized mouse position \`{ x, y }\` (-1 to 1).
- \`controls.isPointerDown\`: Boolean indicating if mouse or touch is currently pressed.

### Camera Controllers:
- \`controls.setupThirdPersonCamera(targetMesh, options)\`:
  - Smoothly follows \`targetMesh\` from behind.
  - Options: \`distance: 8\`, \`height: 4\`, \`stiffness: 0.08\`, \`enableMouseOrbit: true\`.
- \`controls.setupTopDownCamera(targetMesh, options)\`:
  - Follows target with a fixed offset (e.g. \`offset: new THREE.Vector3(0, 15, 10)\`).
- \`controls.setupOrbitControls()\`: Enables interactive Three.js OrbitControls for inspection, builder, or puzzle games.

### Raycasting, Picking & Screen Shake:
- \`controls.shake(intensity, duration)\`: Triggers screen shake for hits, explosions, or jumping impacts.
- \`controls.getGroundIntersection(groundY = 0)\`: Raycasts from mouse pointer onto a horizontal plane at \`y = groundY\`. Returns \`THREE.Vector3 | null\`.
- \`controls.worldToScreen(worldPos)\`: Projects a 3D coordinate to 2D pixel coordinates \`{ x, y }\`.
- \`controls.screenToWorld(screenX, screenY, groundY)\`: Unprojects screen coordinates to 3D world plane.
- \`controls.addClickable(mesh, onClick, onHoverEnter, onHoverLeave)\`: Automatic raycasting registration for clickable 3D objects.

---

## 4. Arcade HUD & Overlays (\`hud.js\`)

Renders a responsive, cyber-themed HUD on top of the 3D canvas with animated health bars, floating combat text, and game screens.

### Core HUD APIs:
- \`hud.setScore(score)\`: Updates top score display.
- \`hud.addScore(points, worldPos3D)\`: Increments score and spawns a floating animated \`+100\` text label at the 3D entity's location that drifts upward and fades out.
- \`hud.setHealth(current, max)\`: Smooth animated health bar with damage flash.
- \`hud.createEntityBar(mesh, heightOffset, options)\`: Spawns a floating health/name bar over any 3D entity that follows it in real-time as it moves.
  - Options: \`color: "#ef4444"\`, \`width: 48\`, \`height: 6\`. Returns an object with \`updateHealth(cur, max)\` and \`destroy()\`.
- \`hud.showBanner(title, subtitle, durationMs)\`: Displays center announcement banner (e.g. \`"WAVE 1"\`, \`"BOSS APPROACHING"\`).
- \`hud.flashDamage()\` / \`hud.flashHeal()\` / \`hud.flashVictory()\`: Full-screen border flashes.
- \`hud.setCrosshair('dot' | 'ring')\`: Renders a high-visibility shooter crosshair.
- \`hud.triggerCrosshairRecoil()\`: Animated bloom recoil on shooting.
- \`hud.initMinimap(options)\` & \`hud.renderMinimap(playerPos, blips)\`: 2D circular radar showing enemies, items, and player orientation.

### Full-Screen Interactive Overlays:
- \`hud.showStartScreen({ title, description, controls, onStart })\`: Clean welcome overlay with instructions and "PLAY" button.
- \`hud.showGameOver({ score, stats, onRestart })\`: Defeat overlay with final score, statistics list, and restart action.
- \`hud.showVictory({ score, stats, onContinue })\`: Victory overlay with confetti and progression.

---

## 5. Synthesized Audio (\`sound.js\`)

Zero external audio files! Uses procedural Web Audio API synthesis for crisp, punchy retro and modern arcade sounds. Automatically unlocks upon first player interaction.

### Sound Effects:
- \`sound.laser({ frequency, duration })\`: Punchy blaster shot with pitch drop.
- \`sound.explosion({ duration, subPunch })\`: Heavy filtered noise explosion with sub-bass punch.
- \`sound.jump()\`: Classic rising pitch spring glide.
- \`sound.coin()\`: Two-tone crystal chime.
- \`sound.powerup()\`: 4-note ascending arpeggio.
- \`sound.hit()\`: Quick hollow impact thud.
- \`sound.hurt()\`: Player damage grunt.
- \`sound.click()\`: Crisp UI interaction click.
- \`sound.victory()\`: Major fanfare arpeggio.
- \`sound.gameOver()\`: Descending sad synth chords.

### Background Music Synthesizer:
- \`sound.startMusic(genre, options)\`: Generates continuous synthesized soundtrack loops.
  - Genres: \`"arcade"\` (fast arpeggiated chiptune), \`"synthwave"\` (deep bassline & dreamy pads), \`"action"\` (driving bassline & percussion pulses), \`"ambient"\` (calm space pads).
- \`sound.stopMusic()\`: Stops background music smoothly.
- \`sound.setVolume(vol)\`: Master volume (0 to 1).

---

## 6. Procedural 3D Models & Loaders (\`models.js\`)

Generate vibrant, stylized 3D meshes procedurally with zero external asset dependencies.

### Procedural Model Generators:
- \`models.createCharacter(options)\`: Articulated low-poly robot/runner with torso, head, and hinged arm/leg pivot groups (ready for walking animations).
  - Options: \`color: 0x3b82f6\`, \`accentColor: 0xea580c\`, \`hasWeapon: true\`, \`scale: 1\`.
- \`models.createSpaceship(options)\`: Sleek sci-fi fighter with fuselage, wings, laser cannons, cockpit, and glowing thruster exhausts.
- \`models.createCar(options)\`: Arcade sports car with chassis, cabin, spoilers, and 4 steerable/spinning wheel groups.
- \`models.createArena(options)\`: Complete enclosed combat/racing arena with cyber perimeter walls, boundary collision planes, and grid floor.
  - Options: \`size: 60\`, \`wallHeight: 4\`, \`gridColor: 0xea580c\`.
- \`models.createSkyDome(topColor, bottomColor)\`: Gradient sky dome sphere.
- \`models.createStarfield(count, radius)\`: Deep space star point cloud.
- \`models.createTrack(points, options)\`: Extruded curved 3D tube/ribbon track.
- \`models.createBlobShadow(radius)\`: Lightweight projected ground shadow decal mesh for characters/vehicles.
- \`models.createCoin(options)\`, \`models.createGem(options)\`, \`models.createCrate(options)\`, \`models.createLaserBullet(options)\`.

### Materials & External Loaders:
- \`models.getMaterial(type, color, options)\`: Returns tuned materials (\`"neon"\`, \`"metal"\`, \`"carPaint"\`, \`"plastic"\`, \`"glass"\`, \`"toon"\`, \`"grid"\`).
- \`models.createInstancedField(geometry, material, count, transformFn)\`: Creates a \`THREE.InstancedMesh\` rendering 1,000+ instances in 1 single draw call.
- \`models.loadGLTF(url, options)\`: Promisified GLTF loader with auto-centering, scale normalization, and shadow casting.

---

## 7. Procedural Animations (\`animations.js\`)

Juicy game-feel animations, kinematics, and tweening without external dependencies.

- \`animations.walkCycle(characterModel, speed, dt)\`: Drives arms and legs in opposing sinusoidal swinging arcs based on movement speed.
- \`animations.squashAndStretch(mesh, factor, duration)\`: Arcade squash on landing, stretch on jump.
- \`animations.shake(mesh, intensity, duration)\`: Rotational and positional damage recoil.
- \`animations.lookAtSmooth(mesh, targetPos, speed, dt)\`: Smooth yaw rotation facing a moving target or mouse pointer.
- \`animations.bob(mesh, options)\`: Floating hover oscillation for collectibles and drones.
- \`animations.spin(mesh, axisSpeed)\`: Continuous axis spin (e.g. \`{ y: 3 }\`).
- \`animations.pulse(mesh, options)\`: Scale breathing pulsation.
- \`animations.to(target, { property, targetValue, duration, ease })\`: Lightweight tween engine with easing (\`"easeOutQuad"\`, \`"easeInOutQuad"\`, \`"bounceOut"\`, \`"elasticOut"\`).

---

## 8. Particle System (\`particles.js\`)

High-performance pooled particle system using custom point/quad shaders.

- \`particles.explode(position, options)\`: Spherical burst of glowing particles with random velocities, gravity, and color fade.
  - Options: \`count: 35\`, \`color: 0xea580c\`, \`speed: 10\`, \`life: 0.8\`, \`size: 0.4\`.
- \`particles.sparks(position, normal, options)\`: Directional ricochet sparks reflecting off surface normal.
- \`particles.thrusterPlume(mesh, offset, options)\`: Continuous rocket or jet exhaust emitter attached to a vehicle.
- \`particles.confetti(position, options)\`: Fluttering multi-color victory confetti with air drag and rotational tumble.
- \`particles.shockwave(position, options)\`: Expanding ground impact ring mesh.

---

## 9. Arcade 3D Physics (\`physics.js\`)

Lightweight, high-speed collision detection and kinematic movement designed specifically for arcade games.

### \`ArcadeBody\`:
\`\`\`javascript
import { ArcadeBody } from './js/physics.js';

const body = new ArcadeBody(mesh, {
  radius: 0.8,         // Collision sphere radius or AABB extents
  gravity: -25,        // Downward gravity acceleration
  drag: 0.96,          // Horizontal air drag damping
  bounce: 0.2,         // Restitution on ground impact
});

// Inside engine.onUpdate:
body.velocity.x = input.x * speed;
body.velocity.z = input.y * speed;
body.update(dt);
body.collideWithGround(0); // Clamps to y >= 0

// Jump:
if (controls.wasPressed('Space') && body.isGrounded) {
  body.jump(12);
}

// Collide with obstacles or enemies:
if (body.intersects(enemyBody, true)) { // true separates the bodies
  // Collision handled
}
\`\`\`

### Additional Physics Utilities:
- \`physics.checkCollision(bodyA, bodyB)\`: Fast sphere-sphere or AABB-AABB intersection test.
- \`new SpatialGrid(cellSize)\`: Broad-phase spatial partitioning grid for managing 500+ colliding entities at 60 FPS.

---

## 10. Custom Shaders (\`shaders.js\`)

Pre-compiled GLSL shaders for high-end visual polish:
- \`shaders.createCyberGrid(options)\`: Dynamic infinite grid with horizon fade and animated pulse waves.
- \`shaders.createHologram(options)\`: Sci-fi scanlines, Fresnel rim lighting, and chromatic jitter.
- \`shaders.createShield(options)\`: Hexagonal forcefield pulse shield with hit impact ripple.
- \`shaders.createDissolve(options)\`: Procedural Simplex noise burning edge disintegration.
- \`shaders.createWater(options)\`: Stylized low-poly vertex displacement water with specular shine.
- \`shaders.createLava(options)\`: Volcanic magma with flowing UV noise distortion and glowing crust.

---

## Summary: Building a Game in 4 Steps
1. **Init**: Call \`Gamebox.create({...})\` to bootstrap scene, camera, lighting, and HUD.
2. **Environment & Player**: Add \`models.createArena()\` and \`models.createCharacter()\`, attach a third-person or top-down camera.
3. **Game Loop**: In \`engine.onUpdate(dt)\`, read \`controls.getAxes()\`, move the player, update enemies/obstacles, check collisions with \`body.intersects()\`.
4. **Juice**: On events, call \`sound.laser()\`, \`particles.explode()\`, \`controls.shake()\`, and \`hud.addScore()\`.
`

export const engine = engineInstructions
export const ENGINE_INSTRUCTIONS = engineInstructions
export default engineInstructions

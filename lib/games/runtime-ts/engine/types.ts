import * as THREE from "three"

// --- Common 3D Types --------------------------------------------------------

/**
 * 3-element tuple representing [x, y, z] coordinates or vectors.
 */
export type Vector3Tuple = [x: number, y: number, z: number]

/**
 * 2-element tuple representing [x, y] coordinates or vectors.
 */
export type Vector2Tuple = [x: number, y: number]

/**
 * Flexible 3D vector input: accepts a THREE.Vector3 instance, a [x, y, z] tuple, or an {x, y, z} object.
 */
export type Vector3Like = THREE.Vector3 | Vector3Tuple | { x: number; y: number; z: number }

/**
 * Flexible 2D vector input: accepts a THREE.Vector2 instance, a [x, y] tuple, or an {x, y} object.
 */
export type Vector2Like = THREE.Vector2 | Vector2Tuple | { x: number; y: number }

/**
 * Representation of a color: hex number (0xff0000), CSS color string ("#ff0000", "red"), or THREE.Color instance.
 */
export type ColorLike = THREE.ColorRepresentation

// --- Engine -----------------------------------------------------------------

/**
 * Custom render target or post-processing pipeline interface.
 * Implemented by EffectComposer or custom offscreen passes.
 */
export interface RenderTarget {
  /** Execute render pass for current frame */
  render: () => void
  /** Handle resize events */
  setSize?: (width: number, height: number) => void
}

/**
 * Linear distance fog configuration.
 */
export interface FogConfig {
  /** Fog color (defaults to scene background color) */
  color?: ColorLike
  /** Near distance where fog starts (defaults to 10) */
  near?: number
  /** Far distance where fog completely obscures objects (defaults to 80) */
  far?: number
}

/**
 * Configuration options for initializing the 3D Engine.
 */
export interface EngineOptions {
  /** DOM element to mount the canvas into (defaults to document.body) */
  container?: HTMLElement
  /** Scene background color, or null for transparent */
  background?: ColorLike | null
  /** Fog density distance (number) or explicit { color, near, far } config */
  fog?: number | FogConfig | null
  /** Field of view in degrees (defaults to 60) */
  fov?: number
  /** Camera near clipping plane (defaults to 0.1) */
  near?: number
  /** Camera far clipping plane (defaults to 1000) */
  far?: number
  /** Initial camera position vector or [x, y, z] tuple */
  cameraPosition?: Vector3Like
  /** Initial camera target vector or [x, y, z] tuple (defaults to [0, 0, 0]) */
  lookAt?: Vector3Like
  /** Enable anti-aliasing (defaults to true) */
  antialias?: boolean
  /** Enable WebGL alpha channel (defaults to false) */
  alpha?: boolean
  /** Enable shadow maps (defaults to true) */
  shadows?: boolean
  /** Maximum device pixel ratio clamp to protect GPU perf (defaults to 2) */
  maxPixelRatio?: number
  /** Three.js tone mapping operator (defaults to THREE.ACESFilmicToneMapping) */
  toneMapping?: THREE.ToneMapping
  /** Tone mapping exposure value (defaults to 1.0) */
  exposure?: number
  /** Automatically pause engine loops when tab/window is hidden */
  pauseWhenHidden?: boolean
}

/**
 * Core Gamebox 3D Game Engine wrapper around Three.js.
 * Manages the WebGL renderer, scene graph, camera, animation frame loop, and resize handling.
 */
export interface Engine {
  /** The underlying Three.js WebGLRenderer */
  renderer: THREE.WebGLRenderer
  /** The primary 3D scene */
  scene: THREE.Scene
  /** The default perspective camera */
  camera: THREE.PerspectiveCamera
  /** The canvas DOM element rendered to */
  canvas: HTMLCanvasElement
  /** Parent container DOM element holding the canvas */
  container: HTMLElement
  /** Three.js Clock instance (legacy timing) */
  clock: THREE.Clock
  /** Modern Three.js Timer instance with fixed delta support */
  timer: THREE.Timer
  /** Current viewport dimensions in CSS pixels */
  size: { width: number; height: number }
  /** Delta time in seconds since last frame (scaled by timeScale) */
  dt: number
  /** Total elapsed time in seconds since engine start (scaled) */
  elapsed: number
  /** Total elapsed frames rendered */
  frame: number
  /** Smoothed frames-per-second indicator */
  fps: number
  /** Time scaling factor (1.0 = normal, 0.5 = slow motion, 0 = freeze) */
  timeScale: number
  /** True if the animation loop is active */
  readonly running: boolean
  /** True if the engine is currently paused */
  readonly paused: boolean

  /**
   * Register a callback to run on every frame update before rendering.
   * @param fn Callback receiving dt and total elapsed time in seconds.
   * @returns Cleanup function to unregister the listener.
   */
  onUpdate: (fn: (dt: number, elapsed: number) => void) => () => void

  /**
   * Register a callback to run after the primary update and render pass.
   * Useful for camera tracking, HUD alignment, and debug draw.
   * @param fn Callback receiving dt and total elapsed time in seconds.
   * @returns Cleanup function to unregister the listener.
   */
  onLateUpdate: (fn: (dt: number, elapsed: number) => void) => () => void

  /**
   * Register a callback for window/container resize events.
   * @param fn Callback receiving new width and height in pixels.
   * @returns Cleanup function to unregister the listener.
   */
  onResize: (fn: (width: number, height: number) => void) => () => void

  /**
   * Add one or more 3D objects to the active scene.
   * @param objects Three.js Object3D instances to add.
   * @returns The first added object or undefined if empty.
   */
  add: (...objects: THREE.Object3D[]) => THREE.Object3D | undefined

  /**
   * Remove one or more 3D objects from the active scene.
   * @param objects Three.js Object3D instances to remove.
   */
  remove: (...objects: THREE.Object3D[]) => void

  /**
   * Start the requestAnimationFrame render loop.
   * @returns The engine instance for chaining.
   */
  start: () => Engine

  /**
   * Stop the render loop completely.
   */
  stop: () => void

  /**
   * Pause frame updates and simulation without tearing down the renderer.
   */
  pause: () => void

  /**
   * Resume frame updates and simulation from paused state.
   */
  resume: () => void

  /**
   * Set a custom render target or post-processing pipeline (e.g., EffectComposer).
   * Pass null to restore standard direct-to-canvas rendering.
   */
  setRenderTarget: (target: RenderTarget | null) => void

  /**
   * Dispose all engine resources, remove canvas from DOM, and remove all event listeners.
   */
  dispose: () => void
}

// --- Input ------------------------------------------------------------------

/**
 * Mapping of semantic action names to keyboard codes, mouse button codes, or virtual keys.
 * E.g. `{ fire: ["Space", "Mouse0"], boost: ["ShiftLeft"] }`
 */
export type InputActionMap = Record<string, string[]>

/**
 * Configuration options for initializing the InputManager.
 */
export interface InputOptions {
  /** Optional reference to Engine instance */
  engine?: Engine | null
  /** Target DOM element or window to attach keyboard event listeners to */
  target?: Window | HTMLElement
  /** Target DOM element for pointer/mouse listeners (defaults to engine canvas or target) */
  element?: HTMLElement
  /** Custom action bindings mapping action name to array of key/mouse codes */
  actions?: InputActionMap
  /** Enable virtual on-screen analog touch stick on mobile */
  touchStick?: boolean
}

/**
 * Unified Input Manager handling keyboard, mouse, pointer lock, touch, and gamepads.
 */
export interface InputManager {
  /** 2D directional movement vector from WASD/Arrows or touch stick [-1..1, -1..1] */
  move: THREE.Vector2
  /** Pointer delta motion vector (dx, dy) for mouse-look / first-person cameras */
  look: THREE.Vector2
  /** Normalized pointer coordinates in [-1..1] WebGL screen space */
  pointer: THREE.Vector2
  /** Raw pointer coordinates in client CSS pixels */
  pointerPixels: THREE.Vector2
  /** Vertical mouse wheel delta accumulated during the frame */
  wheel: number
  /** Whether the primary pointer/mouse button is currently held down */
  pointerDown: boolean
  /** Whether the browser pointer is currently locked to the canvas */
  locked: boolean
  /** Whether touch input was detected on this device */
  touch: boolean
  /** Index of active gamepad, or null if none connected */
  gamepadIndex: number | null

  /**
   * Returns true if the action or key code is currently held down.
   */
  down: (name: string) => boolean

  /**
   * Returns true only on the exact frame the action or key was first pressed down.
   */
  pressed: (name: string) => boolean

  /**
   * Returns true only on the exact frame the action or key was released.
   */
  released: (name: string) => boolean

  /**
   * Compute a 1D scalar axis value [-1..1] between negative and positive action keys.
   */
  axis: (negative: string, positive: string) => number

  /**
   * Bind or remap a semantic action name to an array of key codes.
   */
  bind: (name: string, codes: string[]) => void

  /**
   * Retrieve list of key codes bound to a semantic action name.
   */
  codes: (name: string) => string[] | undefined

  /**
   * Programmatically simulate a key or button press.
   */
  press: (code: string) => void

  /**
   * Programmatically simulate a key or button release.
   */
  release: (code: string) => void

  /**
   * Request browser pointer lock on the canvas element.
   */
  requestPointerLock: () => Promise<void> | void

  /**
   * Exit browser pointer lock.
   */
  exitPointerLock: () => void

  /**
   * Flush per-frame edge state (pressed / released flags, look delta, wheel).
   * Called automatically at the end of each frame by Engine.
   */
  endFrame: () => void

  /**
   * Poll gamepad inputs at the start of a frame.
   */
  beginFrame?: () => void

  /**
   * Remove all DOM listeners, virtual touch controls, and dispose the input manager.
   */
  dispose: () => void
}

// --- Physics ----------------------------------------------------------------

/**
 * Global physics simulation parameters.
 */
export interface PhysicsOptions {
  /** Gravity acceleration in units/s² (defaults to -20) */
  gravity?: number
  /** Ground deceleration friction factor (defaults to 10) */
  groundFriction?: number
  /** Air resistance deceleration factor (defaults to 1) */
  airFriction?: number
  /** Maximum traversable slope normal Y (defaults to 0.7) */
  maxSlope?: number
}

/**
 * Record of a physical contact between a body and a static collider.
 */
export interface PhysicsContact {
  /** The static collider involved in the collision */
  collider: Collider
  /** The contact normal pointing away from collider surface */
  normal: THREE.Vector3
}

/**
 * Simulated dynamic physics body or trigger zone.
 */
export interface PhysicsBody {
  /** Optional Three.js Object3D whose transform is synchronized with this body */
  object: THREE.Object3D | null
  /** World position of the body */
  position: THREE.Vector3
  /** Linear velocity vector in units/s */
  velocity: THREE.Vector3
  /** Capsule / cylinder collision radius */
  radius: number
  /** Capsule / cylinder total height */
  height: number
  /** Multiplier for global gravity (0 = zero-g, 1 = normal, 2 = heavy) */
  gravityScale: number
  /** Restitution coefficient [0..1] on bounce */
  bounce: number
  /** Friction coefficient on surface contact */
  friction: number
  /** If true, this body acts as a non-solid sensor/trigger zone */
  trigger: boolean
  /** Tag string for collision filtering and category identification */
  tag: string | null
  /** Arbitrary user metadata associated with this body */
  data: Record<string, unknown>
  /** True if the body is currently resting on ground/solid surface */
  grounded: boolean
  /** Y coordinate of current ground surface beneath body */
  groundY: number
  /** Whether the body is enabled and simulated */
  enabled: boolean
  /** List of static colliders currently in contact with this body */
  contacts: PhysicsContact[]
  /** Callback fired on the exact frame the body lands on the ground */
  onLand?: (body: PhysicsBody) => void
  /** Callback fired when another body enters this trigger zone */
  onEnter?: (other: PhysicsBody, trigger: PhysicsBody) => void
  /** Callback fired when another body exits this trigger zone */
  onExit?: (other: PhysicsBody, trigger: PhysicsBody) => void
  [key: string]: unknown
}

/**
 * Creation configuration options for adding a dynamic physics body or trigger.
 */
export interface BodyConfig {
  /** Optional Three.js Object3D to attach and synchronize transform */
  object?: THREE.Object3D | null
  /** Capsule collision radius (defaults to 0.4) */
  radius?: number
  /** Capsule total height (defaults to 1.8) */
  height?: number
  /** Initial position vector or [x, y, z] tuple */
  position?: Vector3Like
  /** Gravity multiplier scale (defaults to 1) */
  gravityScale?: number
  /** Restitution bounce coefficient (defaults to 0) */
  bounce?: number
  /** Surface friction coefficient (defaults to 1) */
  friction?: number
  /** Whether this body is a non-solid trigger zone */
  trigger?: boolean
  /** Tag identifier string */
  tag?: string | null
  /** Arbitrary user metadata dictionary */
  data?: Record<string, unknown>
  /** Landing callback */
  onLand?: (body: PhysicsBody) => void
  /** Trigger enter callback */
  onEnter?: (other: PhysicsBody, trigger: PhysicsBody) => void
  /** Trigger exit callback */
  onExit?: (other: PhysicsBody, trigger: PhysicsBody) => void
  [key: string]: unknown
}

/**
 * Base static collider interface.
 */
export interface BaseCollider {
  type: string
  disabled?: boolean
  [key: string]: unknown
}

/**
 * Axis-aligned bounding box static collider.
 */
export interface BoxCollider extends BaseCollider {
  type: "box"
  box: THREE.Box3
  object: THREE.Object3D | null
}

/**
 * Infinite horizontal ground plane static collider at given Y elevation.
 */
export interface GroundCollider extends BaseCollider {
  type: "ground"
  y: number
}

/**
 * Bounding sphere static collider.
 */
export interface SphereCollider extends BaseCollider {
  type: "sphere"
  center: THREE.Vector3
  radius: number
}

/**
 * Union of all static collider shapes.
 */
export type Collider = BoxCollider | GroundCollider | SphereCollider

/**
 * Raycast intersection result.
 */
export interface RaycastHit {
  /** Hit point in world coordinates */
  point: THREE.Vector3
  /** Surface normal at the hit point */
  normal: THREE.Vector3 | undefined
  /** Hit Three.js object */
  object: THREE.Object3D
  /** Distance from ray origin to hit point */
  distance: number
}

/**
 * Lightweight arcade 3D physics world simulation.
 * Supports static colliders (boxes, planes, spheres), dynamic kinematic/capsule bodies, and trigger zones.
 */
export interface PhysicsWorld {
  /** Global gravity acceleration (negative Y) */
  gravity: number
  /** Array of active static colliders */
  statics: Collider[]
  /** Array of active dynamic simulated bodies */
  bodies: PhysicsBody[]
  /** Array of active trigger sensor zones */
  triggers: PhysicsBody[]

  /**
   * Add a static box collider from a Three.js mesh or an explicit AABB {min, max}.
   */
  addBox: (source: THREE.Object3D | { min: Vector3Like; max: Vector3Like }, extra?: Record<string, unknown>) => BoxCollider

  /**
   * Add an infinite horizontal static ground plane collider at y elevation (defaults to 0).
   */
  addGround: (y?: number, extra?: Record<string, unknown>) => GroundCollider

  /**
   * Add a static sphere collider.
   */
  addSphere: (center: THREE.Vector3 | Vector3Tuple, radius: number, extra?: Record<string, unknown>) => SphereCollider

  /**
   * Traverse a Three.js hierarchy and automatically generate static box colliders for all meshes.
   */
  addArena: (group: THREE.Group) => BoxCollider[]

  /**
   * Remove a static collider from the world.
   */
  removeCollider: (collider: Collider) => void

  /**
   * Create and register a dynamic physics body or trigger.
   */
  addBody: (config?: BodyConfig) => PhysicsBody

  /**
   * Remove a dynamic body or trigger from the world.
   */
  removeBody: (body: PhysicsBody) => void

  /**
   * Step the physics simulation forward by dt seconds.
   */
  step: (dt: number) => void

  /**
   * Test if two bodies' bounding volumes overlap.
   */
  overlaps: (a: PhysicsBody, b: PhysicsBody) => boolean

  /**
   * Query the ground elevation under a specific (x, z) location using raycasting against meshes.
   */
  groundAt: (x: number, z: number, meshes: THREE.Object3D[], from?: number) => number | null

  /**
   * Cast a ray into the scene against candidate meshes.
   */
  raycast: (origin: THREE.Vector3, direction: THREE.Vector3, meshes: THREE.Object3D[], far?: number) => RaycastHit | null
}

// --- Audio ------------------------------------------------------------------

/**
 * Options for initializing the Web Audio synthesizer.
 */
export interface AudioOptions {
  /** Master volume [0..1] (defaults to 0.3) */
  volume?: number
}

/**
 * Configuration options for procedural oscillator tones.
 */
export interface ToneConfig {
  /** Tone frequency in Hz (defaults to 440) */
  frequency?: number
  /** Oscillator waveform type: 'sine', 'square', 'sawtooth', 'triangle' */
  type?: OscillatorType
  /** Duration in seconds (defaults to 0.15) */
  duration?: number
  /** Volume gain [0..1] */
  gain?: number
  /** Target frequency in Hz to slide/pitch-bend towards */
  slide?: number
  /** Attack envelope ramp time in seconds */
  attack?: number
  /** Delay before starting tone in seconds */
  delay?: number
  /** Target AudioNode destination (defaults to master gain) */
  destination?: AudioNode
}

/**
 * Configuration options for procedural filtered noise bursts (explosions, whoosh, hits).
 */
export interface NoiseConfig {
  /** Duration of noise in seconds (defaults to 0.2) */
  duration?: number
  /** Volume gain [0..1] */
  gain?: number
  /** Biquad filter cutoff frequency in Hz (defaults to 800) */
  frequency?: number
  /** Filter type: 'lowpass', 'highpass', 'bandpass' */
  type?: BiquadFilterType
  /** Target cutoff frequency to sweep filter towards */
  sweep?: number
  /** Filter resonance Q value */
  Q?: number
  /** Delay before playing noise in seconds */
  delay?: number
}

/**
 * Audio source node returned by procedural sound generation.
 */
export type SoundOutput = OscillatorNode | AudioBufferSourceNode | void

/**
 * Factory function defining a procedural sound effect.
 */
export type SoundFactory = (config?: SoundPlayConfig) => SoundOutput

/**
 * Playback modification config passed when playing a sound.
 */
export interface SoundPlayConfig {
  /** Pitch multiplier (e.g. 1.5 for higher pitch, 0.8 for lower) */
  pitch?: number
  /** Random pitch variation range (+/-) */
  vary?: number
  [key: string]: unknown
}

/**
 * Procedural background music configuration.
 */
export interface MusicConfig {
  /** Sequence of note frequencies in Hz */
  notes?: number[]
  /** Step tempo in seconds between notes (defaults to 0.2) */
  tempo?: number
  /** Oscillator waveform type (defaults to 'triangle') */
  type?: OscillatorType
  /** Music volume gain [0..1] */
  gain?: number
}

/**
 * Procedural Web Audio synthesizer and SFX manager with zero external asset dependencies.
 */
export interface AudioSystem {
  /** True if audio output is muted */
  muted: boolean

  /**
   * Play a procedural synthesized tone.
   */
  tone: (config?: ToneConfig) => OscillatorNode | undefined

  /**
   * Play a procedural filtered noise burst.
   */
  noise: (config?: NoiseConfig) => AudioBufferSourceNode | undefined

  /** Dictionary of pre-registered sound effect factories */
  sounds: Record<string, SoundFactory>

  /**
   * Play a registered sound effect by name (e.g. 'laser', 'jump', 'hit', 'coin', 'explosion').
   */
  play: (name: string, config?: SoundPlayConfig) => SoundOutput

  /**
   * Register a custom procedural sound factory.
   */
  define: (name: string, factory: SoundFactory) => AudioSystem

  /** Master volume [0..1] */
  volume: number

  /**
   * Set mute state or toggle if parameter omitted.
   */
  mute: (value?: boolean) => AudioSystem

  /**
   * Toggle mute state.
   */
  toggleMute: () => AudioSystem

  /** Background music player */
  music: {
    /** Start looping procedural music */
    start: (config?: MusicConfig) => void
    /** Stop background music */
    stop: () => void
  }

  /** Whether the AudioContext has been initialized and resumed */
  readonly ready: boolean

  /**
   * Unlock AudioContext on first user interaction gesture.
   */
  unlock: () => void

  /**
   * Close AudioContext and clean up resources.
   */
  dispose: () => void
}

// --- Animation & Tweens -----------------------------------------------------

/**
 * Easing function mapping progress [0..1] to eased value.
 */
export type EaseFunction = (t: number) => number

/**
 * Tween configuration options.
 */
export interface TweenOptions<T = object> {
  /** Duration in seconds (defaults to 0.3) */
  duration?: number
  /** Delay in seconds before starting */
  delay?: number
  /** Easing function (defaults to quadOut) */
  ease?: EaseFunction
  /** Per-frame update callback */
  onUpdate?: (eased: number, target: T) => void
  /** Completion callback */
  onComplete?: (target: T) => void
}

/**
 * Promise-like object representing an active tween with a .stop() cancellation method.
 */
export interface TweenPromise<T = object> extends Promise<T> {
  /** Immediately cancel this tween */
  stop: () => void
}

/**
 * Tween manager for animating numbers, objects, and Three.js vectors/colors.
 */
export interface TweenManager {
  /**
   * Tween target object properties toward destination values.
   */
  to: <T extends object>(
    target: T,
    props: { [K in keyof T]?: unknown },
    options?: TweenOptions<T>
  ) => TweenPromise<T>

  /**
   * Tween target object properties from initial values to current values.
   */
  from: <T extends object>(
    target: T,
    props: { [K in keyof T]?: unknown },
    options?: TweenOptions<T>
  ) => TweenPromise<T>

  /**
   * Tween a standalone scalar number from start to end.
   */
  value: (
    from: number,
    to: number,
    options?: TweenOptions<{ v: number }>
  ) => TweenPromise<{ v: number }>

  /**
   * Create a timed delay promise in game-time seconds.
   */
  wait: (seconds: number) => TweenPromise<{ v: number }>

  /**
   * Stop and cancel all currently running tweens.
   */
  stopAll: () => void

  /**
   * Advance all active tweens by dt seconds.
   */
  step: (dt: number) => void
}

/**
 * Playback options for skeletal animation mixer clips.
 */
export interface MixerPlayOptions {
  /** Crossfade transition duration in seconds (defaults to 0.2) */
  fade?: number
  /** Whether the animation clip loops (defaults to true) */
  loop?: boolean
  /** Playback speed multiplier (defaults to 1.0) */
  speed?: number
}

/**
 * Controller for Three.js AnimationMixer managing GLTF skeletal animation clips.
 */
export interface MixerController {
  /** Underlying Three.js AnimationMixer */
  mixer: THREE.AnimationMixer
  /** Map of registered AnimationAction clips by name */
  actions: Map<string, THREE.AnimationAction>
  /** Name of currently playing clip, or null */
  readonly playing: string | null
  /** Array of available animation clip names */
  names: () => string[]
  /** Play or crossfade to an animation clip by name */
  play: (name: string, options?: MixerPlayOptions) => MixerController
  /** Stop playing animation clip */
  stop: (name?: string) => void
  /** Advance mixer simulation by dt seconds */
  update: (dt: number) => THREE.AnimationMixer
  /** Clean up mixer and stop all actions */
  dispose: () => void
}

// --- Particles & FX ---------------------------------------------------------

/**
 * Options for initializing a GPU instanced/points particle system.
 */
export interface ParticleOptions {
  /** Maximum particle capacity in pool (defaults to 500) */
  max?: number
  /** Base particle render size in world units (defaults to 0.3) */
  size?: number
  /** Base particle color (defaults to 0xffaa22) */
  color?: ColorLike
  /** Optional texture sprite for particles */
  texture?: THREE.Texture
  /** Gravity acceleration applied to particles (defaults to -9.8) */
  gravity?: number
  /** WebGL blending mode (defaults to THREE.AdditiveBlending) */
  blending?: THREE.Blending
  /** Three.js parent object to attach points mesh to */
  parent?: THREE.Object3D
}

/**
 * Configuration options for particle burst effects.
 */
export interface BurstConfig {
  /** Particle color or gradient */
  color?: ColorLike
  /** Initial explosion speed (defaults to 4) */
  speed?: number
  /** Direction spread factor [0..1] (defaults to 1 for spherical) */
  spread?: number
  /** Particle lifetime in seconds (defaults to 0.6) */
  lifetime?: number
  /** Particle size multiplier */
  size?: number
  /** Directional velocity bias vector */
  direction?: THREE.Vector3 | null
  /** Air drag deceleration factor (defaults to 1) */
  drag?: number
  /** Gravity multiplier scale (defaults to 1) */
  gravityScale?: number
  /** Number of particles to spawn in this burst (defaults to 20) */
  count?: number
}

/**
 * Configuration options for continuous particle streaming.
 */
export interface StreamConfig extends BurstConfig {
  /** Emission rate in particles per second (defaults to 30) */
  rate?: number
}

/**
 * GPU particle system using THREE.Points and dynamic buffer attributes.
 */
export interface ParticleSystem {
  /** The Three.js Points mesh */
  points: THREE.Points
  /** The shader material rendering particles */
  material: THREE.ShaderMaterial

  /**
   * Spawn an instantaneous burst of particles at position.
   */
  burst: (position: Vector3Like, config?: BurstConfig) => ParticleSystem

  /**
   * Continuously emit particles at position over dt seconds.
   */
  stream: (position: Vector3Like, dt: number, config?: StreamConfig) => ParticleSystem

  /**
   * Spawn directional spray particles along a velocity vector.
   */
  spray: (position: Vector3Like, direction: THREE.Vector3, config?: BurstConfig) => ParticleSystem

  /**
   * Spawn gentle rising smoke/puff particles.
   */
  smoke: (position: Vector3Like, config?: BurstConfig) => ParticleSystem

  /**
   * Clear all active particles immediately.
   */
  clear: () => void

  /**
   * Remove mesh from scene and dispose geometry and material.
   */
  dispose: () => void

  /** Internal particle debt accumulator for continuous streams */
  _debt?: number
}

// --- HUD --------------------------------------------------------------------

/**
 * Screen anchor positions for HUD elements.
 */
export type HudCornerName =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

/**
 * Configuration options for HUD numerical stats.
 */
export interface StatOptions {
  /** Anchor corner (defaults to 'top-left') */
  at?: HudCornerName
  /** Custom formatter function (defaults to integer round) */
  format?: (value: number) => string
  /** Animate scale bump on value change (defaults to true) */
  bump?: boolean
}

/**
 * Numerical HUD stat display with animated punch on change.
 */
export interface HudStat {
  element: HTMLDivElement
  /** Current numerical value */
  readonly value: number
  /** Set value directly */
  set: (next: number) => void
  /** Add delta to current value */
  add: (delta: number) => void
  /** Update the label text */
  setLabel: (next: string) => void
  /** Remove element from HUD */
  remove: () => void
}

/**
 * Configuration options for HUD progress/health bars.
 */
export interface BarOptions {
  /** Anchor corner (defaults to 'top-left') */
  at?: HudCornerName
  /** Initial fill value (defaults to 100) */
  value?: number
  /** Maximum value (defaults to 100) */
  max?: number
  /** Primary bar color CSS string (defaults to green '#22c55e') */
  color?: string
  /** Color when below danger threshold (defaults to red '#ef4444') */
  dangerColor?: string
  /** Normalized fraction [0..1] below which danger color activates (defaults to 0.25) */
  dangerBelow?: number
}

/**
 * Progress/health bar HUD component.
 */
export interface HudBar {
  element: HTMLDivElement
  /** Maximum capacity */
  max: number
  /** Set current fill value */
  set: (next: number) => HudBar
  /** Update label text */
  setLabel: (next: string) => void
  /** Remove element from HUD */
  remove: () => void
}

/**
 * Options for generic HUD text display.
 */
export interface TextOptions {
  /** Anchor corner (defaults to 'top-center') */
  at?: HudCornerName
}

/**
 * Text block HUD component.
 */
export interface HudText {
  element: HTMLDivElement
  /** Set text content */
  set: (next: string) => void
  /** Remove element from HUD */
  remove: () => void
}

/**
 * Action button inside an overlay modal.
 */
export interface OverlayButton {
  /** Button label */
  label: string
  /** Click handler */
  onClick?: () => void
  /** Visual variant ('primary', 'ghost', 'danger') */
  variant?: string
  /** If true, clicking this button does not auto-close the overlay */
  keepOpen?: boolean
}

/**
 * Options for modal overlay dialogs (e.g. Game Over, Victory, Pause).
 */
export interface OverlayOptions {
  /** Overlay heading title */
  title?: string
  /** Body descriptive text */
  body?: string
  /** List of action buttons */
  buttons?: OverlayButton[]
  /** Allow clicking backdrop to dismiss (defaults to false) */
  dismissible?: boolean
}

/**
 * Fullscreen modal overlay component.
 */
export interface HudOverlay {
  element: HTMLDivElement
  /** Close and remove overlay */
  close: () => void
}

/**
 * Options for HUD buttons.
 */
export interface ButtonOptions {
  /** Anchor corner (defaults to 'top-right') */
  at?: HudCornerName
  /** Button style variant */
  variant?: string
}

/**
 * Interactive button HUD component.
 */
export interface HudButton {
  element: HTMLButtonElement
  /** Remove element from HUD */
  remove: () => void
}

/**
 * First-person center crosshair HUD component.
 */
export interface HudCrosshair {
  element: HTMLDivElement
  /** Show crosshair */
  show: () => void
  /** Hide crosshair */
  hide: () => void
  /** Remove element from HUD */
  remove: () => void
}

/**
 * Options for keyboard shortcut legend display.
 */
export interface KeysOptions {
  /** Anchor corner (defaults to 'bottom-left') */
  at?: HudCornerName
}

/**
 * Keyboard controls legend display HUD component.
 */
export interface HudKeys {
  element: HTMLDivElement
  /** Remove element from HUD */
  remove: () => void
}

/**
 * Options for mobile on-screen touch buttons.
 */
export interface TouchButtonsOptions {
  /** Anchor corner (defaults to 'bottom-right') */
  at?: HudCornerName
  /** Only render if touch device is detected (defaults to true) */
  onlyOnTouch?: boolean
}

/**
 * Mobile on-screen action buttons component.
 */
export interface HudTouchButtons {
  element?: HTMLElement
  /** Remove touch buttons */
  remove: () => void
}

/**
 * Options for screen flash effects.
 */
export interface FlashOptions {
  /** Flash duration in seconds (defaults to 0.3) */
  duration?: number
  /** Peak opacity [0..1] (defaults to 0.6) */
  opacity?: number
}

/**
 * Options for 3D world-space floating markers projected to HUD.
 */
export interface MarkerOptions {
  /** Optional CSS class name */
  className?: string
  /** Vertical offset in world units above target position (defaults to 1) */
  offsetY?: number
}

/**
 * 3D world-space target marker projected onto HUD 2D screen space.
 */
export interface HudMarker {
  element: HTMLDivElement
  /** Set marker text content */
  set: (next: string) => string
  /** Update 2D screen projection from target 3D world transform */
  update: () => void
  /** Remove marker */
  remove: () => void
}

/**
 * Comprehensive HUD (Heads-Up Display) manager rendering responsive, notch-safe 2D UI elements over the 3D canvas.
 */
export interface HudManager {
  /** Root container DOM element */
  root: HTMLDivElement

  /** Get corner container element by anchor name */
  corner: (name: HudCornerName) => HTMLElement

  /** Create an animated numerical stat widget */
  stat: (label: string, value?: number, options?: StatOptions) => HudStat

  /** Create a progress / health bar */
  bar: (label: string, options?: BarOptions) => HudBar

  /** Create a formatted text element */
  text: (content?: string, options?: TextOptions) => HudText

  /** Display a transient floating toast message */
  toast: (message: string, options?: { at?: HudCornerName; duration?: number }) => HTMLDivElement

  /** Display a large prominent center banner message */
  banner: (message: string, options?: { duration?: number }) => HTMLDivElement

  /** Show a modal overlay (e.g. Game Over, Win, Pause) */
  overlay: (options?: OverlayOptions) => HudOverlay

  /** Create a clickable HUD button */
  button: (label: string, onClick: (event: MouseEvent) => void, options?: ButtonOptions) => HudButton

  /** Create a center screen crosshair for first-person targeting */
  crosshair: () => HudCrosshair

  /** Render keyboard controls legend */
  keys: (pairs: Record<string, string>, options?: KeysOptions) => HudKeys

  /** Render on-screen touch action buttons for mobile */
  touchButtons: (buttons: Record<string, string>, input?: InputManager, options?: TouchButtonsOptions) => HudTouchButtons

  /** Trigger a full-screen flash effect (damage red, item pickup white, etc.) */
  flash: (color?: string, options?: FlashOptions) => HTMLDivElement

  /** Attach a floating HUD marker that tracks a 3D Object3D position */
  marker: (engine: Engine, target: THREE.Object3D, content: string, options?: MarkerOptions) => HudMarker

  /** Remove all HUD elements from all corners */
  clear: () => void

  /** Remove root HUD container from DOM */
  remove: () => void
}

// --- State & Storage --------------------------------------------------------

/**
 * State lifecycle hook definition for a state machine.
 */
export interface StateDefinition<TContext = unknown> {
  /** Hook fired when entering this state */
  enter?: (payload: unknown, machine: StateMachine<TContext>) => void
  /** Hook fired on every frame update while in this state */
  update?: (dt: number, machine: StateMachine<TContext>) => void
  /** Hook fired when exiting this state */
  exit?: (payload: unknown, machine: StateMachine<TContext>) => void
}

/**
 * Dictionary of named state definitions in a state machine.
 */
export type StateMachineDefinition<TContext = unknown> = Record<string, StateDefinition<TContext>>

/**
 * Finite State Machine for game loops, player states, AI behaviors, and scene transitions.
 */
export interface StateMachine<TContext = unknown> {
  /** States dictionary */
  states: StateMachineDefinition<TContext>

  /** Register an event listener for state changes */
  on: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void

  /** Currently active state name, or null if none */
  readonly current: string | null

  /** Time in seconds spent in the current state */
  readonly time: number

  /** Check if current state matches name */
  is: (name: string) => boolean

  /** Transition to a new state with optional payload */
  go: (name: string, payload?: unknown) => StateMachine<TContext>

  /** Update active state logic */
  update: (dt: number) => void
}

/**
 * Configuration options for ScoreTracker.
 */
export interface ScoreOptions {
  /** LocalStorage key for persisting high scores */
  key?: string
  /** Initial starting score (defaults to 0) */
  initial?: number
  /** Optional HUD manager to automatically bind a stat counter */
  hud?: HudManager | null
  /** HUD label name (defaults to 'SCORE') */
  label?: string
}

/**
 * Score tracking utility with high score persistence and automatic HUD synchronization.
 */
export interface ScoreTracker {
  /** Register change event listener */
  on: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void

  /** Current score value */
  readonly value: number

  /** All-time best high score */
  readonly best: number

  /** Add points to score */
  add: (amount?: number) => ScoreTracker

  /** Set score directly */
  set: (next: number) => ScoreTracker

  /** Reset score to 0 */
  reset: () => ScoreTracker
}

/**
 * Safe local storage wrapper with JSON serialization and memory fallback for iframe sandboxes.
 */
export interface StorageTracker {
  /** Retrieve a stored item, or fallback value if not present */
  get: <T = unknown>(key: string, fallback?: T) => T

  /** Store an item value */
  set: <T = unknown>(key: string, value: T) => T

  /** Remove a stored item */
  remove: (key: string) => void

  /** Clear all stored items */
  clear: () => void
}

/**
 * Options for countdown/countup game timer.
 */
export interface TimerOptions {
  /** Starting duration in seconds. If provided, timer counts down to 0; if null/omitted, counts up */
  duration?: number | null
  /** Optional HUD manager to automatically display a time counter */
  hud?: HudManager | null
  /** HUD label name (defaults to 'TIME') */
  label?: string
  /** Callback fired when countdown timer reaches 0 */
  onEnd?: (() => void) | null
  /** Custom time string formatter function */
  format?: (seconds: number) => string
}

/**
 * Game timer utility supporting count-down and count-up with HUD sync.
 */
export interface GameTimer {
  /** Current timer value in seconds */
  readonly time: number

  /** True if countdown reached 0 */
  readonly done: boolean

  /** Start or unpause timer */
  start: () => void

  /** Pause timer */
  pause: () => void

  /** Reset timer to initial duration */
  reset: (to?: number) => void

  /** Add or subtract seconds to timer */
  add: (seconds: number) => void

  /** Advance timer by dt seconds */
  update: (dt: number) => void
}

/**
 * Options for difficulty scaling.
 */
export interface DifficultyOptions {
  /** Time in seconds to reach maximum difficulty (defaults to 120) */
  rampSeconds?: number
  /** Custom curve function mapping [0..1] time progress to difficulty factor (defaults to linear) */
  curve?: (t: number) => number
  /** Maximum difficulty cap (defaults to 1) */
  max?: number
}

/**
 * Difficulty scaling tracker that smoothly ramps from 0 to 1 over time.
 */
export interface DifficultyTracker {
  /** Current difficulty factor [0..max] */
  readonly level: number

  /** Interpolate a parameter value between from and to based on current difficulty level */
  between: (from: number, to: number) => number

  /** Advance difficulty timer by dt seconds */
  update: (dt: number) => void

  /** Reset difficulty timer back to 0 */
  reset: () => void
}

/**
 * Fixed-interval repeating trigger (e.g. enemy spawner, weapon fire rate).
 */
export interface Ticker {
  /** Interval in seconds between triggers */
  interval: number

  /** Advance ticker by dt seconds and execute callback when interval elapses */
  update: (dt: number) => void

  /** Reset ticker accumulation */
  reset: () => void
}

/**
 * Cooldown timer for abilities, weapons, and actions.
 */
export interface Cooldown {
  /** Time remaining in seconds before ready */
  readonly remaining: number

  /** Normalized cooldown progress fraction [0..1], 1 when fully ready */
  readonly progress: number

  /** Check if cooldown has finished and action can be used */
  ready: () => boolean

  /** Trigger the cooldown */
  use: () => void

  /** Advance cooldown timer by dt seconds */
  update: (dt: number) => void
}

/**
 * Event handler callback signature.
 */
export type EventHandler<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void

/**
 * Publish/subscribe event bus for decoupled communication between game systems.
 */
export interface EventBus {
  /** Subscribe to an event */
  on: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void

  /** Subscribe to an event for one trigger only */
  once: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void

  /** Emit an event with arguments */
  emit: (event: string, ...args: unknown[]) => void

  /** Unsubscribe all listeners for an event */
  off: (event: string) => void
}

// --- High-Level Game --------------------------------------------------------

/**
 * Options for high-level createGame() bootstrap.
 */
export interface GameOptions extends EngineOptions {
  /** Action mapping for InputManager */
  actions?: InputActionMap
  /** HUD configuration */
  hud?: { container?: HTMLElement }
}

/**
 * High-level arcade game bundle returned by createGame().
 * Packages Engine, Input, HUD, Audio, Tweens, and Three.js scene/camera/renderer into a unified API.
 */
export interface Game {
  /** The 3D game engine instance */
  engine: Engine
  /** Unified input manager */
  input: InputManager
  /** Heads-up display manager */
  hud: HudManager
  /** Procedural audio synthesizer */
  audio: AudioSystem
  /** Tween and animation manager */
  tweens: TweenManager
  /** Three.js 3D scene */
  scene: THREE.Scene
  /** Three.js perspective camera */
  camera: THREE.PerspectiveCamera
  /** Three.js WebGL renderer */
  renderer: THREE.WebGLRenderer
  /** Shortcut to engine.onUpdate */
  onUpdate: Engine["onUpdate"]
  /** Shortcut to engine.onLateUpdate */
  onLateUpdate: Engine["onLateUpdate"]
  /** Shortcut to engine.onResize */
  onResize: Engine["onResize"]
  /** Shortcut to engine.add */
  add: Engine["add"]
  /** Shortcut to engine.remove */
  remove: Engine["remove"]
}

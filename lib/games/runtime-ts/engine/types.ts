import * as THREE from "three"

// --- Common 3D Types --------------------------------------------------------

export type Vector3Tuple = [x: number, y: number, z: number]
export type Vector2Tuple = [x: number, y: number]
export type Vector3Like = THREE.Vector3 | Vector3Tuple | { x: number; y: number; z: number }
export type Vector2Like = THREE.Vector2 | Vector2Tuple | { x: number; y: number }
export type ColorLike = THREE.ColorRepresentation

// --- Engine -----------------------------------------------------------------

export interface RenderTarget {
  render: () => void
  setSize?: (width: number, height: number) => void
}

export interface FogConfig {
  color?: ColorLike
  near?: number
  far?: number
}

export interface EngineOptions {
  container?: HTMLElement
  background?: ColorLike | null
  fog?: number | FogConfig | null
  fov?: number
  near?: number
  far?: number
  cameraPosition?: Vector3Like
  lookAt?: Vector3Like
  antialias?: boolean
  alpha?: boolean
  shadows?: boolean
  maxPixelRatio?: number
  toneMapping?: THREE.ToneMapping
  exposure?: number
  pauseWhenHidden?: boolean
}

export interface Engine {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  container: HTMLElement
  clock: THREE.Clock
  timer: THREE.Timer
  size: { width: number; height: number }
  dt: number
  elapsed: number
  frame: number
  fps: number
  timeScale: number
  readonly running: boolean
  readonly paused: boolean
  onUpdate: (fn: (dt: number, elapsed: number) => void) => () => void
  onLateUpdate: (fn: (dt: number, elapsed: number) => void) => () => void
  onResize: (fn: (width: number, height: number) => void) => () => void
  add: (...objects: THREE.Object3D[]) => THREE.Object3D | undefined
  remove: (...objects: THREE.Object3D[]) => void
  start: () => Engine
  stop: () => void
  pause: () => void
  resume: () => void
  setRenderTarget: (target: RenderTarget | null) => void
  dispose: () => void
}

// --- Input ------------------------------------------------------------------

export type InputActionMap = Record<string, string[]>

export interface InputOptions {
  engine?: Engine | null
  target?: Window | HTMLElement
  element?: HTMLElement
  actions?: InputActionMap
  touchStick?: boolean
}

export interface InputManager {
  move: THREE.Vector2
  look: THREE.Vector2
  pointer: THREE.Vector2
  pointerPixels: THREE.Vector2
  wheel: number
  pointerDown: boolean
  locked: boolean
  touch: boolean
  gamepadIndex: number | null
  down: (name: string) => boolean
  pressed: (name: string) => boolean
  released: (name: string) => boolean
  axis: (negative: string, positive: string) => number
  bind: (name: string, codes: string[]) => void
  codes: (name: string) => string[] | undefined
  press: (code: string) => void
  release: (code: string) => void
  requestPointerLock: () => Promise<void> | void
  exitPointerLock: () => void
  endFrame: () => void
  beginFrame?: () => void
  dispose: () => void
}

// --- Physics ----------------------------------------------------------------

export interface PhysicsOptions {
  gravity?: number
  groundFriction?: number
  airFriction?: number
  maxSlope?: number
}

export interface PhysicsContact {
  collider: Collider
  normal: THREE.Vector3
}

export interface PhysicsBody {
  object: THREE.Object3D | null
  position: THREE.Vector3
  velocity: THREE.Vector3
  radius: number
  height: number
  gravityScale: number
  bounce: number
  friction: number
  trigger: boolean
  tag: string | null
  data: Record<string, unknown>
  grounded: boolean
  groundY: number
  enabled: boolean
  contacts: PhysicsContact[]
  onLand?: (body: PhysicsBody) => void
  onEnter?: (other: PhysicsBody, trigger: PhysicsBody) => void
  onExit?: (other: PhysicsBody, trigger: PhysicsBody) => void
  [key: string]: unknown
}

export interface BodyConfig {
  object?: THREE.Object3D | null
  radius?: number
  height?: number
  position?: Vector3Like
  gravityScale?: number
  bounce?: number
  friction?: number
  trigger?: boolean
  tag?: string | null
  data?: Record<string, unknown>
  onLand?: (body: PhysicsBody) => void
  onEnter?: (other: PhysicsBody, trigger: PhysicsBody) => void
  onExit?: (other: PhysicsBody, trigger: PhysicsBody) => void
  [key: string]: unknown
}

export interface BaseCollider {
  type: string
  disabled?: boolean
  [key: string]: unknown
}

export interface BoxCollider extends BaseCollider {
  type: "box"
  box: THREE.Box3
  object: THREE.Object3D | null
}

export interface GroundCollider extends BaseCollider {
  type: "ground"
  y: number
}

export interface SphereCollider extends BaseCollider {
  type: "sphere"
  center: THREE.Vector3
  radius: number
}

export type Collider = BoxCollider | GroundCollider | SphereCollider

export interface RaycastHit {
  point: THREE.Vector3
  normal: THREE.Vector3 | undefined
  object: THREE.Object3D
  distance: number
}

export interface PhysicsWorld {
  gravity: number
  statics: Collider[]
  bodies: PhysicsBody[]
  triggers: PhysicsBody[]
  addBox: (source: THREE.Object3D | { min: Vector3Like; max: Vector3Like }, extra?: Record<string, unknown>) => BoxCollider
  addGround: (y?: number, extra?: Record<string, unknown>) => GroundCollider
  addSphere: (center: THREE.Vector3 | Vector3Tuple, radius: number, extra?: Record<string, unknown>) => SphereCollider
  addArena: (group: THREE.Group) => BoxCollider[]
  removeCollider: (collider: Collider) => void
  addBody: (config?: BodyConfig) => PhysicsBody
  removeBody: (body: PhysicsBody) => void
  step: (dt: number) => void
  overlaps: (a: PhysicsBody, b: PhysicsBody) => boolean
  groundAt: (x: number, z: number, meshes: THREE.Object3D[], from?: number) => number | null
  raycast: (origin: THREE.Vector3, direction: THREE.Vector3, meshes: THREE.Object3D[], far?: number) => RaycastHit | null
}

// --- Audio ------------------------------------------------------------------

export interface AudioOptions {
  volume?: number
}

export interface ToneConfig {
  frequency?: number
  type?: OscillatorType
  duration?: number
  gain?: number
  slide?: number
  attack?: number
  delay?: number
  destination?: AudioNode
}

export interface NoiseConfig {
  duration?: number
  gain?: number
  frequency?: number
  type?: BiquadFilterType
  sweep?: number
  Q?: number
  delay?: number
}

export type SoundOutput = OscillatorNode | AudioBufferSourceNode | void

export type SoundFactory = (config?: SoundPlayConfig) => SoundOutput

export interface SoundPlayConfig {
  pitch?: number
  vary?: number
  [key: string]: unknown
}

export interface MusicConfig {
  notes?: number[]
  tempo?: number
  type?: OscillatorType
  gain?: number
}

export interface AudioSystem {
  muted: boolean
  tone: (config?: ToneConfig) => OscillatorNode | undefined
  noise: (config?: NoiseConfig) => AudioBufferSourceNode | undefined
  sounds: Record<string, SoundFactory>
  play: (name: string, config?: SoundPlayConfig) => SoundOutput
  define: (name: string, factory: SoundFactory) => AudioSystem
  volume: number
  mute: (value?: boolean) => AudioSystem
  toggleMute: () => AudioSystem
  music: {
    start: (config?: MusicConfig) => void
    stop: () => void
  }
  readonly ready: boolean
  unlock: () => void
  dispose: () => void
}

// --- Animation & Tweens -----------------------------------------------------

export type EaseFunction = (t: number) => number

export interface TweenOptions<T = object> {
  duration?: number
  delay?: number
  ease?: EaseFunction
  onUpdate?: (eased: number, target: T) => void
  onComplete?: (target: T) => void
}

export interface TweenPromise<T = object> extends Promise<T> {
  stop: () => void
}

export interface TweenManager {
  to: <T extends object>(
    target: T,
    props: { [K in keyof T]?: unknown },
    options?: TweenOptions<T>
  ) => TweenPromise<T>
  from: <T extends object>(
    target: T,
    props: { [K in keyof T]?: unknown },
    options?: TweenOptions<T>
  ) => TweenPromise<T>
  value: (
    from: number,
    to: number,
    options?: TweenOptions<{ v: number }>
  ) => TweenPromise<{ v: number }>
  wait: (seconds: number) => TweenPromise<{ v: number }>
  stopAll: () => void
  step: (dt: number) => void
}

export interface MixerPlayOptions {
  fade?: number
  loop?: boolean
  speed?: number
}

export interface MixerController {
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  readonly playing: string | null
  names: () => string[]
  play: (name: string, options?: MixerPlayOptions) => MixerController
  stop: (name?: string) => void
  update: (dt: number) => THREE.AnimationMixer
  dispose: () => void
}

// --- Particles & FX ---------------------------------------------------------

export interface ParticleOptions {
  max?: number
  size?: number
  color?: ColorLike
  texture?: THREE.Texture
  gravity?: number
  blending?: THREE.Blending
  parent?: THREE.Object3D
}

export interface BurstConfig {
  color?: ColorLike
  speed?: number
  spread?: number
  lifetime?: number
  size?: number
  direction?: THREE.Vector3 | null
  drag?: number
  gravityScale?: number
  count?: number
}

export interface StreamConfig extends BurstConfig {
  rate?: number
}

export interface ParticleSystem {
  points: THREE.Points
  material: THREE.ShaderMaterial
  burst: (position: Vector3Like, config?: BurstConfig) => ParticleSystem
  stream: (position: Vector3Like, dt: number, config?: StreamConfig) => ParticleSystem
  spray: (position: Vector3Like, direction: THREE.Vector3, config?: BurstConfig) => ParticleSystem
  smoke: (position: Vector3Like, config?: BurstConfig) => ParticleSystem
  clear: () => void
  dispose: () => void
  _debt?: number
}

// --- HUD --------------------------------------------------------------------

export type HudCornerName =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

export interface StatOptions {
  at?: HudCornerName
  format?: (value: number) => string
  bump?: boolean
}

export interface HudStat {
  element: HTMLDivElement
  readonly value: number
  set: (next: number) => void
  add: (delta: number) => void
  setLabel: (next: string) => void
  remove: () => void
}

export interface BarOptions {
  at?: HudCornerName
  value?: number
  max?: number
  color?: string
  dangerColor?: string
  dangerBelow?: number
}

export interface HudBar {
  element: HTMLDivElement
  max: number
  set: (next: number) => HudBar
  setLabel: (next: string) => void
  remove: () => void
}

export interface TextOptions {
  at?: HudCornerName
}

export interface HudText {
  element: HTMLDivElement
  set: (next: string) => void
  remove: () => void
}

export interface OverlayButton {
  label: string
  onClick?: () => void
  variant?: string
  keepOpen?: boolean
}

export interface OverlayOptions {
  title?: string
  body?: string
  buttons?: OverlayButton[]
  dismissible?: boolean
}

export interface HudOverlay {
  element: HTMLDivElement
  close: () => void
}

export interface ButtonOptions {
  at?: HudCornerName
  variant?: string
}

export interface HudButton {
  element: HTMLButtonElement
  remove: () => void
}

export interface HudCrosshair {
  element: HTMLDivElement
  show: () => void
  hide: () => void
  remove: () => void
}

export interface KeysOptions {
  at?: HudCornerName
}

export interface HudKeys {
  element: HTMLDivElement
  remove: () => void
}

export interface TouchButtonsOptions {
  at?: HudCornerName
  onlyOnTouch?: boolean
}

export interface HudTouchButtons {
  element?: HTMLElement
  remove: () => void
}

export interface FlashOptions {
  duration?: number
  opacity?: number
}

export interface MarkerOptions {
  className?: string
  offsetY?: number
}

export interface HudMarker {
  element: HTMLDivElement
  set: (next: string) => string
  update: () => void
  remove: () => void
}

export interface HudManager {
  root: HTMLDivElement
  corner: (name: HudCornerName) => HTMLElement
  stat: (label: string, value?: number, options?: StatOptions) => HudStat
  bar: (label: string, options?: BarOptions) => HudBar
  text: (content?: string, options?: TextOptions) => HudText
  toast: (message: string, options?: { at?: HudCornerName; duration?: number }) => HTMLDivElement
  banner: (message: string, options?: { duration?: number }) => HTMLDivElement
  overlay: (options?: OverlayOptions) => HudOverlay
  button: (label: string, onClick: (event: MouseEvent) => void, options?: ButtonOptions) => HudButton
  crosshair: () => HudCrosshair
  keys: (pairs: Record<string, string>, options?: KeysOptions) => HudKeys
  touchButtons: (buttons: Record<string, string>, input?: InputManager, options?: TouchButtonsOptions) => HudTouchButtons
  flash: (color?: string, options?: FlashOptions) => HTMLDivElement
  marker: (engine: Engine, target: THREE.Object3D, content: string, options?: MarkerOptions) => HudMarker
  clear: () => void
  remove: () => void
}

// --- State & Storage --------------------------------------------------------

export interface StateDefinition<TContext = unknown> {
  enter?: (payload: unknown, machine: StateMachine<TContext>) => void
  update?: (dt: number, machine: StateMachine<TContext>) => void
  exit?: (payload: unknown, machine: StateMachine<TContext>) => void
}

export type StateMachineDefinition<TContext = unknown> = Record<string, StateDefinition<TContext>>

export interface StateMachine<TContext = unknown> {
  states: StateMachineDefinition<TContext>
  on: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void
  readonly current: string | null
  readonly time: number
  is: (name: string) => boolean
  go: (name: string, payload?: unknown) => StateMachine<TContext>
  update: (dt: number) => void
}

export interface ScoreOptions {
  key?: string
  initial?: number
  hud?: HudManager | null
  label?: string
}

export interface ScoreTracker {
  on: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void
  readonly value: number
  readonly best: number
  add: (amount?: number) => ScoreTracker
  set: (next: number) => ScoreTracker
  reset: () => ScoreTracker
}

export interface StorageTracker {
  get: <T = unknown>(key: string, fallback?: T) => T
  set: <T = unknown>(key: string, value: T) => T
  remove: (key: string) => void
  clear: () => void
}

export interface TimerOptions {
  duration?: number | null
  hud?: HudManager | null
  label?: string
  onEnd?: (() => void) | null
  format?: (seconds: number) => string
}

export interface GameTimer {
  readonly time: number
  readonly done: boolean
  start: () => void
  pause: () => void
  reset: (to?: number) => void
  add: (seconds: number) => void
  update: (dt: number) => void
}

export interface DifficultyOptions {
  rampSeconds?: number
  curve?: (t: number) => number
  max?: number
}

export interface DifficultyTracker {
  readonly level: number
  between: (from: number, to: number) => number
  update: (dt: number) => void
  reset: () => void
}

export interface Ticker {
  interval: number
  update: (dt: number) => void
  reset: () => void
}

export interface Cooldown {
  readonly remaining: number
  readonly progress: number
  ready: () => boolean
  use: () => void
  update: (dt: number) => void
}

export type EventHandler<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => void

export interface EventBus {
  on: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void
  once: <TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>) => () => void
  emit: (event: string, ...args: unknown[]) => void
  off: (event: string) => void
}

// --- High-Level Game --------------------------------------------------------

export interface GameOptions extends EngineOptions {
  actions?: InputActionMap
  hud?: { container?: HTMLElement }
}

export interface Game {
  engine: Engine
  input: InputManager
  hud: HudManager
  audio: AudioSystem
  tweens: TweenManager
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  onUpdate: Engine["onUpdate"]
  onLateUpdate: Engine["onLateUpdate"]
  onResize: Engine["onResize"]
  add: Engine["add"]
  remove: Engine["remove"]
}

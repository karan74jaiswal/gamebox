import * as THREE from "three"

import type { InputActionMap, InputManager, InputOptions } from "./types.js"
import { deadzone } from "./math.js"

/**
 * Keyboard, mouse, touch and gamepad behind one per-frame snapshot.
 *
 * Games ask questions ("is the player holding left?", "did they just jump?"),
 * they don't want events. Listening directly to keydown loses the difference
 * between held and just-pressed, and repeats at the OS key-repeat rate, which
 * is why a jump wired to keydown either double-jumps or feels sticky.
 *
 *   const input = createInput({ engine, actions: { jump: ["Space", "KeyW"] } })
 *   if (input.pressed("jump")) player.jump()
 *   player.x += input.move.x * speed * dt
 *
 * Pass `engine` and the frame bookkeeping happens on its own. Without one, call
 * `input.endFrame()` yourself after your update, or `pressed` never clears.
 */

const DEFAULT_ACTIONS: InputActionMap = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  jump: ["Space"],
  fire: ["Mouse0", "Enter"],
  sprint: ["ShiftLeft", "ShiftRight"],
  crouch: ["ControlLeft", "KeyC"],
  pause: ["Escape", "KeyP"],
  restart: ["KeyR"],
}

export function createInput(options: InputOptions = {}): InputManager {
  const {
    engine = null,
    target = typeof window !== "undefined" ? window : ({} as Window),
    element = engine?.canvas ?? (typeof document !== "undefined" ? document.body : ({} as HTMLElement)),
    actions = {},
    touchStick = true,
  } = options

  const bindings: InputActionMap = { ...DEFAULT_ACTIONS, ...actions }

  const held = new Set<string>()
  const justPressed = new Set<string>()
  const justReleased = new Set<string>()

  const isCoarsePointer =
    typeof matchMedia === "function"
      ? matchMedia("(pointer: coarse)").matches
      : false

  const input: InputManager = {
    /** Left stick as a normalised -1..1 vector. WASD, arrows, stick or thumb. */
    move: new THREE.Vector2(),
    /** Mouse/touch travel since the last frame. Pointer-lock look uses this. */
    look: new THREE.Vector2(),
    /** Pointer in -1..1 clip space, ready for `raycaster.setFromCamera`. */
    pointer: new THREE.Vector2(),
    /** Pointer in css pixels within the canvas, for placing DOM over the world. */
    pointerPixels: new THREE.Vector2(),
    wheel: 0,
    pointerDown: false,
    locked: false,
    touch: isCoarsePointer,
    gamepadIndex: null,
    down: () => false,
    pressed: () => false,
    released: () => false,
    axis: () => 0,
    bind: () => {},
    codes: () => undefined,
    press: () => {},
    release: () => {},
    requestPointerLock: () => {},
    exitPointerLock: () => {},
    endFrame: () => {},
    dispose: () => {},
  }

  // --- Queries --------------------------------------------------------------

  const codesFor = (name: string): string[] => bindings[name] ?? [name]

  /** True for every frame the control is held. */
  input.down = (name: string): boolean =>
    codesFor(name).some((code) => held.has(code))

  /** True on the single frame it went down — jumps, shots, menu choices. */
  input.pressed = (name: string): boolean =>
    codesFor(name).some((code) => justPressed.has(code))

  /** True on the single frame it came up — charge shots, hold-to-aim. */
  input.released = (name: string): boolean =>
    codesFor(name).some((code) => justReleased.has(code))

  /** -1, 0 or 1 from a pair of controls, for stepwise movement. */
  input.axis = (negative: string, positive: string): number =>
    (input.down(positive) ? 1 : 0) - (input.down(negative) ? 1 : 0)

  /** Adds or replaces a binding at runtime: `input.bind("dash", ["KeyQ"])`. */
  input.bind = (name: string, codes: string[]): void => {
    bindings[name] = codes
  }

  /** The codes an action currently listens for, for extending a binding. */
  input.codes = (name: string): string[] | undefined => bindings[name]

  input.press = (code: string): void => {
    if (!held.has(code)) justPressed.add(code)
    held.add(code)
  }

  input.release = (code: string): void => {
    held.delete(code)
    justReleased.add(code)
  }

  // --- Keyboard -------------------------------------------------------------

  function onKeyDown(event: KeyboardEvent) {
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        event.code
      )
    ) {
      event.preventDefault()
    }
    if (event.repeat) return
    if (!held.has(event.code)) justPressed.add(event.code)
    held.add(event.code)
  }

  function onKeyUp(event: KeyboardEvent) {
    held.delete(event.code)
    justReleased.add(event.code)
  }

  function onBlur() {
    for (const code of held) justReleased.add(code)
    held.clear()
  }

  target.addEventListener("keydown", onKeyDown as EventListener)
  target.addEventListener("keyup", onKeyUp as EventListener)
  if (typeof window !== "undefined") {
    window.addEventListener("blur", onBlur)
  }

  // --- Pointer --------------------------------------------------------------

  function updatePointer(event: MouseEvent) {
    const rect = element.getBoundingClientRect()
    input.pointerPixels.set(event.clientX - rect.left, event.clientY - rect.top)
    input.pointer.set(
      (input.pointerPixels.x / (rect.width || 1)) * 2 - 1,
      -(input.pointerPixels.y / (rect.height || 1)) * 2 + 1
    )
  }

  function onPointerDown(event: PointerEvent) {
    updatePointer(event)
    const code = `Mouse${event.button}`
    if (!held.has(code)) justPressed.add(code)
    held.add(code)
    input.pointerDown = true
    element.setPointerCapture?.(event.pointerId)
  }

  function onPointerUp(event: PointerEvent) {
    const code = `Mouse${event.button}`
    held.delete(code)
    justReleased.add(code)
    input.pointerDown = held.has("Mouse0")
    element.releasePointerCapture?.(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    updatePointer(event)
    input.look.x += event.movementX ?? 0
    input.look.y += event.movementY ?? 0
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    input.wheel += Math.sign(event.deltaY)
  }

  function onContextMenu(event: MouseEvent) {
    event.preventDefault()
  }

  element.addEventListener("pointerdown", onPointerDown as EventListener)
  element.addEventListener("pointerup", onPointerUp as EventListener)
  element.addEventListener("pointermove", onPointerMove as EventListener)
  element.addEventListener("pointercancel", onPointerUp as EventListener)
  element.addEventListener("wheel", onWheel as EventListener, { passive: false })
  element.addEventListener("contextmenu", onContextMenu as EventListener)

  function onLockChange() {
    input.locked = document.pointerLockElement === element
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerlockchange", onLockChange)
  }

  /** Hides the cursor and gives unbounded mouse look. Needs a click to allow. */
  input.requestPointerLock = () => element.requestPointerLock?.()
  input.exitPointerLock = () => document.exitPointerLock?.()

  // --- Touch stick ----------------------------------------------------------

  const stick = {
    active: false,
    id: null as number | null,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
  }
  const STICK_RADIUS = 64

  function onTouchStart(event: TouchEvent) {
    if (!touchStick) return
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i]
      if (stick.active) break
      const rect = element.getBoundingClientRect()
      if (touch.clientX - rect.left > rect.width / 2) continue
      stick.active = true
      stick.id = touch.identifier
      stick.originX = touch.clientX
      stick.originY = touch.clientY
    }
  }

  function onTouchMove(event: TouchEvent) {
    if (!stick.active) return
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i]
      if (touch.identifier !== stick.id) continue
      stick.x = Math.max(
        -1,
        Math.min(1, (touch.clientX - stick.originX) / STICK_RADIUS)
      )
      stick.y = Math.max(
        -1,
        Math.min(1, (touch.clientY - stick.originY) / STICK_RADIUS)
      )
    }
  }

  function onTouchEnd(event: TouchEvent) {
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i]
      if (touch.identifier !== stick.id) continue
      stick.active = false
      stick.id = null
      stick.x = 0
      stick.y = 0
    }
  }

  if (touchStick) {
    element.addEventListener("touchstart", onTouchStart as EventListener, {
      passive: true,
    })
    element.addEventListener("touchmove", onTouchMove as EventListener, {
      passive: true,
    })
    element.addEventListener("touchend", onTouchEnd as EventListener)
    element.addEventListener("touchcancel", onTouchEnd as EventListener)
  }

  // --- Gamepad --------------------------------------------------------------

  const PAD_BUTTONS: Record<number, string> = {
    0: "jump",
    1: "crouch",
    2: "fire",
    3: "restart",
    9: "pause",
    12: "up",
    13: "down",
    14: "left",
    15: "right",
  }
  const padHeld = new Set<string>()

  function pollGamepad(): { x: number; y: number } {
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      return { x: 0, y: 0 }
    }
    const pads = navigator.getGamepads?.() ?? []
    const pad = pads.find((p): p is Gamepad => Boolean(p && p.connected))
    input.gamepadIndex = pad ? pad.index : null
    if (!pad) return { x: 0, y: 0 }

    for (const [indexStr, action] of Object.entries(PAD_BUTTONS)) {
      const index = Number(indexStr)
      const code = `Pad${index}`
      const pressed = pad.buttons[index]?.pressed
      if (pressed && !padHeld.has(code)) {
        padHeld.add(code)
        held.add(code)
        justPressed.add(code)
        for (const bound of codesFor(action)) justPressed.add(bound)
        held.add(codesFor(action)[0])
      } else if (!pressed && padHeld.has(code)) {
        padHeld.delete(code)
        held.delete(code)
        held.delete(codesFor(action)[0])
        justReleased.add(code)
      }
    }

    input.look.x += deadzone(pad.axes[2] ?? 0) * 12
    input.look.y += deadzone(pad.axes[3] ?? 0) * 12

    return { x: deadzone(pad.axes[0] ?? 0), y: deadzone(pad.axes[1] ?? 0) }
  }

  // --- Frame ----------------------------------------------------------------

  function beginFrame() {
    const pad = pollGamepad()
    const keyX = input.axis("left", "right")
    const keyY = input.axis("up", "down")

    input.move.set(pad.x || stick.x || keyX, pad.y || stick.y || keyY)
    if (input.move.lengthSq() > 1) input.move.normalize()
  }

  /** Clears the one-frame state. The engine calls this for you. */
  input.endFrame = () => {
    justPressed.clear()
    justReleased.clear()
    input.look.set(0, 0)
    input.wheel = 0
  }

  input.dispose = () => {
    target.removeEventListener("keydown", onKeyDown as EventListener)
    target.removeEventListener("keyup", onKeyUp as EventListener)
    if (typeof window !== "undefined") {
      window.removeEventListener("blur", onBlur)
    }
    element.removeEventListener("pointerdown", onPointerDown as EventListener)
    element.removeEventListener("pointerup", onPointerUp as EventListener)
    element.removeEventListener("pointermove", onPointerMove as EventListener)
    element.removeEventListener("pointercancel", onPointerUp as EventListener)
    element.removeEventListener("wheel", onWheel as EventListener)
    element.removeEventListener("contextmenu", onContextMenu as EventListener)
    if (touchStick) {
      element.removeEventListener("touchstart", onTouchStart as EventListener)
      element.removeEventListener("touchmove", onTouchMove as EventListener)
      element.removeEventListener("touchend", onTouchEnd as EventListener)
      element.removeEventListener("touchcancel", onTouchEnd as EventListener)
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("pointerlockchange", onLockChange)
    }
    unhook?.()
  }

  let unhook: (() => void) | null = null
  if (engine) {
    const offEarly = engine.onUpdate(beginFrame)
    const offLate = engine.onLateUpdate(input.endFrame)
    unhook = () => {
      offEarly()
      offLate()
    }
  } else {
    input.beginFrame = beginFrame
  }

  return input
}

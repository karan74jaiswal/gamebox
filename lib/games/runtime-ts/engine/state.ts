import type {
  Cooldown,
  DifficultyOptions,
  DifficultyTracker,
  Engine,
  EventBus,
  EventHandler,
  GameTimer,
  ScoreOptions,
  ScoreTracker,
  StateMachine,
  StateMachineDefinition,
  StorageTracker,
  Ticker,
  TimerOptions,
} from "./types.js"

/**
 * What the game is doing, what the player has, and what survives a reload.
 *
 * The part of a game that has nothing to do with 3D, and the part most likely
 * to end up as a tangle of booleans — `isPlaying`, `isPaused`, `isGameOver`,
 * three of which can be true at once. A machine with named states can only ever
 * be in one of them.
 */

/** The smallest useful event bus. Decouples "a thing happened" from "react". */
export function createEvents(): EventBus {
  const listeners = new Map<string, Set<EventHandler>>()

  return {
    on<TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>): () => void {
      if (!listeners.has(event)) listeners.set(event, new Set())
      const fn = handler as unknown as EventHandler
      listeners.get(event)!.add(fn)
      return () => listeners.get(event)?.delete(fn)
    },
    once<TArgs extends unknown[] = unknown[]>(event: string, handler: EventHandler<TArgs>): () => void {
      const off = this.on(event, (...args: TArgs) => {
        off()
        handler(...args)
      })
      return off
    },
    emit(event: string, ...args: unknown[]): void {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(...args)
    },
    off(event: string): void {
      listeners.delete(event)
    },
  }
}

/**
 * A state machine, with an update per state.
 *
 *   const game = createStateMachine({
 *     playing: { enter: () => hud.banner("GO"), update: (dt) => spawn(dt) },
 *     over:    { enter: () => showGameOver() },
 *   }, "playing")
 *
 * `game.go("over")` runs `playing.exit` then `over.enter`. Re-entering the
 * state you are already in does nothing, so calling `go` from an update loop
 * is safe.
 */
export function createStateMachine<TContext = unknown>(
  states: StateMachineDefinition<TContext>,
  initial?: string,
  engine: Engine | null = null
): StateMachine<TContext> {
  let current: string | null = null
  let elapsed = 0
  const events = createEvents()

  const machine: StateMachine<TContext> = {
    states,
    on: events.on,
    get current() {
      return current
    },
    /** How long the machine has been in this state — for timed transitions. */
    get time() {
      return elapsed
    },
    is: (name: string) => current === name,

    go(name: string, payload?: unknown) {
      if (name === current) return machine
      if (!states[name]) throw new Error(`No such state: ${name}`)
      if (current && states[current]?.exit) {
        states[current].exit!(payload, machine)
      }
      const previous = current
      current = name
      elapsed = 0
      states[name].enter?.(payload, machine)
      events.emit("change", name, previous)
      return machine
    },

    update(dt: number) {
      elapsed += dt
      if (current && states[current]?.update) {
        states[current].update!(dt, machine)
      }
    },
  }

  if (engine) engine.onUpdate(machine.update)
  if (initial) machine.go(initial)
  return machine
}

/**
 * A score that knows its own best, and remembers it between sessions.
 *
 * The high score is the whole reason to replay a small game, and it is one
 * line of localStorage that almost every generated game forgets.
 */
export function createScore(options: ScoreOptions = {}): ScoreTracker {
  const { key = "best", initial = 0, hud = null, label = "Score" } = options
  const store = createStorage(key)

  let value = initial
  let best: number = store.get("best", 0)
  const events = createEvents()

  const display = hud?.stat(label, initial)
  const bestDisplay = hud?.stat("Best", best, { at: "top-right" })

  const score: ScoreTracker = {
    on: events.on,
    get value() {
      return value
    },
    get best() {
      return best
    },
    add(amount = 1) {
      return score.set(value + amount)
    },
    set(next) {
      value = next
      display?.set(value)
      if (value > best) {
        best = value
        bestDisplay?.set(best)
        store.set("best", best)
        events.emit("best", best)
      }
      events.emit("change", value)
      return score
    },
    reset() {
      value = initial
      display?.set(value)
      events.emit("change", value)
      return score
    },
  }

  return score
}

/**
 * A namespaced corner of localStorage that never throws.
 *
 * Storage is unavailable in private windows and in some embedded contexts, and
 * an uncaught throw there takes the whole game down at load. A game that can't
 * save should still play.
 */
export function createStorage(namespace = "game"): StorageTracker {
  const prefix = `${namespace}:`

  return {
    get<T = unknown>(key: string, fallback: T = null as unknown as T): T {
      try {
        if (typeof localStorage === "undefined") return fallback
        const raw = localStorage.getItem(prefix + key)
        return raw === null ? fallback : JSON.parse(raw)
      } catch {
        return fallback
      }
    },
    set<T = unknown>(key: string, value: T): T {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(prefix + key, JSON.stringify(value))
        }
      } catch {}
      return value
    },
    remove(key: string): void {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(prefix + key)
        }
      } catch {}
    },
    clear(): void {
      try {
        if (typeof localStorage !== "undefined") {
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith(prefix)) localStorage.removeItem(key)
          }
        }
      } catch {}
    },
  }
}

/** 83.4 seconds as "1:23". What a timer should read as, not a raw float. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, "0")}`
}

/**
 * A countdown or a count-up. Pausable, and driven by the engine's clock rather
 * than the wall clock, so it stops when the game does.
 */
export function createTimer(options: TimerOptions = {}): GameTimer {
  const {
    duration = null,
    hud = null,
    label = "Time",
    onEnd = null,
    format,
  } = options
  const display = hud?.stat(label, duration ?? 0, {
    at: "top-center",
    format: format ?? formatTime,
    bump: false,
  })

  let time = duration ?? 0
  let running = true

  return {
    get time() {
      return time
    },
    get done() {
      return duration !== null && time <= 0
    },
    start() {
      running = true
    },
    pause() {
      running = false
    },
    reset(to = duration ?? 0) {
      time = to
      display?.set(time)
    },
    add(seconds: number) {
      time += seconds
      display?.set(time)
    },
    update(dt: number) {
      if (!running) return
      time += duration === null ? dt : -dt
      if (duration !== null && time <= 0) {
        time = 0
        running = false
        onEnd?.()
      }
      display?.set(time)
    },
  }
}

/**
 * Difficulty that climbs with time or score.
 *
 * A game whose spawn rate never changes is over as a challenge the moment the
 * player understands it. This maps elapsed progress onto a 0..1 curve you can
 * multiply anything by.
 */
export function createDifficulty(
  options: DifficultyOptions = {}
): DifficultyTracker {
  const { rampSeconds = 90, curve = (t: number) => t ** 0.7, max = 1 } = options
  let elapsed = 0

  return {
    /** 0 at the start, `max` once fully ramped. Read it every frame. */
    get level() {
      return Math.min(max, curve(Math.min(1, elapsed / rampSeconds)) * max)
    },
    /** Interpolates between two values along the difficulty curve. */
    between(from: number, to: number) {
      return from + (to - from) * this.level
    },
    update(dt: number) {
      elapsed += dt
    },
    reset() {
      elapsed = 0
    },
  }
}

/**
 * A budget for things that should happen every so often — enemy spawns, shot
 * cooldowns, ticking damage.
 */
export function createTicker(
  interval: number,
  callback: () => void
): Ticker {
  let accumulated = 0
  return {
    interval,
    update(dt: number) {
      accumulated += dt
      let fired = 0
      while (accumulated >= this.interval && fired < 8) {
        accumulated -= this.interval
        callback()
        fired++
      }
      if (fired >= 8) accumulated = 0
    },
    reset() {
      accumulated = 0
    },
  }
}

/** A cooldown: `if (gun.ready()) { fire(); gun.use() }`. */
export function createCooldown(seconds: number): Cooldown {
  let remaining = 0
  return {
    get remaining() {
      return remaining
    },
    /** 0..1, for a HUD bar or a shader on the ability icon. */
    get progress() {
      return 1 - remaining / seconds
    },
    ready: () => remaining <= 0,
    use() {
      remaining = seconds
    },
    update(dt: number) {
      if (remaining > 0) remaining = Math.max(0, remaining - dt)
    },
  }
}

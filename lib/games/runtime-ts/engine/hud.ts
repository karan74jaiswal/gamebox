import * as THREE from "three"

import type {
  BarOptions,
  ButtonOptions,
  Engine,
  FlashOptions,
  HealthBarComponent,
  HealthBarOptions,
  HudBar,
  HudButton,
  HudCornerName,
  HudCrosshair,
  HudKeys,
  HudManager,
  HudMarker,
  HudOverlay,
  HudStat,
  HudText,
  HudTouchButtons,
  InputManager,
  KeysOptions,
  MarkerOptions,
  ModalOverlayComponent,
  ModalOverlayOptions,
  ModalStat,
  ObjectiveCardComponent,
  ObjectiveCardOptions,
  OverlayOptions,
  ScoreBadgeComponent,
  ScoreBadgeOptions,
  StatOptions,
  TextOptions,
  TouchButtonsOptions,
  TouchControlsComponent,
  TouchControlsOptions,
} from "./types.ts"
import { brand } from "./materials.ts"

/**
 * The layer of DOM over the canvas: score, health, timers, menus, messages.
 *
 * HUDs are DOM, not 3D. Text drawn into the scene fights the camera, blurs at
 * distance and costs a texture upload every time it changes; an absolutely
 * positioned div is sharp, free and styleable. The canvas keeps the pointer,
 * so nothing here blocks a click unless it is a button.
 */

const STYLE_ID = "engine-hud-style"

const CSS = `
.hud {
  position: absolute;
  inset: 0;
  /* The HUD is a window onto the game, not a wall in front of it: clicks fall
     through to the canvas unless a child opts back in. */
  pointer-events: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr auto;
  /* Notched phones: nothing in the HUD sits under the hardware. */
  padding:
    calc(clamp(12px, 2.5vmin, 28px) + env(safe-area-inset-top))
    calc(clamp(12px, 2.5vmin, 28px) + env(safe-area-inset-right))
    calc(clamp(12px, 2.5vmin, 28px) + env(safe-area-inset-bottom))
    calc(clamp(12px, 2.5vmin, 28px) + env(safe-area-inset-left));
  gap: 12px;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  color: #ededed;
  /* Above the canvas, below nothing. */
  z-index: 10;
  user-select: none;
  -webkit-user-select: none;
}
.hud-corner { display: flex; flex-direction: column; gap: 8px; }
.hud-corner[data-corner="top-left"] { grid-area: 1 / 1; align-items: flex-start; }
.hud-corner[data-corner="top-center"] { grid-area: 1 / 2; align-items: center; }
.hud-corner[data-corner="top-right"] { grid-area: 1 / 3; align-items: flex-end; }
.hud-corner[data-corner="center"] { grid-area: 2 / 2; align-items: center; justify-content: center; }
.hud-corner[data-corner="bottom-left"] { grid-area: 3 / 1; align-items: flex-start; justify-content: flex-end; }
.hud-corner[data-corner="bottom-center"] { grid-area: 3 / 2; align-items: center; justify-content: flex-end; }
.hud-corner[data-corner="bottom-right"] { grid-area: 3 / 3; align-items: flex-end; justify-content: flex-end; }

.hud-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(10, 10, 10, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  font-variant-numeric: tabular-nums;
}
.hud-stat-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #a1a1a1;
}
.hud-stat-value { font-size: 20px; font-weight: 650; }
.hud-stat.is-bumped { animation: hud-bump 260ms ease-out; }
@keyframes hud-bump {
  0% { transform: scale(1); }
  35% { transform: scale(1.16); color: ${brand.amber}; }
  100% { transform: scale(1); }
}

.hud-bar {
  width: clamp(120px, 22vw, 240px);
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(10, 10, 10, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
}
.hud-bar-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #a1a1a1;
  margin-bottom: 5px;
}
.hud-bar-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.hud-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: ${brand.ember};
  transition: width 180ms ease-out, background-color 240ms ease-out;
}

.hud-text { font-size: 14px; color: #a1a1a1; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }

.hud-toast {
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  font-weight: 600;
  animation: hud-toast 2.4s ease-out forwards;
}
@keyframes hud-toast {
  0% { opacity: 0; transform: translateY(8px); }
  12%, 72% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}

.hud-banner {
  font-size: clamp(28px, 7vmin, 64px);
  font-weight: 800;
  letter-spacing: -0.02em;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
  animation: hud-banner 1.4s ease-out forwards;
}
@keyframes hud-banner {
  0% { opacity: 0; transform: scale(0.86); }
  18% { opacity: 1; transform: scale(1.04); }
  70% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.02); }
}

.hud-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  background: radial-gradient(circle at 50% 45%, rgba(10,10,10,0.72), rgba(10,10,10,0.94));
  backdrop-filter: blur(3px);
  pointer-events: auto;
  animation: hud-fade 240ms ease-out;
}
@keyframes hud-fade { from { opacity: 0; } to { opacity: 1; } }
.hud-overlay-inner { display: grid; gap: 12px; justify-items: center; }
.hud-overlay h2 {
  margin: 0;
  font-size: clamp(28px, 6vmin, 52px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.hud-overlay p { margin: 0; color: #a1a1a1; font-size: 15px; max-width: 42ch; line-height: 1.5; }

.hud-button {
  pointer-events: auto;
  padding: 10px 22px;
  border: 0;
  border-radius: 999px;
  background: ${brand.ember};
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 650;
  cursor: pointer;
  transition: transform 120ms ease-out, filter 120ms ease-out;
}
.hud-button:hover { filter: brightness(1.1); transform: translateY(-1px); }
.hud-button:active { transform: translateY(1px) scale(0.98); }
.hud-button[data-variant="ghost"] {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hud-crosshair {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translate(-50%, -50%);
  opacity: 0.8;
}
.hud-crosshair::before, .hud-crosshair::after {
  content: "";
  position: absolute;
  background: #fff;
  box-shadow: 0 0 3px rgba(0,0,0,0.9);
}
.hud-crosshair::before { left: 50%; top: 0; width: 2px; height: 100%; margin-left: -1px; }
.hud-crosshair::after { top: 50%; left: 0; height: 2px; width: 100%; margin-top: -1px; }

.hud-keys {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 12px;
  color: #a1a1a1;
}
.hud-keys kbd {
  padding: 3px 7px;
  border-radius: 6px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-bottom-width: 2px;
  font: inherit;
  font-size: 11px;
  color: #ededed;
}

.hud-touch {
  pointer-events: auto;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.12);
  color: #fff;
  font: inherit;
  font-weight: 700;
  backdrop-filter: blur(6px);
}
.hud-touch:active { background: rgba(255,255,255,0.28); }

.hud-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  z-index: 15;
}

/* Health & Shield Meter with Delayed Damage Trail */
.hud-health-bar {
  width: clamp(140px, 22vw, 260px);
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(10, 10, 10, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.hud-health-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: #a1a1a1;
}
.hud-health-numbers {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #ededed;
}
.hud-meter-track {
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.hud-meter-trail {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 999px;
  transition: width 500ms cubic-bezier(0.25, 1, 0.5, 1) 180ms;
}
.hud-meter-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 999px;
  transition: width 150ms ease-out, background-color 200ms ease-out;
}
.hud-meter-shield-track {
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  margin-top: 2px;
}
.hud-meter-shield-fill {
  height: 100%;
  border-radius: 999px;
  background: #06b6d4;
  transition: width 150ms ease-out;
}

/* Objective Card */
.hud-objective-card {
  min-width: clamp(160px, 24vw, 280px);
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(10, 10, 10, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: 3px solid ${brand.ember};
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hud-objective-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.hud-objective-title {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: #d4d4d8;
}
.hud-objective-timer {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: ${brand.amber};
}
.hud-objective-detail {
  font-size: 13px;
  color: #a1a1aa;
  line-height: 1.3;
}
.hud-objective-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.hud-objective-track {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.hud-objective-fill {
  height: 100%;
  border-radius: 999px;
  background: ${brand.ember};
  transition: width 200ms ease-out;
}
.hud-objective-count {
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #ededed;
}
.hud-objective-card.is-complete {
  border-left-color: #10b981;
}

/* Score Badge */
.hud-score-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  padding: 8px 14px;
  border-radius: 10px;
  background: rgba(10, 10, 10, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  font-variant-numeric: tabular-nums;
}
.hud-score-header {
  display: flex;
  gap: 8px;
  align-items: center;
}
.hud-score-label {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
  color: #a1a1a1;
}
.hud-score-val {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #ffffff;
  display: inline-block;
  transition: transform 150ms ease-out;
}
.hud-score-badge.is-bumped .hud-score-val {
  animation: hud-score-pop 240ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
@keyframes hud-score-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); color: ${brand.amber}; }
  100% { transform: scale(1); }
}
.hud-combo-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fbbf24;
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.hud-combo-tag.is-active {
  opacity: 1;
  transform: scale(1);
}
.hud-highscore-label {
  font-size: 10px;
  color: #71717a;
  letter-spacing: 0.05em;
}

/* Modal Overlay Card */
.hud-modal-card {
  width: min(92vw, 440px);
  padding: 28px 24px;
  border-radius: 14px;
  background: rgba(18, 18, 20, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.hud-modal-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: ${brand.ember};
}
.hud-modal-card[data-type="victory"]::before { background: #10b981; }
.hud-modal-card[data-type="game-over"]::before { background: #ef4444; }
.hud-modal-card[data-type="pause"]::before { background: #06b6d4; }
.hud-modal-title {
  margin: 0;
  font-size: clamp(24px, 5vmin, 32px);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.hud-modal-subtitle {
  margin: 0;
  font-size: 14px;
  color: #a1a1aa;
  line-height: 1.4;
}
.hud-modal-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.hud-modal-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.hud-modal-stat-label {
  color: #71717a;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
  font-weight: 600;
}
.hud-modal-stat-val {
  color: #ededed;
  font-weight: 700;
}
.hud-modal-stat-val.is-highlight {
  color: ${brand.amber};
  font-weight: 800;
}
.hud-modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

/* Touch Controls & Virtual Thumbstick */
.hud-touch-controls {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 12;
  touch-action: none;
}
.hud-touch-stick-zone {
  position: absolute;
  left: calc(clamp(16px, 4vw, 40px) + env(safe-area-inset-left));
  bottom: calc(clamp(16px, 4vh, 40px) + env(safe-area-inset-bottom));
  width: 120px;
  height: 120px;
  pointer-events: auto;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hud-touch-stick-base {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hud-touch-stick-knob {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  position: absolute;
  pointer-events: none;
  transition: transform 60ms linear;
}
.hud-touch-actions-zone {
  position: absolute;
  right: calc(clamp(16px, 4vw, 40px) + env(safe-area-inset-right));
  bottom: calc(clamp(16px, 4vh, 40px) + env(safe-area-inset-bottom));
  pointer-events: auto;
  touch-action: none;
  display: flex;
  gap: 14px;
  align-items: flex-end;
}
.hud-action-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(8px);
  color: #fff;
  font: inherit;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  display: grid;
  place-items: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 100ms ease, background-color 100ms ease;
}
.hud-action-btn:active, .hud-action-btn.is-active {
  background: rgba(255, 255, 255, 0.45);
  transform: scale(0.92);
}
`

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
    return
  }
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export interface HudOptions {
  container?: HTMLElement
}

export function createHud(options: HudOptions = {}): HudManager {
  const {
    container = typeof document !== "undefined"
      ? document.body
      : ({} as HTMLElement),
  } = options
  ensureStyles()

  const root = document.createElement("div")
  root.className = "hud"
  container.appendChild(root)

  const corners = new Map<HudCornerName, HTMLElement>()
  function corner(name: HudCornerName): HTMLElement {
    let element = corners.get(name)
    if (!element) {
      element = document.createElement("div")
      element.className = "hud-corner"
      element.dataset.corner = name
      root.appendChild(element)
      corners.set(name, element)
    }
    return element
  }

  const hud: HudManager = {
    root,
    corner,

    /**
     * A labelled number. Bumps when it changes, which is most of the feedback a
     * score needs — a number that silently ticks up reads as nothing happening.
     */
    stat(label: string, value: number = 0, opts: StatOptions = {}): HudStat {
      const { at = "top-left", format = (v: number) => String(v), bump = true } = opts
      const element = document.createElement("div")
      element.className = "hud-stat"
      element.innerHTML = `<span class="hud-stat-label"></span><span class="hud-stat-value"></span>`
      const labelEl = element.querySelector(".hud-stat-label") as HTMLSpanElement
      const valueEl = element.querySelector(".hud-stat-value") as HTMLSpanElement
      labelEl.textContent = label
      valueEl.textContent = format(value)
      corner(at).appendChild(element)

      let current = value
      return {
        element,
        get value() {
          return current
        },
        set(next: number) {
          if (next === current) return
          current = next
          valueEl.textContent = format(next)
          if (bump) {
            element.classList.remove("is-bumped")
            void element.offsetWidth
            element.classList.add("is-bumped")
          }
        },
        add(delta: number) {
          this.set(current + delta)
        },
        setLabel(next: string) {
          labelEl.textContent = next
        },
        remove: () => element.remove(),
      }
    },

    /** Health, fuel, charge, a boss's life. Goes red as it empties. */
    bar(label: string, opts: BarOptions = {}): HudBar {
      const {
        at = "top-left",
        value = 1,
        max = 1,
        color = brand.ember,
        dangerColor = "#ef4444",
        dangerBelow = 0.3,
      } = opts
      const element = document.createElement("div")
      element.className = "hud-bar"
      element.innerHTML = `<div class="hud-bar-label"></div><div class="hud-bar-track"><div class="hud-bar-fill"></div></div>`
      const labelEl = element.querySelector(".hud-bar-label") as HTMLDivElement
      const fill = element.querySelector(".hud-bar-fill") as HTMLDivElement
      labelEl.textContent = label
      corner(at).appendChild(element)

      const api: HudBar = {
        element,
        max,
        set(next: number) {
          const ratio = Math.max(0, Math.min(1, next / api.max))
          fill.style.width = `${ratio * 100}%`
          fill.style.backgroundColor = ratio <= dangerBelow ? dangerColor : color
          return api
        },
        setLabel(next: string) {
          labelEl.textContent = next
        },
        remove: () => element.remove(),
      }
      return api.set(value)
    },

    /** Free-form line of text. Timers, hints, coordinates. */
    text(content: string = "", opts: TextOptions = {}): HudText {
      const { at = "bottom-left" } = opts
      const element = document.createElement("div")
      element.className = "hud-text"
      element.textContent = content
      corner(at).appendChild(element)
      return {
        element,
        set: (next: string) => {
          element.textContent = next
        },
        remove: () => element.remove(),
      }
    },

    /** A short message that fades itself out. "+50", "Checkpoint", "Reloading". */
    toast(message: string, opts: { at?: HudCornerName; duration?: number } = {}): HTMLDivElement {
      const { at = "bottom-center", duration = 2400 } = opts
      const element = document.createElement("div")
      element.className = "hud-toast"
      element.textContent = message
      corner(at).appendChild(element)
      setTimeout(() => element.remove(), duration)
      return element
    },

    /** Big centred text that punches in and clears. "WAVE 3", "GO", "PERFECT". */
    banner(message: string, opts: { duration?: number } = {}): HTMLDivElement {
      const { duration = 1400 } = opts
      const element = document.createElement("div")
      element.className = "hud-banner"
      element.textContent = message
      corner("center").appendChild(element)
      setTimeout(() => element.remove(), duration)
      return element
    },

    /**
     * A full-screen modal — game over, pause, victory.
     *
     * Buttons are `{ label, onClick, variant }`. Returns a handle with `close()`,
     * so the game decides when it goes; nothing here auto-dismisses a decision.
     */
    overlay(opts: OverlayOptions = {}): HudOverlay {
      const { title = "", body = "", buttons = [], dismissible = false } = opts
      const element = document.createElement("div")
      element.className = "hud-overlay"

      const inner = document.createElement("div")
      inner.className = "hud-overlay-inner"
      if (title) {
        const heading = document.createElement("h2")
        heading.textContent = title
        inner.appendChild(heading)
      }
      if (body) {
        const paragraph = document.createElement("p")
        paragraph.textContent = body
        inner.appendChild(paragraph)
      }

      const handle: HudOverlay = {
        element,
        close: () => element.remove(),
      }

      if (buttons.length) {
        const row = document.createElement("div")
        row.style.display = "flex"
        row.style.gap = "10px"
        row.style.marginTop = "6px"
        for (const button of buttons) {
          const node = document.createElement("button")
          node.className = "hud-button"
          node.textContent = button.label
          if (button.variant) node.dataset.variant = button.variant
          node.addEventListener("click", () => {
            if (button.keepOpen !== true) handle.close()
            button.onClick?.()
          })
          row.appendChild(node)
        }
        inner.appendChild(row)
      }

      if (dismissible) {
        element.addEventListener("click", (event) => {
          if (event.target === element) handle.close()
        })
      }

      element.appendChild(inner)
      container.appendChild(element)
      return handle
    },

    /** A standalone button, for a start screen or a mute toggle. */
    button(label: string, onClick: (event: MouseEvent) => void, opts: ButtonOptions = {}): HudButton {
      const { at = "bottom-right", variant } = opts
      const element = document.createElement("button")
      element.className = "hud-button"
      element.textContent = label
      if (variant) element.dataset.variant = variant
      element.addEventListener("click", onClick)
      corner(at).appendChild(element)
      return { element, remove: () => element.remove() }
    },

    /** Centre reticle for anything aimed. */
    crosshair(): HudCrosshair {
      const element = document.createElement("div")
      element.className = "hud-crosshair"
      root.appendChild(element)
      return {
        element,
        show: () => {
          element.style.display = ""
        },
        hide: () => {
          element.style.display = "none"
        },
        remove: () => element.remove(),
      }
    },

    /** A row of key caps. The fastest way to teach controls without a tutorial. */
    keys(pairs: Record<string, string>, opts: KeysOptions = {}): HudKeys {
      const { at = "bottom-center" } = opts
      const element = document.createElement("div")
      element.className = "hud-keys"
      element.innerHTML = Object.entries(pairs)
        .map(([key, action]) => `<span><kbd>${key}</kbd> ${action}</span>`)
        .join("")
      corner(at).appendChild(element)
      return { element, remove: () => element.remove() }
    },

    /**
     * On-screen buttons for touch. Each fires like a key, so the game's existing
     * `input.pressed("jump")` keeps working without a second code path.
     */
    touchButtons(
      buttons: Record<string, string>,
      input?: InputManager,
      opts: TouchButtonsOptions = {}
    ): HudTouchButtons {
      const { at = "bottom-right", onlyOnTouch = true } = opts
      const isCoarse =
        typeof matchMedia === "function"
          ? matchMedia("(pointer: coarse)").matches
          : false
      if (onlyOnTouch && !isCoarse) {
        return { remove: () => {} }
      }
      const row = document.createElement("div")
      row.style.display = "flex"
      row.style.gap = "10px"
      for (const [btnLabel, action] of Object.entries(buttons)) {
        const node = document.createElement("button")
        node.className = "hud-touch"
        node.textContent = btnLabel
        const code = `Touch_${action}`
        input?.bind(action, [...(input.codes(action) ?? []), code])
        node.addEventListener("pointerdown", (event) => {
          event.preventDefault()
          input?.press(code)
        })
        node.addEventListener("pointerup", () => input?.release(code))
        node.addEventListener("pointercancel", () => input?.release(code))
        node.addEventListener("pointerleave", () => input?.release(code))
        row.appendChild(node)
      }
      corner(at).appendChild(row)
      return { element: row, remove: () => row.remove() }
    },

    /** A colour wash over the whole screen — damage red, pickup white, heal green. */
    flash(color: string = "#ef4444", opts: FlashOptions = {}): HTMLDivElement {
      const { duration = 260, opacity = 0.45 } = opts
      const element = document.createElement("div")
      element.className = "hud-flash"
      element.style.background = color
      container.appendChild(element)
      const anim = element.animate([{ opacity }, { opacity: 0 }], {
        duration,
        easing: "ease-out",
      })
      anim.onfinish = () => element.remove()
      return element
    },

    /**
     * Pins a DOM element to a world position — nameplates, waypoints, markers.
     * Returns `update()` to call each frame; it hides the element behind the camera.
     */
    marker(
      engine: Engine,
      target: THREE.Object3D,
      content: string,
      opts: MarkerOptions = {}
    ): HudMarker {
      const { className = "hud-text", offsetY = 1.5 } = opts
      const element = document.createElement("div")
      element.className = className
      element.style.position = "absolute"
      element.style.transform = "translate(-50%, -50%)"
      element.textContent = content
      root.appendChild(element)

      const point = new THREE.Vector3()
      return {
        element,
        set: (next: string) => {
          element.textContent = next
          return next
        },
        update() {
          point.copy(target.position)
          point.y += offsetY
          point.project(engine.camera)
          const behind = point.z > 1
          element.style.display = behind ? "none" : ""
          if (behind) return
          element.style.left = `${((point.x + 1) / 2) * 100}%`
          element.style.top = `${((1 - point.y) / 2) * 100}%`
        },
        remove: () => element.remove(),
      }
    },

    clear() {
      for (const element of corners.values()) element.replaceChildren()
    },

    remove() {
      root.remove()
    },

    /** Dual-layer health meter with delayed damage trail */
    healthBar(opts = {}) {
      const at = opts.at ?? "top-left"
      return createHealthBar({ container: corner(at), ...opts })
    },

    /** Objective card with progress track and mission timer */
    objectiveCard(opts = {}) {
      const at = opts.at ?? "top-left"
      return createObjectiveCard({ container: corner(at), ...opts })
    },

    /** Score badge with combo multipliers and high score */
    scoreBadge(opts = {}) {
      const at = opts.at ?? "top-right"
      return createScoreBadge({ container: corner(at), ...opts })
    },

    /** Modal dialog overlay (victory, game-over, pause, info) */
    modalOverlay(opts) {
      return createModalOverlay({ container, ...opts })
    },

    /** On-screen virtual thumbstick and touch action controls */
    touchControls(opts = {}) {
      return createTouchControls({ container: root, ...opts })
    },
  }

  return hud
}

/**
 * Creates an advanced dual-layer health bar with immediate fill and delayed damage trail.
 */
export function createHealthBar(options: HealthBarOptions = {}): HealthBarComponent {
  ensureStyles()
  const {
    container = typeof document !== "undefined" ? document.body : ({} as HTMLElement),
    label = "HEALTH",
    max = 100,
    current = 100,
    showShield = false,
    maxShield = 50,
    shield = 0,
    color = "#10b981",
    shieldColor = "#06b6d4",
    dangerColor = "#ef4444",
    dangerBelow = 0.25,
  } = options

  const element = document.createElement("div")
  element.className = "hud-health-bar"
  element.innerHTML = `
    <div class="hud-health-header">
      <span class="hud-health-label">${label}</span>
      <span class="hud-health-numbers">${Math.round(current)} / ${Math.round(max)}</span>
    </div>
    <div class="hud-meter-track">
      <div class="hud-meter-trail"></div>
      <div class="hud-meter-fill"></div>
    </div>
    ${showShield ? '<div class="hud-meter-shield-track"><div class="hud-meter-shield-fill"></div></div>' : ""}
  `
  container.appendChild?.(element)

  const labelEl = element.querySelector?.(".hud-health-label") as HTMLSpanElement | null
  const numbersEl = element.querySelector?.(".hud-health-numbers") as HTMLSpanElement | null
  const trailEl = element.querySelector?.(".hud-meter-trail") as HTMLDivElement | null
  const fillEl = element.querySelector?.(".hud-meter-fill") as HTMLDivElement | null
  const shieldFillEl = element.querySelector?.(".hud-meter-shield-fill") as HTMLDivElement | null

  let currHealth = current
  let currMax = max
  let currShield = shield
  let currMaxShield = maxShield

  function update() {
    const ratio = Math.max(0, Math.min(1, currMax > 0 ? currHealth / currMax : 0))
    const pct = `${(ratio * 100).toFixed(1)}%`
    if (fillEl) {
      fillEl.style.width = pct
      fillEl.style.backgroundColor = ratio <= dangerBelow ? dangerColor : color
    }
    if (trailEl) {
      trailEl.style.width = pct
    }
    if (numbersEl) {
      numbersEl.textContent = `${Math.round(currHealth)} / ${Math.round(currMax)}`
    }

    if (shieldFillEl) {
      const shieldRatio = Math.max(0, Math.min(1, currMaxShield > 0 ? currShield / currMaxShield : 0))
      shieldFillEl.style.width = `${(shieldRatio * 100).toFixed(1)}%`
      shieldFillEl.style.backgroundColor = shieldColor
    }
  }

  update()

  return {
    element,
    setHealth(next: number, newMax?: number) {
      if (typeof newMax === "number") currMax = newMax
      const prev = currHealth
      currHealth = next
      const ratio = Math.max(0, Math.min(1, currMax > 0 ? currHealth / currMax : 0))
      const pct = `${(ratio * 100).toFixed(1)}%`

      if (fillEl) {
        fillEl.style.width = pct
        fillEl.style.backgroundColor = ratio <= dangerBelow ? dangerColor : color
      }
      if (numbersEl) {
        numbersEl.textContent = `${Math.round(currHealth)} / ${Math.round(currMax)}`
      }

      if (trailEl) {
        if (next < prev) {
          trailEl.style.transition = "width 500ms cubic-bezier(0.25, 1, 0.5, 1) 180ms"
        } else {
          trailEl.style.transition = "none"
        }
        trailEl.style.width = pct
      }
    },
    setShield(next: number, newMax?: number) {
      if (typeof newMax === "number") currMaxShield = newMax
      currShield = next
      if (shieldFillEl) {
        const shieldRatio = Math.max(0, Math.min(1, currMaxShield > 0 ? currShield / currMaxShield : 0))
        shieldFillEl.style.width = `${(shieldRatio * 100).toFixed(1)}%`
      }
    },
    setLabel(next: string) {
      if (labelEl) labelEl.textContent = next
    },
    remove() {
      element.remove()
    },
  }
}

/**
 * Creates an objective tracking card with progress fill track and optional countdown timer.
 */
export function createObjectiveCard(options: ObjectiveCardOptions = {}): ObjectiveCardComponent {
  ensureStyles()
  const {
    container = typeof document !== "undefined" ? document.body : ({} as HTMLElement),
    title = "MISSION OBJECTIVE",
    detail = "",
    current = 0,
    total = 0,
    timeRemaining,
    showTimer = typeof timeRemaining === "number",
  } = options

  const element = document.createElement("div")
  element.className = "hud-objective-card"

  function formatTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec))
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`
  }

  element.innerHTML = `
    <div class="hud-objective-header">
      <span class="hud-objective-title">${title}</span>
      ${showTimer ? `<span class="hud-objective-timer">${typeof timeRemaining === "number" ? formatTime(timeRemaining) : ""}</span>` : ""}
    </div>
    ${detail ? `<div class="hud-objective-detail">${detail}</div>` : '<div class="hud-objective-detail" style="display:none;"></div>'}
    <div class="hud-objective-progress-row" ${total > 0 ? "" : 'style="display:none;"'}>
      <div class="hud-objective-track">
        <div class="hud-objective-fill" style="width: ${total > 0 ? (Math.min(1, current / total) * 100).toFixed(1) : 0}%"></div>
      </div>
      <span class="hud-objective-count">${current} / ${total}</span>
    </div>
  `
  container.appendChild?.(element)

  const titleEl = element.querySelector?.(".hud-objective-title") as HTMLSpanElement | null
  const timerEl = element.querySelector?.(".hud-objective-timer") as HTMLSpanElement | null
  const detailEl = element.querySelector?.(".hud-objective-detail") as HTMLDivElement | null
  const progressRow = element.querySelector?.(".hud-objective-progress-row") as HTMLDivElement | null
  const fillEl = element.querySelector?.(".hud-objective-fill") as HTMLDivElement | null
  const countEl = element.querySelector?.(".hud-objective-count") as HTMLSpanElement | null

  let curVal = current
  let totalVal = total

  return {
    element,
    setTitle(next: string) {
      if (titleEl) titleEl.textContent = next
    },
    setDetail(next: string) {
      if (detailEl) {
        detailEl.textContent = next
        detailEl.style.display = next ? "" : "none"
      }
    },
    setProgress(cur: number, tot?: number) {
      curVal = cur
      if (typeof tot === "number") totalVal = tot
      if (progressRow && fillEl && countEl) {
        if (totalVal > 0) {
          progressRow.style.display = ""
          const ratio = Math.max(0, Math.min(1, curVal / totalVal))
          fillEl.style.width = `${(ratio * 100).toFixed(1)}%`
          countEl.textContent = `${curVal} / ${totalVal}`
        } else {
          progressRow.style.display = "none"
        }
      }
    },
    setTimer(seconds: number) {
      if (timerEl) {
        timerEl.textContent = formatTime(seconds)
      }
    },
    complete() {
      element.classList.add("is-complete")
    },
    remove() {
      element.remove()
    },
  }
}

/**
 * Creates an animated score badge with combo multiplier tag and high score display.
 */
export function createScoreBadge(options: ScoreBadgeOptions = {}): ScoreBadgeComponent {
  ensureStyles()
  const {
    container = typeof document !== "undefined" ? document.body : ({} as HTMLElement),
    label = "SCORE",
    score = 0,
    highScore,
    combo = 1,
    multiplier = 1,
  } = options

  const element = document.createElement("div")
  element.className = "hud-score-badge"
  element.innerHTML = `
    <div class="hud-score-header">
      <span class="hud-combo-tag ${combo > 1 ? "is-active" : ""}">x${multiplier > 1 ? multiplier.toFixed(1) : combo} COMBO</span>
      <span class="hud-score-label">${label}</span>
    </div>
    <div class="hud-score-val">${score.toLocaleString()}</div>
    ${typeof highScore === "number" ? `<div class="hud-highscore-label">BEST: ${highScore.toLocaleString()}</div>` : ""}
  `
  container.appendChild?.(element)

  const valEl = element.querySelector?.(".hud-score-val") as HTMLDivElement | null
  const comboEl = element.querySelector?.(".hud-combo-tag") as HTMLSpanElement | null
  const highEl = element.querySelector?.(".hud-highscore-label") as HTMLDivElement | null

  let curScore = score

  function triggerBump() {
    element.classList.remove("is-bumped")
    void element.offsetWidth
    element.classList.add("is-bumped")
  }

  return {
    element,
    setScore(next: number) {
      if (next !== curScore) {
        curScore = next
        if (valEl) valEl.textContent = next.toLocaleString()
        triggerBump()
      }
    },
    addScore(delta: number) {
      this.setScore(curScore + delta)
    },
    setHighScore(best: number) {
      if (highEl) {
        highEl.textContent = `BEST: ${best.toLocaleString()}`
      }
    },
    setCombo(newCombo: number, newMultiplier?: number) {
      if (comboEl) {
        if (newCombo > 1) {
          const mult = typeof newMultiplier === "number" ? newMultiplier : newCombo
          comboEl.textContent = `x${mult.toFixed(1)} COMBO`
          comboEl.classList.add("is-active")
        } else {
          comboEl.classList.remove("is-active")
        }
      }
    },
    resetCombo() {
      if (comboEl) comboEl.classList.remove("is-active")
    },
    bump: triggerBump,
    remove() {
      element.remove()
    },
  }
}

/**
 * Creates a modal overlay dialog (Game Over, Victory, Pause, Info) with stat summary and buttons.
 */
export function createModalOverlay(options: ModalOverlayOptions): ModalOverlayComponent {
  ensureStyles()
  const {
    container = typeof document !== "undefined" ? document.body : ({} as HTMLElement),
    type = "info",
    title,
    subtitle = "",
    stats = [],
    primaryLabel = "PLAY AGAIN",
    onPrimary,
    secondaryLabel,
    onSecondary,
    dismissible = false,
  } = options

  const backdrop = document.createElement("div")
  backdrop.className = "hud-overlay"

  const card = document.createElement("div")
  card.className = "hud-modal-card"
  card.dataset.type = type

  const titleEl = document.createElement("h2")
  titleEl.className = "hud-modal-title"
  titleEl.textContent = title
  card.appendChild(titleEl)

  if (subtitle) {
    const subEl = document.createElement("p")
    subEl.className = "hud-modal-subtitle"
    subEl.textContent = subtitle
    card.appendChild(subEl)
  }

  const statsContainer = document.createElement("div")
  statsContainer.className = "hud-modal-stats"

  function renderStats(list: ModalStat[]) {
    statsContainer.innerHTML = ""
    if (list.length === 0) {
      statsContainer.style.display = "none"
      return
    }
    statsContainer.style.display = "flex"
    for (const st of list) {
      const row = document.createElement("div")
      row.className = "hud-modal-stat-row"
      const label = document.createElement("span")
      label.className = "hud-modal-stat-label"
      label.textContent = st.label
      const val = document.createElement("span")
      val.className = `hud-modal-stat-val ${st.highlight ? "is-highlight" : ""}`
      val.textContent = String(st.value)
      row.appendChild(label)
      row.appendChild(val)
      statsContainer.appendChild(row)
    }
  }

  renderStats(stats)
  card.appendChild(statsContainer)

  const actions = document.createElement("div")
  actions.className = "hud-modal-actions"

  const primaryBtn = document.createElement("button")
  primaryBtn.className = "hud-button"
  primaryBtn.textContent = primaryLabel
  primaryBtn.addEventListener("click", () => {
    handle.close()
    onPrimary?.()
  })
  actions.appendChild(primaryBtn)

  if (secondaryLabel) {
    const secBtn = document.createElement("button")
    secBtn.className = "hud-button"
    secBtn.dataset.variant = "ghost"
    secBtn.textContent = secondaryLabel
    secBtn.addEventListener("click", () => {
      handle.close()
      onSecondary?.()
    })
    actions.appendChild(secBtn)
  }

  card.appendChild(actions)
  backdrop.appendChild(card)
  container.appendChild?.(backdrop)

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handle.close()
      onPrimary?.()
    } else if (e.key === "Escape") {
      if (onSecondary) {
        e.preventDefault()
        handle.close()
        onSecondary()
      } else if (dismissible) {
        e.preventDefault()
        handle.close()
      }
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown)
  }

  if (dismissible) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) handle.close()
    })
  }

  const handle: ModalOverlayComponent = {
    element: backdrop,
    updateStats(newStats: ModalStat[]) {
      renderStats(newStats)
    },
    close() {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", onKeyDown)
      }
      backdrop.remove()
    },
  }

  return handle
}

/**
 * Creates mobile on-screen virtual thumbstick and action touch buttons.
 */
export function createTouchControls(options: TouchControlsOptions = {}): TouchControlsComponent {
  ensureStyles()
  const {
    container = typeof document !== "undefined" ? document.body : ({} as HTMLElement),
    input,
    onlyOnTouch = true,
    stick = true,
    buttons = [{ id: "action_a", label: "A", action: "action" }],
    onMove,
    onButton,
  } = options

  const isCoarse =
    typeof matchMedia === "function"
      ? matchMedia("(pointer: coarse)").matches
      : false

  if (onlyOnTouch && !isCoarse) {
    return {
      element: typeof document !== "undefined" ? document.createElement("div") : ({} as HTMLElement),
      vector: { x: 0, y: 0 },
      remove: () => {},
    }
  }

  const root = document.createElement("div")
  root.className = "hud-touch-controls"
  container.appendChild?.(root)

  const vector = { x: 0, y: 0 }

  if (stick) {
    const stickZone = document.createElement("div")
    stickZone.className = "hud-touch-stick-zone"
    const stickBase = document.createElement("div")
    stickBase.className = "hud-touch-stick-base"
    const knob = document.createElement("div")
    knob.className = "hud-touch-stick-knob"

    stickBase.appendChild(knob)
    stickZone.appendChild(stickBase)
    root.appendChild(stickZone)

    let activePointerId: number | null = null
    const maxRadius = 38

    function resetStick() {
      activePointerId = null
      knob.style.transform = "translate(0px, 0px)"
      vector.x = 0
      vector.y = 0
      onMove?.(vector)
    }

    stickZone.addEventListener("pointerdown", (e: PointerEvent) => {
      e.preventDefault?.()
      activePointerId = e.pointerId
      stickZone.setPointerCapture?.(e.pointerId)
      const rect = stickBase.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = (e.clientX ?? 0) - centerX
      const dy = (e.clientY ?? 0) - centerY
      const dist = Math.hypot(dx, dy)
      const clampedDist = Math.min(dist, maxRadius)
      const angle = Math.atan2(dy, dx)
      const kx = Math.cos(angle) * clampedDist
      const ky = Math.sin(angle) * clampedDist
      knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`
      vector.x = clampedDist > 4 ? kx / maxRadius : 0
      vector.y = clampedDist > 4 ? -(ky / maxRadius) : 0
      onMove?.(vector)
    })

    stickZone.addEventListener("pointermove", (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return
      e.preventDefault?.()
      const rect = stickBase.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const dx = (e.clientX ?? 0) - centerX
      const dy = (e.clientY ?? 0) - centerY
      const dist = Math.hypot(dx, dy)
      const clampedDist = Math.min(dist, maxRadius)
      const angle = Math.atan2(dy, dx)
      const kx = Math.cos(angle) * clampedDist
      const ky = Math.sin(angle) * clampedDist
      knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`
      vector.x = clampedDist > 4 ? kx / maxRadius : 0
      vector.y = clampedDist > 4 ? -(ky / maxRadius) : 0
      onMove?.(vector)
    })

    stickZone.addEventListener("pointerup", resetStick)
    stickZone.addEventListener("pointercancel", resetStick)
    stickZone.addEventListener("lostpointercapture", resetStick)
  }

  if (buttons.length > 0) {
    const actionsZone = document.createElement("div")
    actionsZone.className = "hud-touch-actions-zone"
    for (const btn of buttons) {
      const btnEl = document.createElement("button")
      btnEl.className = "hud-action-btn"
      btnEl.textContent = btn.label
      if (btn.color) btnEl.style.borderColor = btn.color

      const actionKey = btn.action ?? btn.id
      const code = `Touch_${actionKey}`
      if (input && actionKey) {
        input.bind(actionKey, [...(input.codes(actionKey) ?? []), code])
      }

      function press(e: Event) {
        e.preventDefault?.()
        btnEl.classList.add("is-active")
        input?.press(code)
        onButton?.(btn.id, true)
      }

      function release(e: Event) {
        e.preventDefault?.()
        btnEl.classList.remove("is-active")
        input?.release(code)
        onButton?.(btn.id, false)
      }

      btnEl.addEventListener("pointerdown", press)
      btnEl.addEventListener("pointerup", release)
      btnEl.addEventListener("pointercancel", release)
      btnEl.addEventListener("lostpointercapture", release)
      actionsZone.appendChild(btnEl)
    }
    root.appendChild(actionsZone)
  }

  return {
    element: root,
    vector,
    remove() {
      root.remove()
    },
  }
}


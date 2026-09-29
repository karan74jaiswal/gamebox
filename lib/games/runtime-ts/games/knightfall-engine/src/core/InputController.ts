import type { InputManager } from '../../../../engine/types.ts';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * Flight input powered by Gamebox InputManager with keyboard & gamepad support.
 * steerX/steerY are the steering axes in [-1, 1]; diveHeld is Shift / Dive.
 */
export class InputController {
  steerX = 0;
  steerY = 0;
  diveHeld = false;

  private keyX = 0;
  private keyY = 0;
  private keyDive = false;
  private readonly keys = new Set<string>();
  private restartHandlers: Array<() => void> = [];
  private skipHandlers: Array<() => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engineInput?: InputManager
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  /** Call once per frame: eases keyboard axes and folds them into steering. */
  update(delta: number): void {
    // 1. Read from Gamebox engine input if available
    if (this.engineInput) {
      if (this.engineInput.pressed('restart')) {
        for (const h of this.restartHandlers) h();
      }
      if (this.engineInput.pressed('jump') || this.engineInput.pressed('fire')) {
        for (const h of this.skipHandlers) h();
      }
    }

    const wantX =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const wantY =
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) -
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);

    // Merge with engineInput.move if active
    const engineX = this.engineInput ? this.engineInput.move.x : 0;
    const engineY = this.engineInput ? this.engineInput.move.y : 0;
    const finalWantX = Math.abs(engineX) > 0.1 ? engineX : wantX;
    const finalWantY = Math.abs(engineY) > 0.1 ? engineY : wantY;

    // Ease so tapping a key banks smoothly instead of snapping to full lock.
    const rate = Math.min(1, delta * 6);
    this.keyX += (finalWantX - this.keyX) * rate;
    this.keyY += (finalWantY - this.keyY) * rate;

    this.steerX = clamp(this.keyX, -1, 1);
    this.steerY = clamp(this.keyY, -1, 1);
    this.diveHeld = this.keyDive || Boolean(this.engineInput?.down('dive'));
  }

  onRestart(handler: () => void): void {
    this.restartHandlers.push(handler);
  }

  onSkip(handler: () => void): void {
    this.skipHandlers.push(handler);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.restartHandlers = [];
    this.skipHandlers = [];
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;

    if (event.code === 'KeyR' && !event.repeat) {
      for (const handler of this.restartHandlers) handler();
      return;
    }

    if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) {
      for (const handler of this.skipHandlers) handler();
      return;
    }

    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.keyDive = true;
      return;
    }

    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) {
      this.keys.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.keyDive = false;
      return;
    }
    this.keys.delete(event.code);
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.keyDive = false;
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };
}

import * as THREE from 'three';
import { AdaptiveResolution } from '../core/AdaptiveResolution';
import { InputController } from '../core/InputController';
import { Batman } from '../entities/Batman';
import { BatSignal } from '../systems/BatSignal';
import { Blimps } from '../systems/Blimps';
import { CameraRig } from '../systems/CameraRig';
import { City, HORIZON_COLOR } from '../systems/City';
import { FlightModel } from '../systems/FlightModel';
import { Hud } from '../systems/Hud';
import { Lightning } from '../systems/Lightning';
import { MissionComplete } from '../systems/MissionComplete';
import { PauseMenu } from '../systems/PauseMenu';
import { PostFX } from '../systems/PostFX';
import { Rain } from '../systems/Rain';
import { Sky } from '../systems/Sky';
import { ScreenFade } from '../systems/ScreenFade';
import { TitleScreen } from '../systems/TitleScreen';
import { createSeededRandom } from '../utils/random';
import { loadAssets, type LoadedAssets } from './Assets';
import {
  BLIMP_CONTACT_RADIUS,
  CONTACT_CLEARANCE,
  CRASH_FADE_DURATION,
  LANDING_DURATION,
  Phase,
} from './Phases';
import { WORLD } from './World';
import { createGame, type Game as EngineGame, math } from '../../../../engine/index.ts';

const MAX_DPR = 1.75;
const HERO_CINEMATIC_SCALE = 1.8;
const RISE_DELAY = 0.9;

/**
 * Knightfall Gotham flight simulation powered natively by Gamebox Engine.
 * Built using createGame(), engine.onUpdate, engine.audio, and engine.input.
 */
export class Game {
  readonly engine: EngineGame;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly input: InputController;
  private readonly hud = new Hud();
  private readonly rig: CameraRig;
  private readonly flight = new FlightModel();
  private readonly resolution = new AdaptiveResolution(MAX_DPR);

  private readonly pauseMenu = new PauseMenu(
    (paused) => this.handlePauseChange(paused),
    () => this.restart(),
  );

  private readonly titleScreen = new TitleScreen(() => this.beginGlide());
  private readonly missionComplete = new MissionComplete(() => this.restart());
  private readonly screenFade = new ScreenFade();

  private rng = createSeededRandom(7);
  private paused = false;
  private phase: Phase = Phase.Loading;
  private phaseTime = 0;
  private frame = 0;
  private lastDelta = 1 / 60;
  private elapsed = 0;
  private pausedForScreenshot = false;
  private reducedMotion = false;
  private promptTimer = 0;

  // Populated once loading succeeds.
  private batman: Batman | null = null;
  private city: City | null = null;
  private sky: Sky | null = null;
  private rain: Rain | null = null;
  private lightning: Lightning | null = null;
  private blimps: Blimps | null = null;
  private batSignal: BatSignal | null = null;
  private postFx: PostFX | null = null;

  private readonly titleAnchor = new THREE.Vector3();
  private readonly landingFrom = new THREE.Vector3();
  private readonly landingTo = new THREE.Vector3();
  private landingHeading = 0;
  private readonly cameraVelocity = new THREE.Vector3();
  private readonly previousCameraPosition = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly scratchB = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // 1. Initialize through Gamebox engine
    this.engine = createGame({
      canvas,
      fov: 55,
      near: 1.5,
      far: 9000,
      shadows: false,
      exposure: 1.18,
      background: null,
      actions: {
        dive: ['ShiftLeft', 'ShiftRight'],
        bankLeft: ['KeyA', 'ArrowLeft'],
        bankRight: ['KeyD', 'ArrowRight'],
        pitchDown: ['KeyW', 'ArrowUp'],
        pitchUp: ['KeyS', 'ArrowDown'],
        restart: ['KeyR'],
        skip: ['Space', 'Enter'],
      },
    });

    this.renderer = this.engine.renderer;
    this.renderer.info.autoReset = false;
    this.scene = this.engine.scene;
    this.camera = this.engine.camera as THREE.PerspectiveCamera;
    this.scene.fog = new THREE.FogExp2(HORIZON_COLOR, 0.00015);
    this.rig = new CameraRig(this.camera);

    this.input = new InputController(canvas, this.engine.input);
    this.input.onRestart(() => {
      if (this.phase === Phase.Glide) this.restart();
    });
    this.input.onSkip(() => {
      if (this.phase === Phase.Title) this.beginGlide();
    });

    // 2. Connect frame updates to Gamebox engine loop
    this.engine.onUpdate((delta: number, elapsed: number) => this.update(delta, elapsed));
    this.engine.onLateUpdate(() => this.render());

    this.installTestHooks();
  }

  start(): void {
    this.engine.start();
    void this.initialize();
  }

  dispose(): void {
    this.disposed = true;
    this.engine.stop();
    this.engine.engine.dispose();
    this.input.dispose();
    this.pauseMenu.dispose();
    this.titleScreen.dispose();
    this.missionComplete.dispose();
    this.postFx?.dispose();
    this.batman?.dispose();
    this.city?.dispose();
    this.sky?.dispose();
    this.rain?.dispose();
    this.blimps?.dispose();
    this.batSignal?.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private async initialize(): Promise<void> {
    this.hud.setLoadingProgress(0, 'INITIALIZING');
    let assets: LoadedAssets;
    try {
      assets = await loadAssets((fraction, label) => {
        this.hud.setLoadingProgress(fraction, label);
      });
    } catch (error) {
      this.hud.setLoadingError(
        `SIGNAL LOST — ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (this.disposed) return;
    this.buildWorld(assets);
    this.hud.setLoadingProgress(1, 'AIRBORNE');
    this.hud.finishLoading();
    this.pauseMenu.setEnabled(true);
    this.beginTitle();
  }

  private buildWorld(assets: LoadedAssets): void {
    this.sky = new Sky(this.scene, assets.skybox);
    this.city = new City(
      {
        spire: assets.city.spire,
        slab: assets.city.slab,
        twin: assets.city.twin,
        neonBlock: assets.city.neonBlock,
        industrial: assets.city.industrial,
        bridge: assets.city.bridge,
        ferrisWheel: assets.city.ferrisWheel,
        signalTower: assets.signalTower,
      },
      this.rng,
    );
    this.scene.add(this.city.group);

    this.batman = new Batman(assets.batmanModel, assets.batmanClips, assets.cape);
    this.scene.add(this.batman.group);

    this.rain = new Rain(this.rng);
    this.scene.add(this.rain.lines);

    this.lightning = new Lightning(this.sky.flashLight, this.rng);

    this.blimps = new Blimps(assets.blimp, this.rng);
    this.scene.add(this.blimps.group);

    this.batSignal = new BatSignal(this.city.spireTopY);
    this.scene.add(this.batSignal.group);

    this.postFx = new PostFX(this.renderer, this.scene, this.camera);
    this.syncPostFxSize();

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__KNIGHTFALL_DEBUG__ = {
        scene: this.scene,
        camera: this.camera,
        batman: this.batman,
        city: this.city,
        blimps: this.blimps,
        flight: this.flight,
        input: this.input,
        rig: this.rig,
        THREE,
      };
    }
  }

  private beginTitle(): void {
    if (!this.batman) return;
    this.phase = Phase.Title;
    this.phaseTime = 0;
    this.rig.cinematic = true;
    this.hud.setHudVisible(false);
    this.hud.hidePrompt();
    this.hud.setControlHintVisible(false);
    this.missionComplete.hide();
    this.titleAnchor.copy(WORLD.jumpPosition).add(this.scratch.set(0, -360, -520));
    this.batman.setState('glide');
    this.batman.proneOverride = null;
    this.batman.group.scale.setScalar(1);
    this.batman.group.position.copy(this.titleAnchor);
    this.batman.group.rotation.set(0, Math.PI, 0);
    this.batman.resetWing();
    this.titleScreen.show();
  }

  private beginGlide(): void {
    if (!this.batman) return;
    this.phase = Phase.Glide;
    this.phaseTime = 0;
    this.rig.cinematic = false;
    this.titleScreen.hide();
    this.missionComplete.hide();
    this.flight.reset(this.titleAnchor, Math.PI, 46);
    this.batman.setState('glide');
    this.batman.proneOverride = null;
    this.batman.group.scale.setScalar(1);
    this.batman.group.position.copy(this.flight.position);
    this.batman.group.rotation.set(-this.flight.pitch, this.flight.heading, 0);
    this.batman.resetWing();
    this.rig.snapBehind(this.flight.position, this.flight.heading, this.flight.pitch);
    this.hud.setHudVisible(true);
    this.hud.setControlHintVisible(true);
    this.hud.showPrompt('TAKE FLIGHT');
    this.promptTimer = 2.4;
  }

  private beginCrash(): void {
    if (!this.batman) return;
    this.phase = Phase.Crash;
    this.phaseTime = 0;
    this.hud.setHudVisible(false);
    this.hud.hidePrompt();
    this.hud.setControlHintVisible(false);
    this.lightning?.forceStrike();
    this.rig.addImpulse(1.4);
    this.screenFade.setOpaque(true);
  }

  private beginLanding(): void {
    const city = this.city;
    if (!this.batman || !city) return;
    this.phase = Phase.Landing;
    this.phaseTime = 0;
    this.rig.cinematic = true;
    this.hud.setHudVisible(false);
    this.hud.hidePrompt();
    this.hud.setControlHintVisible(false);
    this.landingFrom.copy(this.flight.position);
    this.landingHeading = this.flight.heading;

    const pad = city.landingPad;
    this.landingTo.copy(this.flight.position).sub(pad.center);
    this.landingTo.y = 0;
    const radial = this.landingTo.length();
    const inboard = pad.radius * 0.55;
    if (radial > inboard) this.landingTo.multiplyScalar(inboard / radial);
    this.landingTo.add(pad.center);
    this.landingTo.y = pad.roofY + 0.05;

    this.batman.setState('flare');
    this.batman.proneOverride = null;
    this.batman.group.scale.setScalar(HERO_CINEMATIC_SCALE);
    this.lightning?.forceStrike();
  }

  private beginComplete(): void {
    if (!this.batman) return;
    this.phase = Phase.Complete;
    this.phaseTime = 0;
    this.batman.setState('perch');
    this.batman.group.scale.setScalar(HERO_CINEMATIC_SCALE);
    this.rig.addImpulse(0.6);
    this.missionComplete.show();
  }

  private restart(): void {
    this.screenFade.setOpaque(false);
    this.missionComplete.hide();
    this.beginTitle();
  }

  private handlePauseChange(paused: boolean): void {
    this.paused = paused;
    this.hud.setHudVisible(!paused && this.phase === Phase.Glide);
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    this.lastDelta = delta;
    if (this.pausedForScreenshot || this.paused) {
      this.resolution.resume();
      this.publishDiagnostics();
      return;
    }
    const animDelta = this.reducedMotion ? 0 : delta;
    this.elapsed = elapsed;

    const rescaled = this.resolution.sample();
    const width = Math.max(1, Math.floor(this.canvas.clientWidth));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight));
    const dpr = this.effectiveDpr();
    const bufferWidth = Math.floor(width * dpr);
    const bufferHeight = Math.floor(height * dpr);
    const needsResize = this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight;

    if (needsResize || rescaled) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.syncPostFxSize();
      this.resolution.resume();
    }

    switch (this.phase) {
      case Phase.Loading:
        break;
      case Phase.Title:
        this.updateTitle(animDelta);
        break;
      case Phase.Glide:
        this.updateGlide(animDelta);
        break;
      case Phase.Landing:
        this.updateLanding(animDelta);
        break;
      case Phase.Complete:
        this.updateComplete(animDelta);
        break;
      case Phase.Crash:
        this.updateCrash(animDelta);
        break;
    }

    this.updateShared(animDelta, elapsed);
    this.publishDiagnostics();
  }

  private updateTitle(delta: number): void {
    const batman = this.batman;
    if (!batman) return;
    this.phaseTime += delta;
    const t = this.phaseTime;

    const previous = this.scratchB.copy(batman.group.position);
    batman.group.position.copy(this.titleAnchor);
    batman.group.position.y += Math.sin(t * 0.5) * 1.6;
    batman.group.rotation.set(
      math.degToRad(6) + Math.sin(t * 0.37) * 0.04,
      Math.PI + Math.sin(t * 0.23) * 0.09,
      Math.sin(t * 0.31) * 0.05,
    );

    const velocity = delta > 0
      ? this.scratch.copy(batman.group.position).sub(previous).divideScalar(delta)
      : this.scratch.set(0, 0, 0);
    batman.update(delta, velocity, 0.55);

    const angle = Math.PI + t * 0.055;
    const radius = 13;
    this.scratch.set(
      batman.group.position.x + Math.sin(angle) * radius,
      batman.group.position.y + 1.2 + Math.sin(t * 0.29) * 0.5,
      batman.group.position.z + Math.cos(angle) * radius,
    );
    this.scratchB.copy(batman.group.position).add(this.tmpLook.set(0, -0.7, 0));
    this.rig.setCinematicFrame(this.scratch, this.scratchB, 40);
  }

  private updateGlide(delta: number): void {
    const batman = this.batman;
    const city = this.city;
    if (!batman || !city) return;
    this.phaseTime += delta;

    this.input.update(delta);
    this.flight.update(delta, this.input);

    const towerContact = city.landingTowerContact(this.flight.position);
    if (towerContact === 'pad') {
      batman.group.position.copy(this.flight.position);
      this.beginLanding();
      return;
    }
    if (towerContact === 'shaft' || this.hasContact(city)) {
      batman.group.position.copy(this.flight.position);
      this.beginCrash();
      return;
    }

    batman.group.position.copy(this.flight.position);
    batman.group.rotation.order = 'YXZ';
    batman.group.rotation.y = this.flight.heading;
    batman.group.rotation.x = -this.flight.pitch * 0.9;
    batman.group.rotation.z = this.flight.roll;
    batman.setState(this.flight.diveAmount > 0.5 ? 'dive' : 'glide');
    const bank = math.clamp(this.flight.roll / math.degToRad(58), -1, 1);
    batman.update(
      delta,
      this.flight.velocity,
      0.35 + this.flight.diveAmount * 1.5,
      bank,
    );

    this.rig.updateChase(
      delta,
      this.flight.position,
      this.flight.heading,
      this.flight.pitch,
      this.flight.roll,
      this.flight.diveAmount,
    );

    if (this.promptTimer > 0) {
      this.promptTimer -= delta;
      if (this.promptTimer <= 0) this.hud.hidePrompt();
    }

    this.hud.update(
      this.flight.heading,
      city.landingPad.center,
      this.flight.position.distanceTo(city.landingPad.center),
      this.camera,
    );
  }

  private hasContact(city: City): boolean {
    const { x, y, z } = this.flight.position;
    const surface = Math.max(city.groundHeightAt(x, z), WORLD.oceanLevel);
    if (y <= surface + CONTACT_CLEARANCE) return true;
    const blimp = this.blimps?.nearestDistance(this.flight.position) ?? Infinity;
    return blimp < BLIMP_CONTACT_RADIUS;
  }

  private updateLanding(delta: number): void {
    const batman = this.batman;
    const city = this.city;
    if (!batman || !city) return;
    this.phaseTime += delta;
    const pad = city.landingPad;

    const t = Math.min(1, this.phaseTime / LANDING_DURATION);
    const eased = 1 - Math.pow(1 - t, 3);
    const settle = Math.min(1, t * 1.35);

    const previous = this.scratchB.copy(batman.group.position);
    batman.group.position.lerpVectors(this.landingFrom, this.landingTo, eased);
    batman.group.position.y += Math.sin(t * Math.PI) * 1.8 * (1 - t);

    const currentHeading = math.lerp(this.landingHeading, Math.PI, eased);
    batman.group.rotation.set(0, currentHeading, 0);

    const velocity = delta > 0
      ? this.scratch.copy(batman.group.position).sub(previous).divideScalar(delta)
      : this.scratch.set(0, 0, 0);
    batman.update(delta, velocity, 0.4 + Math.sin(eased * Math.PI) * 1.7);

    const hero = batman.group.position;
    const baseAngle = Math.atan2(
      this.landingFrom.x - this.landingTo.x,
      this.landingFrom.z - this.landingTo.z,
    );
    const orbitAngle = baseAngle - 0.55 + settle * 0.55;
    const radius = math.lerp(15, 11, settle);
    this.scratch.set(
      hero.x + Math.sin(orbitAngle) * radius,
      Math.max(hero.y + math.lerp(5, 1.7, settle), pad.roofY + 1.9),
      hero.z + Math.cos(orbitAngle) * radius,
    );
    this.scratchB.set(hero.x, hero.y + 2.4, hero.z);
    this.rig.setCinematicFrame(this.scratch, this.scratchB, 42);

    if (this.phaseTime >= LANDING_DURATION) this.beginComplete();
  }

  private updateComplete(delta: number): void {
    const batman = this.batman;
    const city = this.city;
    if (!batman || !city) return;
    this.phaseTime += delta;
    const pad = city.landingPad;

    if (this.phaseTime > RISE_DELAY) batman.setState('stand', 1.1);
    batman.update(delta, this.scratch.set(0, 0, 0), 0.3);

    const hero = batman.group.position;
    const angle = Math.PI
      + Math.sin(this.phaseTime * 0.11) * 0.22
      + this.phaseTime * 0.03;
    const radius = 11.5;
    this.scratch.set(
      hero.x + Math.sin(angle) * radius,
      Math.max(hero.y + 1.5, pad.roofY + 1.9),
      hero.z + Math.cos(angle) * radius,
    );
    this.scratchB.set(hero.x, hero.y + 2.4, hero.z);
    this.rig.setCinematicFrame(this.scratch, this.scratchB, 42);
  }

  private updateCrash(delta: number): void {
    const batman = this.batman;
    if (!batman) return;
    this.phaseTime += delta;
    this.rig.updateChase(
      delta,
      batman.group.position,
      this.flight.heading,
      this.flight.pitch,
      this.flight.roll,
      0,
    );
    if (this.phaseTime >= CRASH_FADE_DURATION) this.restart();
  }

  private updateShared(delta: number, elapsed: number): void {
    this.cameraVelocity
      .copy(this.camera.position)
      .sub(this.previousCameraPosition)
      .divideScalar(Math.max(delta, 1 / 240));
    this.previousCameraPosition.copy(this.camera.position);

    this.rain?.update(elapsed, this.camera.position, this.cameraVelocity);
    this.blimps?.update(delta, elapsed);
    this.city?.update(elapsed);
    this.sky?.update(this.camera.position);
    this.batSignal?.update(elapsed);
    const heroPosition = this.batman ? this.batman.group.position : this.camera.position;
    this.lightning?.update(delta, elapsed, heroPosition);
  }

  private render(): void {
    this.renderer.info.reset();
    if (this.postFx) {
      this.postFx.render(
        this.lastDelta,
        this.elapsed,
        this.phase === Phase.Glide ? this.flight.diveAmount : 0,
        this.lightning?.flashAmount ?? 0,
      );
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private syncPostFxSize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.postFx?.setSize(width, height, this.effectiveDpr());
  }

  private effectiveDpr(): number {
    return Math.min(window.devicePixelRatio || 1, this.resolution.dpr);
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
      },
      setState: (name: string) => {
        if (name !== 'title') this.titleScreen.hide();
        const pad = this.city?.landingPad;
        if (name === 'active-play') this.beginGlide();
        else if (name === 'near-pad' && pad) {
          this.beginGlide();
          this.flight.reset(
            this.scratch.copy(pad.center).add(this.scratchB.set(0, 60, 300)),
            Math.PI,
            56,
          );
          this.rig.snapBehind(this.flight.position, this.flight.heading, this.flight.pitch);
        } else if (name === 'land' && pad) {
          this.beginGlide();
          this.flight.reset(
            this.scratch.copy(pad.center).add(this.scratchB.set(0, 8, 90)),
            Math.PI,
            44,
          );
          this.beginLanding();
        } else if (name === 'complete' && pad) {
          this.landingHeading = Math.PI;
          this.flight.reset(this.scratch.copy(pad.center).setY(pad.roofY + 0.05), Math.PI, 0);
          if (this.batman) {
            this.batman.group.position.copy(this.flight.position);
            this.batman.group.rotation.set(0, Math.PI, 0);
            this.batman.setState('perch');
            this.batman.resetWing();
          }
          this.rig.cinematic = true;
          this.hud.setHudVisible(false);
          this.hud.setControlHintVisible(false);
          this.beginComplete();
        } else if (name === 'crash' && pad) {
          this.flight.reset(this.scratch.copy(pad.center).setY(pad.roofY - 90), Math.PI, 50);
          if (this.batman) this.batman.group.position.copy(this.flight.position);
          this.beginCrash();
        } else console.warn(`Unknown test state: ${name}`);
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => {},
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      score: this.phase === Phase.Complete ? 1 : 0,
      targetScore: 1,
      complete: this.phase === Phase.Complete,
      player: {
        position: {
          x: this.flight.position.x,
          y: this.flight.position.y,
          z: this.flight.position.z,
        },
        speed: this.flight.speed,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.effectiveDpr(),
      },
      frameMs: this.resolution.frameMs,
      phase: this.phase,
    };
  }
}

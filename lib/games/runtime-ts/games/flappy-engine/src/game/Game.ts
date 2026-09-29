import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BIRDS,
  DEFAULT_BIRD_ID,
  findBird,
  loadBirdModel,
  loadCoreModels,
  prefetchBirds,
  AUDIO_URLS,
  type BirdId,
  type LoadedModel,
} from '../assets/assets';
import { Bird } from '../entities/Bird';
import { PipeField } from '../entities/PipeField';
import { Hud } from '../systems/Hud';
import { createSeededRandom } from '../utils/random';
import { Environment } from '../world/Environment';
import { TUNING } from './tuning';
import { createGame, type Game as EngineGame, math } from '../../../../engine/index.ts';

type GameState = 'loading' | 'failed' | 'ready' | 'playing' | 'dying' | 'over';

// Ignore taps briefly after death so the crash tap doesn't instantly restart.
const RESTART_COOLDOWN = 0.45;

const BIRD_STORAGE_KEY = 'flappybird3d.bird';

function readStoredBird(): BirdId {
  try {
    return findBird(window.localStorage.getItem(BIRD_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_BIRD_ID;
  }
}

function storeBird(id: BirdId): void {
  try {
    window.localStorage.setItem(BIRD_STORAGE_KEY, id);
  } catch {
    // Selection still applies for this session.
  }
}

/**
 * Flappy Bird 3D powered natively by the Gamebox Engine.
 * Built using createGame(), engine.onUpdate, engine.audio, and engine.input.
 */
export class Game {
  readonly engine: EngineGame;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly hud = new Hud();

  private state: GameState = 'loading';
  private bird: Bird | null = null;
  private pipes: PipeField | null = null;
  private environment: Environment | null = null;
  private birdModel: LoadedModel | null = null;
  private birdId: BirdId = readStoredBird();

  private frame = 0;
  private score = 0;
  private elapsed = 0;
  private stateTime = 0;
  private cameraY = TUNING.birdStartY + TUNING.cameraHeight;
  private shakeTime = 0;
  private dieSoundPlayed = false;
  private rng = createSeededRandom(Math.floor(performance.now()) || 1);
  private pausedForScreenshot = false;
  private reducedMotion = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // 1. Initialize through Gamebox engine
    this.engine = createGame({
      canvas,
      fov: TUNING.cameraFov,
      near: 0.1,
      far: 160,
      shadows: true,
      background: null,
      actions: {
        flap: ['Space', 'Enter', 'KeyW', 'ArrowUp'],
      },
    });

    this.renderer = this.engine.renderer;
    this.scene = this.engine.scene;
    this.camera = this.engine.camera as THREE.PerspectiveCamera;

    // 2. Preload game sound assets into engine audio
    this.preloadAudio();

    // 3. World lighting, sky gradient, and reflections
    this.createSky();
    this.updateCamera(0, true);

    // 4. Input wiring: canvas pointer taps + engine action bindings
    canvas.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      this.handleFlap();
    });

    // 5. Connect frame updates to Gamebox engine loop
    this.engine.onUpdate((delta: number, elapsed: number) => this.update(delta, elapsed));
    this.engine.onLateUpdate(() => this.render());

    // 6. HUD events
    this.hud.onMuteToggle(() => {
      if (this.engine.audio.isMuted()) {
        this.engine.audio.unmute();
      } else {
        this.engine.audio.mute();
      }
      this.hud.setMuted(this.engine.audio.isMuted());
    });
    this.hud.onRestart(() => {
      if (this.state === 'over') this.restart();
    });
    this.hud.buildBirdOptions(BIRDS, this.birdId, (id) => void this.selectBird(id));
    this.hud.setMuted(false);
    this.hud.setScore(0);
    this.hud.setLoading('Loading…');

    void this.loadAssets();
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.engine.start();
  }

  dispose(): void {
    this.engine.stop();
    this.engine.engine.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private preloadAudio(): void {
    for (const [name, url] of Object.entries(AUDIO_URLS)) {
      void this.engine.audio.load(name, url);
    }
  }

  private playSound(name: keyof typeof AUDIO_URLS): void {
    try {
      this.engine.audio.play(name);
    } catch {
      // Procedural fallback sounds
      if (name === 'flap') this.engine.audio.play('jump', { volume: 0.45 });
      else if (name === 'hit') this.engine.audio.play('hit', { volume: 0.7 });
      else if (name === 'die') this.engine.audio.play('hurt', { volume: 0.8 });
      else if (name === 'point') this.engine.audio.play('coin', { volume: 0.5 });
      else if (name === 'swoosh') this.engine.audio.play('laser', { volume: 0.3 });
    }
  }

  private async loadAssets(): Promise<void> {
    try {
      const models = await loadCoreModels(this.birdId);
      this.birdModel = models.bird;
      this.pipes = new PipeField(models.pipe, this.rng);
      this.environment = new Environment(models.cloud, this.rng);
      this.scene.add(this.environment.group, this.pipes.group);
      this.spawnBird();
      this.hud.setLoading(null);
      this.hud.showStart();
      this.state = 'ready';
      prefetchBirds();
    } catch (error) {
      if (this.state !== 'failed') {
        this.state = 'failed';
        console.error('Asset loading failed:', error);
        this.hud.setLoading('Failed to load game assets. Refresh to retry.', true);
      }
    }
  }

  private spawnBird(): void {
    if (!this.birdModel) return;
    if (this.bird) this.scene.remove(this.bird.group);
    this.bird = new Bird(this.birdModel, findBird(this.birdId));
    this.scene.add(this.bird.group);
    this.updateCamera(0, true);
  }

  private async selectBird(id: BirdId): Promise<void> {
    if (id === this.birdId) return;
    this.birdId = id;
    storeBird(id);
    try {
      const model = await loadBirdModel(id);
      if (this.birdId !== id) return;
      this.birdModel = model;
      this.spawnBird();
    } catch (error) {
      console.error(`Failed to load bird "${id}":`, error);
      this.hud.setLoading('That bird failed to load.', true);
    }
  }

  private handleFlap(): void {
    if (this.hud.isPickerOpen()) return;

    switch (this.state) {
      case 'ready':
        this.beginPlay();
        break;
      case 'playing':
        this.bird?.flap();
        this.playSound('flap');
        break;
      case 'over':
        if (this.stateTime > RESTART_COOLDOWN) this.restart();
        break;
      default:
        break;
    }
  }

  private beginPlay(): void {
    if (!this.bird) return;
    this.setState('playing');
    this.score = 0;
    this.hud.setScore(0);
    this.hud.showPlaying();
    this.bird.flap();
    this.playSound('flap');
  }

  private restart(): void {
    if (!this.bird || !this.pipes) return;
    this.bird.reset();
    this.pipes.reset();
    this.beginPlay();
  }

  private die(): void {
    if (!this.bird || this.state !== 'playing') return;
    this.setState('dying');
    this.bird.kill();
    this.playSound('hit');
    this.dieSoundPlayed = false;
    this.shakeTime = 0.35;
  }

  private setState(state: GameState): void {
    this.state = state;
    this.stateTime = 0;
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    // Engine keyboard action check
    if (this.engine.input.pressed('flap')) {
      this.handleFlap();
    }

    this.elapsed += delta;
    this.stateTime += delta;
    const animElapsed = this.reducedMotion ? 0 : elapsed;
    const animDelta = this.reducedMotion ? 0 : delta;

    switch (this.state) {
      case 'ready':
        this.bird?.updateIdle(animElapsed);
        this.environment?.update(animDelta);
        break;

      case 'playing': {
        if (!this.bird || !this.pipes) break;
        this.bird.updatePhysics(delta, elapsed);
        this.environment?.update(delta);

        const result = this.pipes.update(delta, this.bird.y, this.bird.colliderRadius);
        if (result.passed > 0) {
          this.score += result.passed;
          this.hud.setScore(this.score);
          this.playSound('point');
        }
        if (result.hit || this.bird.isOnGround()) {
          this.die();
        }
        break;
      }

      case 'dying':
        this.bird?.updatePhysics(delta, elapsed);
        if (!this.dieSoundPlayed && this.stateTime > 0.25) {
          this.dieSoundPlayed = true;
          this.playSound('die');
        }
        if ((this.bird?.isOnGround() ?? true) || this.stateTime > 1.1) {
          this.setState('over');
          this.hud.showGameOver(this.score);
        }
        break;

      default:
        break;
    }

    this.updateCamera(delta);
    this.publishDiagnostics();
  }

  private updateCamera(delta: number, snap = false): void {
    const targetY = (this.bird?.y ?? TUNING.birdStartY) + TUNING.cameraHeight;
    this.cameraY = snap
      ? targetY
      : math.lerp(this.cameraY, targetY, 1 - Math.exp(-TUNING.cameraLag * delta));

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= delta;
      const strength = this.shakeTime * 0.5;
      shakeX = (this.rng() - 0.5) * strength;
      shakeY = (this.rng() - 0.5) * strength;
    }

    this.camera.position.set(shakeX, this.cameraY + shakeY, TUNING.cameraDistance);
    this.camera.lookAt(0, this.cameraY - 1.3, -12);
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private createSky(): void {
    this.scene.background = this.createSkyGradient();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog('#a9e9f2', 60, 190);

    this.renderer.toneMappingExposure = 1.2;
    const hemisphere = new THREE.HemisphereLight('#eafcff', '#3fc6dd', 1.3);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight('#fffbe8', 2.1);
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 60;
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 26;
    sun.shadow.camera.bottom = -26;
    this.scene.add(sun);
  }

  private createSkyGradient(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create sky texture context.');

    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#1273d4');
    gradient.addColorStop(0.45, '#43b4e8');
    gradient.addColorStop(0.78, '#8fdcf2');
    gradient.addColorStop(1, '#c6f2f8');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
        this.pipes?.setRng(this.rng);
      },
      setState: (name: string) => {
        if (name === 'active-play') {
          if (this.bird && this.pipes) this.restart();
        } else if (name === 'complete') {
          if (this.state === 'playing') this.die();
          else if (this.state === 'ready') {
            this.beginPlay();
            this.die();
          }
        }
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
      score: this.score,
      targetScore: 0,
      complete: this.state === 'over',
      player: {
        position: {
          x: 0,
          y: this.bird?.y ?? TUNING.birdStartY,
          z: 0,
        },
        speed: Math.abs(this.bird?.velocityY ?? 0),
      },
      nextPipe: this.pipes?.nextGapAhead() ?? null,
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
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      },
    };
  }
}

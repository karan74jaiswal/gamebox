/**
 * 100% Self-Contained Procedural Sound & Music Synthesizer (Web Audio API).
 * Zero external audio files, zero 404s, zero CORS issues, instant playback.
 * Automatically unlocks AudioContext on first user interaction.
 */
export class Sound {
  constructor(options = {}) {
    this.options = {
      masterVolume: options.masterVolume !== undefined ? options.masterVolume : 0.7,
      sfxVolume: options.sfxVolume !== undefined ? options.sfxVolume : 0.8,
      musicVolume: options.musicVolume !== undefined ? options.musicVolume : 0.4,
      ...options,
    };

    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.isMuted = false;
    this.unlocked = false;

    // Music sequencer state
    this.musicPlaying = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.currentTheme = null;

    // Setup unlock listener on first user interaction
    this._setupAutoUnlock();
  }

  _initContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();

    // Master, SFX, and Music gain busses
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.options.masterVolume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(this.options.sfxVolume, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(this.options.musicVolume, this.ctx.currentTime);
    this.musicGain.connect(this.masterGain);
  }

  _setupAutoUnlock() {
    const unlock = () => {
      this._initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.unlocked = true;
        });
      } else if (this.ctx) {
        this.unlocked = true;
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  ensureReady() {
    if (!this.ctx) this._initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMasterVolume(val) {
    this.options.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.options.masterVolume, this.ctx.currentTime);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.options.masterVolume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  // =========================================================================
  // Procedural Sound Effects (SFX)
  // =========================================================================

  /**
   * Laser / Blaster shot: downward frequency sweep.
   */
  laser(options = {}) {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const startFreq = options.startFreq || 900;
    const endFreq = options.endFreq || 120;
    const duration = options.duration || 0.15;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = options.type || 'sawtooth';
    osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  /**
   * Explosion / Impact: Filtered white noise with sub-bass punch.
   */
  explosion(options = {}) {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const duration = options.duration || 0.45;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate white noise with random decay
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter noise to create deep thunderous crunch
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.cutoff || 600, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    // Add sub-bass thump
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.frequency.setValueAtTime(140, this.ctx.currentTime);
    subOsc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + duration * 0.7);
    subGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    subGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration * 0.7);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);

    noise.start();
    subOsc.start();
    noise.stop(this.ctx.currentTime + duration);
    subOsc.stop(this.ctx.currentTime + duration);
  }

  /**
   * Jump sound: upward frequency sweep.
   */
  jump(options = {}) {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const duration = options.duration || 0.2;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  /**
   * Coin / Item pickup: two-tone crisp bell chime.
   */
  coin(options = {}) {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const notes = [987.77, 1318.51]; // B5 -> E6
    const noteTime = 0.08;

    notes.forEach((freq, idx) => {
      const startTime = this.ctx.currentTime + idx * noteTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.18);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(startTime);
      osc.stop(startTime + 0.18);
    });
  }

  /**
   * Power-up: ascending 4-note arpeggio.
   */
  powerup() {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const t = this.ctx.currentTime + i * 0.07;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  /**
   * Hit / Impact: short percussive strike.
   */
  hit() {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(220, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.09);
  }

  /**
   * Hurt / Damage grunt.
   */
  hurt() {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(70, this.ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.45, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.18);
  }

  /**
   * Click / UI blip.
   */
  click() {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  /**
   * Victory fanfare: triumphant 5-note brass progression.
   */
  victory() {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const notes = [
      { f: 523.25, d: 0.15 }, // C5
      { f: 659.25, d: 0.15 }, // E5
      { f: 783.99, d: 0.15 }, // G5
      { f: 659.25, d: 0.12 }, // E5
      { f: 1046.50, d: 0.5 }, // C6
    ];

    let t = this.ctx.currentTime;
    notes.forEach((note) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + note.d);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + note.d);
      t += note.d * 0.9;
    });
  }

  /**
   * Game Over sound: sad descending tones.
   */
  gameOver() {
    this.ensureReady();
    if (!this.ctx || this.isMuted) return;

    const notes = [440, 415.3, 392, 349.23]; // A4, Ab4, G4, F4
    let t = this.ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.35);
      t += 0.28;
    });
  }

  // =========================================================================
  // Procedural Background Music (BGM)
  // =========================================================================

  /**
   * Starts a procedural tempo-synced looped background music sequencer.
   * Themes: 'arcade', 'synthwave', 'action', 'ambient'
   */
  startMusic(theme = 'arcade') {
    this.stopMusic();
    this.ensureReady();
    this.musicPlaying = true;
    this.currentTheme = theme;
    this.musicStep = 0;

    const tempo = theme === 'action' ? 140 : theme === 'arcade' ? 128 : 110;
    const stepIntervalMs = (60 / tempo / 4) * 1000; // 16th notes

    // Sequences (frequencies in Hz, 0 = rest)
    const arcadeBass = [130.81, 0, 130.81, 0, 164.81, 0, 196.00, 0, 146.83, 0, 146.83, 0, 174.61, 0, 220.00, 0];
    const arcadeLead = [523.25, 659.25, 783.99, 0, 659.25, 783.99, 1046.5, 0, 587.33, 698.46, 880.00, 0, 783.99, 659.25, 523.25, 0];

    const synthwaveBass = [65.41, 65.41, 65.41, 65.41, 82.41, 82.41, 82.41, 82.41, 98.00, 98.00, 98.00, 98.00, 73.42, 73.42, 73.42, 73.42];
    const synthwaveChords = [261.63, 0, 329.63, 0, 392.00, 0, 523.25, 0];

    this.musicTimer = setInterval(() => {
      if (!this.musicPlaying || !this.ctx || this.isMuted) return;

      const step = this.musicStep % 16;
      const t = this.ctx.currentTime;

      if (theme === 'arcade') {
        const bassFreq = arcadeBass[step];
        if (bassFreq > 0) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(bassFreq, t);
          g.gain.setValueAtTime(0.2, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
          osc.connect(g);
          g.connect(this.musicGain);
          osc.start(t);
          osc.stop(t + 0.12);
        }

        const leadFreq = arcadeLead[step];
        if (leadFreq > 0) {
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(leadFreq, t);
          g.gain.setValueAtTime(0.08, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          osc.connect(g);
          g.connect(this.musicGain);
          osc.start(t);
          osc.stop(t + 0.1);
        }
      } else if (theme === 'synthwave') {
        const bassFreq = synthwaveBass[step];
        if (bassFreq > 0) {
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const g = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(bassFreq, t);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(400, t);
          g.gain.setValueAtTime(0.25, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
          osc.connect(filter);
          filter.connect(g);
          g.connect(this.musicGain);
          osc.start(t);
          osc.stop(t + 0.14);
        }
      }

      this.musicStep++;
    }, stepIntervalMs);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

import * as THREE from 'three';

/**
 * Universal Arcade HUD & UI Overlay Manager.
 * Handles Score, High Score, Health/Shield bars, Floating entity nameplates,
 * Start/Game-Over/Victory screens, 3D-to-2D floating combat text, screen flashes, and minimap radar.
 */
export class HUD {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.camera = engine ? engine.camera : null;
    this.options = {
      title: options.title || 'Gamebox Game',
      subtitle: options.subtitle || 'Built with Gamebox 3D Engine',
      storageKey: options.storageKey || 'gb_high_score',
      showHealth: options.showHealth !== false,
      showScore: options.showScore !== false,
      ...options,
    };

    this.score = 0;
    this.highScore = this._loadHighScore();
    this.health = 100;
    this.maxHealth = 100;

    this.container = null;
    this.overlay = null;
    this.banner = null;
    this.flashOverlay = null;
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.entityBars = [];

    this._createDOM();

    if (this.engine) {
      this.engine.onUpdate(() => this._updateEntityBars());
    }
  }

  _loadHighScore() {
    try {
      return parseInt(localStorage.getItem(this.options.storageKey) || '0', 10);
    } catch {
      return 0;
    }
  }

  _saveHighScore(score) {
    this.highScore = Math.max(this.highScore, score);
    try {
      localStorage.setItem(this.options.storageKey, this.highScore.toString());
    } catch {
      // Storage unavailable in private iframe
    }
  }

  _createDOM() {
    this.container = document.createElement('div');
    this.container.className = 'gb-hud';
    this.container.innerHTML = `
      <!-- Top Header -->
      <div class="gb-hud-header">
        <div class="gb-stat-group">
          <!-- Score Panel -->
          <div class="gb-panel gb-score-panel" id="gb-score-box" style="${this.options.showScore ? '' : 'display:none;'}">
            <div class="gb-score-label">Score</div>
            <div class="gb-score-display">
              <span class="gb-score-value" id="gb-score-val">0</span>
            </div>
            <div class="gb-high-score">BEST: <span id="gb-high-score-val">${this.highScore}</span></div>
          </div>

          <!-- Health Bar -->
          <div class="gb-panel gb-bar-container" id="gb-health-box" style="${this.options.showHealth ? '' : 'display:none;'}">
            <div class="gb-bar-label">
              <span>Health</span>
              <span id="gb-health-text">100%</span>
            </div>
            <div class="gb-bar-track">
              <div class="gb-bar-fill gb-health-fill" id="gb-health-fill" style="width: 100%;"></div>
            </div>
          </div>
        </div>

        <!-- Right Tools: Audio & Minimap -->
        <div class="gb-stat-group" style="align-items: flex-end;">
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="gb-btn-icon" id="gb-btn-sound" title="Toggle Sound">
              <svg id="gb-icon-sound" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
          </div>
          <div id="gb-minimap-wrapper" style="display:none; margin-top: 0.5rem;">
            <canvas class="gb-minimap-canvas" id="gb-minimap"></canvas>
          </div>
        </div>
      </div>

      <!-- Center Banner -->
      <div class="gb-center-banner" id="gb-center-banner" style="opacity: 0;">
        <div class="gb-banner-title" id="gb-banner-title"></div>
        <div class="gb-banner-subtitle" id="gb-banner-sub"></div>
      </div>

      <!-- Full-Screen Interactive Overlays (Start / Game Over / Victory) -->
      <div class="gb-overlay ${this.options.showStartOverlay ? 'active' : ''}" id="gb-modal-overlay">
        <div class="gb-card" id="gb-modal-card">
          <h1 id="gb-modal-title">${this.options.title}</h1>
          <p id="gb-modal-desc">${this.options.subtitle}</p>
          <div class="gb-controls-guide" id="gb-modal-controls"></div>
          <button class="gb-btn-primary" id="gb-modal-btn">Start Game</button>
        </div>
      </div>

      <!-- Screen Flash Effect Overlay -->
      <div class="gb-screen-flash" id="gb-screen-flash"></div>
    `;

    document.body.appendChild(this.container);

    this.scoreValEl = document.getElementById('gb-score-val');
    this.highScoreValEl = document.getElementById('gb-high-score-val');
    this.healthTextEl = document.getElementById('gb-health-text');
    this.healthFillEl = document.getElementById('gb-health-fill');
    this.banner = document.getElementById('gb-center-banner');
    this.bannerTitle = document.getElementById('gb-banner-title');
    this.bannerSub = document.getElementById('gb-banner-sub');
    this.overlay = document.getElementById('gb-modal-overlay');
    this.modalCard = document.getElementById('gb-modal-card');
    this.modalTitle = document.getElementById('gb-modal-title');
    this.modalDesc = document.getElementById('gb-modal-desc');
    this.modalControls = document.getElementById('gb-modal-controls');
    this.modalBtn = document.getElementById('gb-modal-btn');
    this.flashOverlay = document.getElementById('gb-screen-flash');

    this._modalAction = null;

    const handleBtnClick = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.hideOverlay();
      if (typeof this._modalAction === 'function') {
        const action = this._modalAction;
        this._modalAction = null;
        action(e);
      }
    };

    if (this.modalBtn) {
      this.modalBtn.addEventListener('click', handleBtnClick);
      this.modalBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.hideOverlay();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && this.overlay && this.overlay.classList.contains('active')) {
        e.preventDefault();
        handleBtnClick(e);
      }
    });

    const soundBtn = document.getElementById('gb-btn-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        if (this.onToggleSound) this.onToggleSound();
      });
    }
  }

  setScore(val) {
    this.score = Math.max(0, Math.floor(val));
    if (this.scoreValEl) this.scoreValEl.textContent = this.score.toLocaleString();
    if (this.score > this.highScore) {
      this._saveHighScore(this.score);
      if (this.highScoreValEl) this.highScoreValEl.textContent = this.highScore.toLocaleString();
    }
  }

  addScore(points, worldPos = null, camera = this.camera) {
    this.setScore(this.score + points);
    if (worldPos && camera) {
      const text = points > 0 ? `+${points}` : `${points}`;
      const color = points > 0 ? '#fb923c' : '#ef4444';
      this.addFloatingText(text, worldPos, camera, color);
    }
  }

  setHealth(current, max = this.maxHealth) {
    this.health = Math.max(0, Math.min(current, max));
    this.maxHealth = max;
    const pct = Math.round((this.health / this.maxHealth) * 100);

    if (this.healthTextEl) this.healthTextEl.textContent = `${pct}%`;
    if (this.healthFillEl) {
      this.healthFillEl.style.width = `${pct}%`;
      if (pct <= 25) {
        this.healthFillEl.style.background = 'linear-gradient(90deg, #b91c1c, #ef4444)';
      } else {
        this.healthFillEl.style.background = 'linear-gradient(90deg, #ef4444, #f97316)';
      }
    }
  }

  /**
   * Spawns an animated 3D-to-2D floating combat text (e.g. +100, CRITICAL, LEVEL UP).
   */
  addFloatingText(text, worldPos, camera = this.camera, color = '#fb923c') {
    if (!camera) return;

    const vec = worldPos instanceof THREE.Vector3 ? worldPos.clone() : new THREE.Vector3(...worldPos);
    vec.project(camera);

    if (vec.z > 1) return;

    const x = ((vec.x + 1) / 2) * window.innerWidth;
    const y = (-(vec.y - 1) / 2) * window.innerHeight;

    const el = document.createElement('div');
    el.className = 'gb-floating-text';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    el.textContent = text;

    this.container.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 800);
  }

  /**
   * Attaches a floating health bar / name tag over a 3D entity in world space.
   */
  createEntityBar(mesh, heightOffset = 2.2, options = {}) {
    const barEl = document.createElement('div');
    barEl.style.position = 'absolute';
    barEl.style.width = options.width || '50px';
    barEl.style.height = '6px';
    barEl.style.background = 'rgba(0,0,0,0.6)';
    barEl.style.border = '1px solid rgba(255,255,255,0.2)';
    barEl.style.borderRadius = '999px';
    barEl.style.overflow = 'hidden';
    barEl.style.pointerEvents = 'none';
    barEl.style.zIndex = '15';
    barEl.style.transform = 'translate(-50%, -50%)';

    const fillEl = document.createElement('div');
    fillEl.style.height = '100%';
    fillEl.style.width = '100%';
    fillEl.style.background = options.color || '#ef4444';
    fillEl.style.transition = 'width 0.15s ease';
    barEl.appendChild(fillEl);

    this.container.appendChild(barEl);

    const tracker = {
      mesh,
      heightOffset,
      element: barEl,
      fill: fillEl,
      setHealth: (cur, max) => {
        const pct = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
        fillEl.style.width = `${pct}%`;
      },
      destroy: () => {
        if (barEl.parentNode) barEl.parentNode.removeChild(barEl);
        const idx = this.entityBars.indexOf(tracker);
        if (idx !== -1) this.entityBars.splice(idx, 1);
      },
    };

    this.entityBars.push(tracker);
    return tracker;
  }

  _updateEntityBars() {
    if (!this.camera || this.entityBars.length === 0) return;
    const v = new THREE.Vector3();

    for (let i = this.entityBars.length - 1; i >= 0; i--) {
      const bar = this.entityBars[i];
      if (!bar.mesh.parent) {
        bar.destroy();
        continue;
      }

      bar.mesh.getWorldPosition(v);
      v.y += bar.heightOffset;
      v.project(this.camera);

      if (v.z > 1) {
        bar.element.style.display = 'none';
      } else {
        bar.element.style.display = 'block';
        const x = ((v.x + 1) / 2) * window.innerWidth;
        const y = (-(v.y - 1) / 2) * window.innerHeight;
        bar.element.style.left = `${x}px`;
        bar.element.style.top = `${y}px`;
      }
    }
  }

  showBanner(title, subtitle = '', duration = 2000) {
    if (!this.banner) return;
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = subtitle;
    this.banner.style.opacity = '1';
    this.banner.style.transform = 'translate(-50%, -50%) scale(1.1)';

    setTimeout(() => {
      this.banner.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 150);

    clearTimeout(this._bannerTimeout);
    this._bannerTimeout = setTimeout(() => {
      this.banner.style.opacity = '0';
    }, duration);
  }

  flashDamage(duration = 200) {
    this._flash('damage', duration);
  }

  flashHeal(duration = 200) {
    this._flash('heal', duration);
  }

  flashVictory(duration = 400) {
    this._flash('victory', duration);
  }

  _flash(type, duration) {
    if (!this.flashOverlay) return;
    this.flashOverlay.className = `gb-screen-flash ${type}`;
    this.flashOverlay.style.opacity = '1';

    setTimeout(() => {
      this.flashOverlay.style.opacity = '0';
    }, duration);
  }

  showStartScreen(options = {}) {
    const config = {
      title: options.title || this.options.title,
      description: options.description || this.options.subtitle,
      controls: options.controls || [
        { key: 'W A S D', label: 'Move' },
        { key: 'Space', label: 'Jump' },
        { key: 'Click', label: 'Action' },
      ],
      buttonText: options.buttonText || 'Play Now',
      onStart: options.onStart,
    };

    this.modalTitle.textContent = config.title;
    this.modalDesc.textContent = config.description;

    this.modalControls.innerHTML = config.controls
      .map((c) => `<div class="gb-key-badge"><kbd>${c.key}</kbd><span>${c.label}</span></div>`)
      .join('');

    this.modalBtn.textContent = config.buttonText;
    this._modalAction = config.onStart || null;

    this.showOverlay();
  }

  showGameOver(options = {}) {
    const score = options.score !== undefined ? options.score : this.score;
    const stats = options.stats || [];

    this.modalTitle.textContent = options.title || 'GAME OVER';
    this.modalDesc.textContent = options.message || 'Better luck next run!';

    const statsHTML = `
      <div class="gb-stats-grid">
        <div class="gb-stat-item">
          <span class="gb-stat-item-label">Final Score</span>
          <span class="gb-stat-item-val" style="color: #fb923c;">${score.toLocaleString()}</span>
        </div>
        <div class="gb-stat-item">
          <span class="gb-stat-item-label">High Score</span>
          <span class="gb-stat-item-val">${this.highScore.toLocaleString()}</span>
        </div>
        ${stats.map((s) => `
          <div class="gb-stat-item">
            <span class="gb-stat-item-label">${s.label}</span>
            <span class="gb-stat-item-val">${s.value}</span>
          </div>
        `).join('')}
      </div>
    `;

    this.modalControls.innerHTML = statsHTML;
    this.modalBtn.textContent = options.buttonText || 'Restart (Space)';
    this._modalAction = options.onRestart || null;

    this.showOverlay();
  }

  showVictory(options = {}) {
    this.flashVictory();
    this.modalTitle.textContent = options.title || 'VICTORY!';
    this.modalDesc.textContent = options.message || 'Magnificent job completing the mission!';

    this.modalControls.innerHTML = `
      <div class="gb-stats-grid">
        <div class="gb-stat-item">
          <span class="gb-stat-item-label">Total Score</span>
          <span class="gb-stat-item-val" style="color: #38bdf8;">${this.score.toLocaleString()}</span>
        </div>
        <div class="gb-stat-item">
          <span class="gb-stat-item-label">High Score</span>
          <span class="gb-stat-item-val">${this.highScore.toLocaleString()}</span>
        </div>
      </div>
    `;

    this.modalBtn.textContent = options.buttonText || 'Play Again';
    this._modalAction = options.onContinue || null;

    this.showOverlay();
  }

  showOverlay() {
    if (this.overlay) {
      this.overlay.classList.add('active');
      this.overlay.style.opacity = '1';
      this.overlay.style.pointerEvents = 'auto';
    }
  }

  hideOverlay() {
    if (this.overlay) {
      this.overlay.classList.remove('active');
      this.overlay.style.opacity = '0';
      this.overlay.style.pointerEvents = 'none';
    }
  }

  setCrosshair(style = 'dot') {
    let cross = document.getElementById('gb-crosshair');
    if (!cross) {
      cross = document.createElement('div');
      cross.id = 'gb-crosshair';
      cross.className = 'gb-crosshair';
      this.container.appendChild(cross);
    }

    if (style === 'dot') {
      cross.innerHTML = '<div class="gb-crosshair-dot"></div>';
    } else if (style === 'ring') {
      cross.innerHTML = '<div class="gb-crosshair-ring"></div>';
    }
  }

  triggerCrosshairRecoil() {
    const cross = document.getElementById('gb-crosshair');
    if (!cross) return;
    cross.classList.add('recoil');
    setTimeout(() => cross.classList.remove('recoil'), 120);
  }

  initMinimap() {
    const wrapper = document.getElementById('gb-minimap-wrapper');
    if (wrapper) wrapper.style.display = 'block';
    this.minimapCanvas = document.getElementById('gb-minimap');
    if (this.minimapCanvas) {
      this.minimapCanvas.width = 120;
      this.minimapCanvas.height = 120;
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
  }

  renderMinimap(playerPos, blips = [], mapRadius = 50) {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const size = 120;
    const center = size / 2;
    const scale = (size * 0.45) / mapRadius;

    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(center, 4);
    ctx.lineTo(center, size - 4);
    ctx.moveTo(4, center);
    ctx.lineTo(size - 4, center);
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(center, center, 3.5, 0, Math.PI * 2);
    ctx.fill();

    for (const blip of blips) {
      const dx = (blip.x - playerPos.x) * scale;
      const dz = (blip.z - playerPos.z) * scale;

      const dist = Math.hypot(dx, dz);
      if (dist < center - 4) {
        ctx.fillStyle = blip.color || '#ef4444';
        ctx.beginPath();
        ctx.arc(center + dx, center + dz, blip.radius || 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

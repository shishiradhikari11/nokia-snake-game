(() => {
  'use strict';

  // ---- YouTube Playables SDK wrapper -------------------------------------
  // The game also runs outside YouTube (local testing), so every SDK call is
  // guarded and degrades to a no-op / localStorage fallback.
  const yt = window.ytgame;
  const inPlayables = !!(yt && yt.IN_PLAYABLES_ENV);
  const SAVE_KEY = 'nokia-snake-save';

  const sdk = {
    firstFrameReady() { if (inPlayables) yt.game.firstFrameReady(); },
    gameReady() { if (inPlayables) yt.game.gameReady(); },
    sendScore(value) {
      if (inPlayables) yt.engagement.sendScore({ value }).catch(logError);
    },
    async load() {
      try {
        const raw = inPlayables ? await yt.game.loadData() : localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        logError(e);
        return {};
      }
    },
    save(data) {
      const raw = JSON.stringify(data);
      try {
        if (inPlayables) yt.game.saveData(raw).catch(logError);
        else localStorage.setItem(SAVE_KEY, raw);
      } catch (e) {
        logError(e);
      }
    },
    audioEnabled() { return inPlayables ? yt.system.isAudioEnabled() : true; },
    onAudioChange(cb) { if (inPlayables) yt.system.onAudioEnabledChange(cb); },
    onPause(cb) { if (inPlayables) yt.system.onPause(cb); },
    onResume(cb) { if (inPlayables) yt.system.onResume(cb); },
  };

  function logError(e) {
    console.error(e);
    if (inPlayables) yt.health.logError();
  }
  window.addEventListener('error', () => { if (inPlayables) yt.health.logError(); });

  // ---- Constants ---------------------------------------------------------
  const COLS = 20;
  const ROWS = 20;
  const START_TICK_MS = 150;
  const MIN_TICK_MS = 60;
  const FG = '#43523d';
  const BG = '#c7f0d8';
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  // ---- DOM ---------------------------------------------------------------
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const pad = document.getElementById('pad');

  // ---- State -------------------------------------------------------------
  let cell = 16;
  let snake, dir, queuedDirs, food, score, tickMs;
  let best = 0;
  let state = 'title'; // title | playing | paused | over
  let lastTick = 0;
  let audioOn = sdk.audioEnabled();
  let audioCtx = null;

  // ---- Audio (tiny Nokia-style beeps via WebAudio, no asset files) -------
  function beep(freq, duration) {
    if (!audioOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      logError(e);
    }
  }

  sdk.onAudioChange((enabled) => {
    audioOn = enabled;
    if (audioCtx) enabled ? audioCtx.resume() : audioCtx.suspend();
  });

  // ---- Layout ------------------------------------------------------------
  function resize() {
    const landscape = window.innerWidth > window.innerHeight;
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    const padSize = 41 * vmin; // 3 * 13vmin + gaps
    const availW = landscape ? window.innerWidth - padSize - 14 * vmin : window.innerWidth - 10 * vmin;
    const availH = landscape ? window.innerHeight - 14 * vmin : window.innerHeight - padSize - 20 * vmin;
    cell = Math.max(4, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cell * COLS}px`;
    canvas.style.height = `${cell * ROWS}px`;
    canvas.width = cell * COLS * dpr;
    canvas.height = cell * ROWS * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  window.addEventListener('resize', resize);

  // ---- Game logic --------------------------------------------------------
  function reset() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir = DIRS.right;
    queuedDirs = [];
    score = 0;
    tickMs = START_TICK_MS;
    placeFood();
    updateHud();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function step() {
    if (queuedDirs.length) dir = queuedDirs.shift();
    // Classic Nokia rule: walls wrap around.
    const head = {
      x: (snake[0].x + dir.x + COLS) % COLS,
      y: (snake[0].y + dir.y + ROWS) % ROWS,
    };
    const eating = food && head.x === food.x && head.y === food.y;
    // The tail moves out of the way this tick unless we are growing.
    const body = eating ? snake : snake.slice(0, -1);
    if (body.some((s) => s.x === head.x && s.y === head.y)) {
      gameOver();
      return;
    }
    snake.unshift(head);
    if (eating) {
      score += 1;
      tickMs = Math.max(MIN_TICK_MS, tickMs - 3);
      beep(880, 0.05);
      placeFood();
      updateHud();
      if (!food) gameOver(true);
    } else {
      snake.pop();
    }
  }

  function gameOver(won = false) {
    state = 'over';
    beep(won ? 1320 : 220, 0.3);
    if (score > best) {
      best = score;
      sdk.save({ best });
      sdk.sendScore(best);
      updateHud();
    }
    showOverlay(won ? 'YOU WIN' : 'GAME OVER', `Score ${score}\nTap or press any key`);
  }

  function updateHud() {
    scoreEl.textContent = String(score).padStart(4, '0');
    bestEl.textContent = `HI ${String(Math.max(best, score)).padStart(4, '0')}`;
  }

  // ---- Rendering ---------------------------------------------------------
  function draw() {
    const w = cell * COLS;
    const h = cell * ROWS;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    if (!snake) return;
    ctx.fillStyle = FG;
    const gap = Math.max(1, Math.floor(cell / 8));
    for (const s of snake) {
      ctx.fillRect(s.x * cell + gap, s.y * cell + gap, cell - gap * 2, cell - gap * 2);
    }
    if (food) {
      // Diamond-shaped food, like the original.
      const cx = food.x * cell + cell / 2;
      const cy = food.y * cell + cell / 2;
      const r = cell / 2 - gap;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  function loop(t) {
    if (state === 'playing' && t - lastTick >= tickMs) {
      lastTick = t;
      step();
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---- State transitions -------------------------------------------------
  function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove('hidden');
  }

  function start() {
    reset();
    draw();
    overlay.classList.add('hidden');
    state = 'playing';
    lastTick = performance.now();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    showOverlay('PAUSED', 'Tap or press any key');
  }

  function resume() {
    if (state !== 'paused') return;
    overlay.classList.add('hidden');
    state = 'playing';
    lastTick = performance.now();
  }

  // YouTube asks the game to pause when the player leaves / backgrounds it.
  sdk.onPause(pause);
  sdk.onResume(() => { /* stay paused until the player taps, so they are not surprised */ });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ---- Input -------------------------------------------------------------
  function turn(name) {
    const next = DIRS[name];
    const last = queuedDirs.length ? queuedDirs[queuedDirs.length - 1] : dir;
    if (next === last || (next.x === -last.x && next.y === -last.y)) return;
    if (queuedDirs.length < 2) queuedDirs.push(next);
  }

  function handleAction(name) {
    if (state === 'title' || state === 'over') { start(); if (DIRS[name] && DIRS[name] !== DIRS.left) turn(name); return; }
    if (state === 'paused') { resume(); return; }
    if (name === 'pause') { pause(); return; }
    if (DIRS[name]) turn(name);
  }

  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'pause', KeyP: 'pause', Escape: 'pause', Enter: 'pause',
  };
  window.addEventListener('keydown', (e) => {
    const name = KEYS[e.code];
    if (!name && state === 'playing') return;
    e.preventDefault();
    handleAction(name || 'pause');
  });

  pad.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    handleAction(btn.dataset.dir);
  });

  // Swipe anywhere on the screen (outside the d-pad).
  let touchStart = null;
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#pad')) return;
    touchStart = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) {
      handleAction(state === 'playing' ? null : 'pause');
      return;
    }
    handleAction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  // ---- Boot --------------------------------------------------------------
  async function boot() {
    reset();
    resize();
    sdk.firstFrameReady();
    const data = await sdk.load();
    best = Number.isInteger(data.best) ? data.best : 0;
    updateHud();
    showOverlay('SNAKE', 'Swipe, use arrows or the pad\nTap or press any key');
    sdk.gameReady();
    requestAnimationFrame(loop);
  }

  boot();
})();

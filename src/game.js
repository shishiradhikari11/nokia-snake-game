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
  const FG = '#43523d';
  const BG = '#c7f0d8';
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  // The snake always starts on this row heading right; layouts keep it clear.
  const START_ROW = 10;
  const START_X = 7;
  const BONUS_EVERY = 5;       // a bonus critter appears after every 5th food
  const BONUS_TICKS = 40;      // ...and runs away after this many moves
  const TIME_ATTACK_MS = 60000;

  // Each mode decides its walls, speed curve and how many foods clear a level.
  const MODES = {
    classic: {
      name: 'Classic',
      desc: 'No walls. Faster every level.',
      foodsPerLevel: 5,
      tick: (lv) => Math.max(55, 165 - (lv - 1) * 12),
      walls: () => [],
    },
    box: {
      name: 'Box',
      desc: 'Hit the border and you are out.',
      foodsPerLevel: 5,
      tick: (lv) => Math.max(60, 165 - (lv - 1) * 11),
      walls: () => border(),
    },
    maze: {
      name: 'Maze',
      desc: 'New brick maze every level.\nCrash = retry the same level.',
      foodsPerLevel: 6,
      tick: (lv) => Math.max(70, 155 - (lv - 1) * 6),
      walls: (lv) => mazeFor(lv),
      resetSnakeEachLevel: true,
      keepLevelOnCrash: true,
    },
    time: {
      name: 'Time Attack',
      desc: '60 seconds. Eat as much as you can.',
      foodsPerLevel: 5,
      tick: (lv) => Math.max(55, 150 - (lv - 1) * 12),
      walls: () => [],
      timed: true,
    },
  };
  const MODE_IDS = Object.keys(MODES);

  // ---- Maze layouts (20x20) ----------------------------------------------
  function hline(y, x0, x1) { const c = []; for (let x = x0; x <= x1; x++) c.push([x, y]); return c; }
  function vline(x, y0, y1) { const c = []; for (let y = y0; y <= y1; y++) c.push([x, y]); return c; }
  function border() {
    return [...hline(0, 0, COLS - 1), ...hline(ROWS - 1, 0, COLS - 1), ...vline(0, 1, ROWS - 2), ...vline(COLS - 1, 1, ROWS - 2)];
  }
  function diag(x0, y0, dx, dy, n) { const c = []; for (let i = 0; i < n; i++) c.push([x0 + i * dx, y0 + i * dy]); return c; }
  function block(x, y) { return [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]; }

  const LAYOUTS = [
    // 1. Plain box
    () => border(),
    // 2. Box with two bars
    () => [...border(), ...hline(5, 5, 14), ...hline(14, 5, 14)],
    // 3. Four corner brackets
    () => [...border(),
      ...hline(4, 4, 8), ...vline(4, 5, 8), ...hline(4, 11, 15), ...vline(15, 5, 8),
      ...hline(15, 4, 8), ...vline(4, 11, 14), ...hline(15, 11, 15), ...vline(15, 11, 14)],
    // 4. Tunnels: open border with side gates and two inner columns
    () => [...hline(0, 0, 7), ...hline(0, 12, 19), ...hline(19, 0, 7), ...hline(19, 12, 19),
      ...vline(0, 1, 6), ...vline(0, 13, 18), ...vline(19, 1, 6), ...vline(19, 13, 18),
      ...vline(5, 4, 15), ...vline(14, 4, 15)],
    // 5. Pillars
    () => [...border(), ...block(4, 4), ...block(14, 4), ...block(4, 14), ...block(14, 14),
      ...block(9, 4), ...block(9, 14), ...block(4, 7), ...block(14, 7), ...block(4, 12), ...block(14, 12)],
    // 6. Two walls with a narrow door each
    () => [...border(), ...hline(6, 2, 8), ...hline(6, 11, 17), ...hline(14, 2, 8), ...hline(14, 11, 17),
      ...vline(9, 1, 3), ...vline(10, 16, 18)],
    // 7. Rooms
    () => [...border(), ...vline(6, 1, 7), ...vline(6, 12, 18), ...vline(13, 1, 7), ...vline(13, 12, 18),
      ...hline(4, 14, 17), ...hline(15, 2, 5)],
    // 8. Diagonals, no border
    () => [...diag(2, 2, 1, 1, 6), ...diag(17, 2, -1, 1, 6), ...diag(2, 17, 1, -1, 6), ...diag(17, 17, -1, -1, 6)],
  ];

  // Seeded RNG so a given level always has the same maze.
  function rng(seed) {
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function mazeFor(level) {
    const cells = LAYOUTS[(level - 1) % LAYOUTS.length]();
    const set = new Set(cells.map(([x, y]) => key(x, y)));
    clearStartLane(set);
    // After the hand-made layouts run out, keep adding random bricks,
    // but never one that would cut off part of the board.
    const extra = Math.min(45, Math.max(0, level - LAYOUTS.length) * 4);
    const rand = rng(level * 7919);
    let open = reachable(set, START_X, START_ROW).size;
    let placed = 0;
    for (let tries = 0; placed < extra && tries < extra * 30; tries++) {
      const x = Math.floor(rand() * COLS);
      const y = Math.floor(rand() * ROWS);
      const k = key(x, y);
      if (set.has(k) || Math.abs(y - START_ROW) <= 1) continue;
      set.add(k);
      const size = reachable(set, START_X, START_ROW).size;
      if (size === open - 1) { open = size; placed++; } else set.delete(k);
    }
    return [...set].map((k) => [k % COLS, Math.floor(k / COLS)]);
  }

  function clearStartLane(set) {
    for (let x = START_X - 3; x <= START_X + 6; x++) set.delete(key(x, START_ROW));
  }

  function key(x, y) { return y * COLS + x; }

  // Flood fill over non-brick cells (with wrap-around), from (x, y).
  function reachable(bricks, x, y) {
    const seen = new Set([key(x, y)]);
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const d of Object.values(DIRS)) {
        const nx = (cx + d.x + COLS) % COLS;
        const ny = (cy + d.y + ROWS) % ROWS;
        const k = key(nx, ny);
        if (!seen.has(k) && !bricks.has(k)) { seen.add(k); stack.push([nx, ny]); }
      }
    }
    return seen;
  }

  // ---- DOM ---------------------------------------------------------------
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const menuEl = document.getElementById('menu');
  const toastEl = document.getElementById('toast');
  const pad = document.getElementById('pad');

  // ---- State -------------------------------------------------------------
  let cell = 16;
  let mode = 'classic';
  let snake, dir, queuedDirs, food, bonus, bricks, score, level, foodsThisLevel, foodsTotal;
  let levelStartScore = 0;
  let timeLeft = 0;
  let save = { best: {}, mazeLevel: 1 };
  let state = 'menu'; // menu | playing | paused | over | levelup
  let lastTick = 0;
  let lastFrame = 0;
  let menuItems = [];
  let menuIndex = 0;
  let toastTimer = 0;
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
  const M = () => MODES[mode];

  function newGame(startLevel) {
    level = startLevel;
    score = 0;
    foodsTotal = 0;
    snake = null;
    loadLevel();
  }

  // Sets up walls, food and (when the mode wants it) a fresh snake for `level`.
  function loadLevel() {
    bricks = new Set(M().walls(level).map(([x, y]) => key(x, y)));
    if (!snake || M().resetSnakeEachLevel) {
      snake = [{ x: START_X, y: START_ROW }, { x: START_X - 1, y: START_ROW }, { x: START_X - 2, y: START_ROW }];
      dir = DIRS.right;
    }
    queuedDirs = [];
    foodsThisLevel = 0;
    levelStartScore = score;
    bonus = null;
    if (M().timed && level === 1) timeLeft = TIME_ATTACK_MS;
    placeFood();
    updateHud();
  }

  function freeCells() {
    const head = snake[0];
    const reach = reachable(bricks, head.x, head.y);
    const taken = new Set(snake.map((s) => key(s.x, s.y)));
    if (food) taken.add(key(food.x, food.y));
    if (bonus) taken.add(key(bonus.x, bonus.y));
    return [...reach].filter((k) => !taken.has(k));
  }

  function randomFree() {
    const free = freeCells();
    if (!free.length) return null;
    const k = free[Math.floor(Math.random() * free.length)];
    return { x: k % COLS, y: Math.floor(k / COLS) };
  }

  function placeFood() {
    food = null;
    food = randomFree();
  }

  function step() {
    if (queuedDirs.length) dir = queuedDirs.shift();
    const head = {
      x: (snake[0].x + dir.x + COLS) % COLS,
      y: (snake[0].y + dir.y + ROWS) % ROWS,
    };
    const eating = food && head.x === food.x && head.y === food.y;
    const eatingBonus = bonus && head.x === bonus.x && head.y === bonus.y;
    // The tail moves out of the way this tick unless we are growing.
    const body = eating ? snake : snake.slice(0, -1);
    if (bricks.has(key(head.x, head.y)) || body.some((s) => s.x === head.x && s.y === head.y)) {
      crash();
      return;
    }
    snake.unshift(head);

    if (bonus) {
      if (eatingBonus) {
        // Worth more the faster you catch it.
        score += Math.ceil((bonus.ticks / BONUS_TICKS) * 10) * level;
        beep(1320, 0.12);
        bonus = null;
        updateHud();
      } else if (--bonus.ticks <= 0) {
        bonus = null;
      }
    }

    if (!eating) {
      snake.pop();
      return;
    }
    score += level;
    foodsThisLevel++;
    foodsTotal++;
    beep(880, 0.05);
    if (foodsTotal % BONUS_EVERY === 0 && !bonus) {
      const spot = randomFree();
      if (spot) bonus = { ...spot, ticks: BONUS_TICKS };
    }
    if (foodsThisLevel >= M().foodsPerLevel) {
      levelUp();
      return;
    }
    placeFood();
    updateHud();
    if (!food) levelUp();
  }

  function levelUp() {
    level++;
    beep(1047, 0.15);
    if (mode === 'maze' && level > save.mazeLevel) {
      save.mazeLevel = level;
      persist();
    }
    if (M().resetSnakeEachLevel) {
      // New maze: freeze briefly so the player can see the layout.
      state = 'levelup';
      loadLevel();
      draw();
      toast(`LEVEL ${level}`, 1300, () => {
        if (state !== 'levelup') return;
        state = 'playing';
        lastTick = performance.now();
      });
    } else {
      loadLevel();
      toast(`LEVEL ${level}`, 900);
    }
  }

  function crash() {
    beep(220, 0.3);
    endGame('GAME OVER');
  }

  function endGame(title) {
    state = 'over';
    recordBest();
    const items = [];
    if (M().keepLevelOnCrash) {
      items.push({ label: `Retry Level ${level}`, action: () => retryLevel() });
    }
    items.push({ label: M().keepLevelOnCrash ? 'Restart Level 1' : 'Play again', action: () => startMode(mode, 1) });
    items.push({ label: 'Menu', action: showMainMenu });
    showMenu(title, `Score ${score}  ·  Level ${level}`, items);
  }

  function retryLevel() {
    // Same level, same maze; the score goes back to where the level started.
    score = levelStartScore;
    snake = null;
    loadLevel();
    play();
  }

  function recordBest() {
    const prev = save.best[mode] || 0;
    if (score > prev) {
      save.best[mode] = score;
      persist();
      // YouTube takes a single score, so report the best across all modes.
      sdk.sendScore(Math.max(...MODE_IDS.map((id) => save.best[id] || 0)));
    }
    updateHud();
  }

  function persist() { sdk.save(save); }

  function updateHud() {
    scoreEl.textContent = String(score || 0).padStart(4, '0');
    if (M().timed && state !== 'menu') {
      levelEl.textContent = `L${level} ${Math.ceil(timeLeft / 1000)}s`;
    } else {
      levelEl.textContent = `L${level || 1}`;
    }
    bestEl.textContent = `HI ${String(Math.max(save.best[mode] || 0, score || 0)).padStart(4, '0')}`;
  }

  // ---- Rendering ---------------------------------------------------------
  function draw() {
    const w = cell * COLS;
    const h = cell * ROWS;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    if (!snake) return;
    const gap = Math.max(1, Math.floor(cell / 8));
    ctx.fillStyle = FG;
    for (const k of bricks) {
      // Brick: solid cell with a lighter notch, so it reads differently from the snake.
      const x = (k % COLS) * cell;
      const y = Math.floor(k / COLS) * cell;
      ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = BG;
      ctx.fillRect(x + gap, y + cell / 2 - gap / 2, cell - gap * 2, gap);
      ctx.fillStyle = FG;
    }
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
    // Bonus critter: hollow square with a dot; blinks when about to leave.
    if (bonus && (bonus.ticks > 10 || bonus.ticks % 2 === 0)) {
      const x = bonus.x * cell;
      const y = bonus.y * cell;
      ctx.lineWidth = gap;
      ctx.strokeStyle = FG;
      ctx.strokeRect(x + gap * 1.5, y + gap * 1.5, cell - gap * 3, cell - gap * 3);
      ctx.fillRect(x + cell / 2 - gap, y + cell / 2 - gap, gap * 2, gap * 2);
    }
  }

  function loop(t) {
    const dt = lastFrame ? t - lastFrame : 0;
    lastFrame = t;
    if (state === 'playing') {
      if (M().timed) {
        timeLeft -= dt;
        updateHud();
        if (timeLeft <= 0) {
          timeLeft = 0;
          beep(660, 0.3);
          endGame("TIME'S UP");
        }
      }
      if (state === 'playing' && t - lastTick >= M().tick(level)) {
        lastTick = t;
        step();
        draw();
      }
    }
    requestAnimationFrame(loop);
  }

  // ---- Overlay / menus ---------------------------------------------------
  function showMenu(title, text, items) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    menuItems = items;
    menuIndex = 0;
    menuEl.replaceChildren(...items.map((item, i) => {
      const b = document.createElement('button');
      b.textContent = item.label;
      b.addEventListener('click', () => { menuIndex = i; activateMenu(); });
      return b;
    }));
    highlightMenu();
    overlay.classList.remove('hidden');
  }

  function highlightMenu() {
    [...menuEl.children].forEach((b, i) => b.classList.toggle('selected', i === menuIndex));
  }

  function moveMenu(delta) {
    if (!menuItems.length) return;
    menuIndex = (menuIndex + delta + menuItems.length) % menuItems.length;
    highlightMenu();
    beep(660, 0.02);
  }

  function activateMenu() {
    const item = menuItems[menuIndex];
    if (item) item.action();
  }

  function showMainMenu() {
    state = 'menu';
    const items = MODE_IDS.map((id) => {
      const m = MODES[id];
      const label = id === 'maze' && save.mazeLevel > 1 ? `${m.name} · Lv ${save.mazeLevel}` : m.name;
      return { label, action: () => startMode(id, id === 'maze' ? save.mazeLevel : 1) };
    });
    if (save.mazeLevel > 1) items.splice(3, 0, { label: 'Maze · from Lv 1', action: () => startMode('maze', 1) });
    showMenu('SNAKE', 'Choose a mode', items);
  }

  function toast(text, ms, done) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.add('hidden');
      if (done) done();
    }, ms);
  }

  function startMode(id, startLevel) {
    mode = id;
    newGame(startLevel);
    play();
    toast(`${M().name.toUpperCase()} · L${level}`, 900);
  }

  function play() {
    overlay.classList.add('hidden');
    menuItems = [];
    menuEl.replaceChildren();
    state = 'playing';
    lastTick = performance.now();
    updateHud();
    draw();
  }

  function pause() {
    if (state !== 'playing' && state !== 'levelup') return;
    state = 'paused';
    showMenu('PAUSED', `${M().name} · Level ${level}`, [
      { label: 'Resume', action: play },
      { label: 'Quit to menu', action: () => { recordBest(); showMainMenu(); } },
    ]);
  }

  // YouTube asks the game to pause when the player leaves / backgrounds it.
  sdk.onPause(pause);
  sdk.onResume(() => { /* stay paused until the player chooses Resume */ });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ---- Input -------------------------------------------------------------
  function turn(name) {
    const next = DIRS[name];
    const last = queuedDirs.length ? queuedDirs[queuedDirs.length - 1] : dir;
    if (next === last || (next.x === -last.x && next.y === -last.y)) return;
    if (queuedDirs.length < 2) queuedDirs.push(next);
  }

  // `name` is a direction, 'select' (enter/space/centre button) or 'back'.
  function handleAction(name) {
    if (menuItems.length) {
      if (name === 'up' || name === 'left') moveMenu(-1);
      else if (name === 'down' || name === 'right') moveMenu(1);
      else if (name === 'select') activateMenu();
      else if (name === 'back' && state === 'paused') play();
      return;
    }
    if (state !== 'playing' && state !== 'levelup') return;
    if (name === 'select' || name === 'back') { pause(); return; }
    if (DIRS[name]) turn(name);
  }

  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'select', Enter: 'select', KeyP: 'back', Escape: 'back',
  };
  window.addEventListener('keydown', (e) => {
    const name = KEYS[e.code];
    if (!name) return;
    e.preventDefault();
    handleAction(name);
  });

  pad.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    handleAction(btn.dataset.dir === 'pause' ? 'select' : btn.dataset.dir);
  });

  // Swipe anywhere on the screen (outside the d-pad and menu buttons) to steer.
  let touchStart = null;
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#pad, #menu')) return;
    touchStart = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointerup', (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (state !== 'playing' && state !== 'levelup') return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  // ---- Boot --------------------------------------------------------------
  async function boot() {
    resize();
    sdk.firstFrameReady();
    const data = await sdk.load();
    // Older saves stored a single number for Classic.
    if (Number.isInteger(data.best)) save.best.classic = data.best;
    else if (data.best && typeof data.best === 'object') save.best = data.best;
    if (Number.isInteger(data.mazeLevel) && data.mazeLevel > 0) save.mazeLevel = data.mazeLevel;
    level = 1;
    score = 0;
    updateHud();
    showMainMenu();
    sdk.gameReady();
    requestAnimationFrame(loop);
  }

  boot();
})();

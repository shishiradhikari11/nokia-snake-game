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
      desc: 'Faster every level.',
      foodsPerLevel: 5,
      tick: (lv) => Math.max(55, 165 - (lv - 1) * 12),
      walls: () => edgeWalls(),
      usesStartLevel: true,
    },
    box: {
      name: 'Box',
      desc: 'Hit the border and you are out.',
      foodsPerLevel: 5,
      tick: (lv) => Math.max(60, 165 - (lv - 1) * 11),
      walls: () => border(),
      usesStartLevel: true,
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
      walls: () => edgeWalls(),
      timed: true,
      usesStartLevel: true,
    },
    duel: {
      name: '2 Players',
      desc: 'P1: arrows / right side. P2: WASD / left side.',
      foodsPerLevel: 5,
      tick: (lv) => Math.max(60, 170 - (lv - 1) * 10),
      walls: () => edgeWalls(),
      players: 2,
      usesStartLevel: true,
      noBest: true,
    },
  };
  // The "Walls" setting: wrap around the screen edge, or a solid border.
  const edgeWalls = () => (save.settings.wrap ? [] : border());
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
  // One entry per snake: { snake, dir, queue, score, label }.
  let players = [];
  let food, bonus, bricks, level, foodsThisLevel, foodsTotal;
  let levelStartScore = 0;
  let timeLeft = 0;
  let save = { best: {}, mazeLevel: 1, settings: { wrap: true, startLevel: 1 } };
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
  const P1 = () => players[0];
  const isDuel = () => players.length > 1;

  function newGame(startLevel) {
    level = startLevel;
    foodsTotal = 0;
    players = [];
    for (let i = 0; i < (M().players || 1); i++) players.push({ snake: null, score: 0, label: `P${i + 1}` });
    loadLevel();
  }

  function spawn(p, i) {
    if (!isDuel()) {
      p.snake = [{ x: START_X, y: START_ROW }, { x: START_X - 1, y: START_ROW }, { x: START_X - 2, y: START_ROW }];
      p.dir = DIRS.right;
    } else if (i === 0) {
      // P1 top-left heading right, P2 bottom-right heading left.
      p.snake = [{ x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }];
      p.dir = DIRS.right;
    } else {
      p.snake = [{ x: 12, y: 14 }, { x: 13, y: 14 }, { x: 14, y: 14 }];
      p.dir = DIRS.left;
    }
  }

  // Sets up walls, food and (when the mode wants it) fresh snakes for `level`.
  function loadLevel() {
    bricks = new Set(M().walls(level).map(([x, y]) => key(x, y)));
    players.forEach((p, i) => {
      if (!p.snake || M().resetSnakeEachLevel) spawn(p, i);
      p.queue = [];
    });
    foodsThisLevel = 0;
    levelStartScore = P1().score;
    bonus = null;
    if (M().timed && foodsTotal === 0) timeLeft = TIME_ATTACK_MS;
    placeFood();
    updateHud();
  }

  function freeCells() {
    const head = P1().snake[0];
    const reach = reachable(bricks, head.x, head.y);
    const taken = new Set();
    for (const p of players) for (const s of p.snake) taken.add(key(s.x, s.y));
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

  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;

  function step() {
    // Move every snake at once, then work out who crashed.
    const moves = players.map((p) => {
      if (p.queue.length) p.dir = p.queue.shift();
      const head = {
        x: (p.snake[0].x + p.dir.x + COLS) % COLS,
        y: (p.snake[0].y + p.dir.y + ROWS) % ROWS,
      };
      return { p, head, eating: same(head, food), eatingBonus: same(head, bonus) };
    });

    // Cells that will be occupied after this tick: every body, minus tails
    // that move away because their snake is not growing.
    const crashed = moves.filter((m) => {
      if (bricks.has(key(m.head.x, m.head.y))) return true;
      for (const o of moves) {
        const body = o.eating ? o.p.snake : o.p.snake.slice(0, -1);
        if (body.some((s) => same(s, m.head))) return true;
        if (o !== m && same(o.head, m.head)) return true; // head-on
      }
      return false;
    });
    if (crashed.length) {
      crash(crashed.map((m) => m.p));
      return;
    }

    let ate = false;
    for (const m of moves) {
      m.p.snake.unshift(m.head);
      if (m.eatingBonus) {
        // Worth more the faster you catch it.
        m.p.score += Math.ceil((bonus.ticks / BONUS_TICKS) * 10) * level;
        beep(1320, 0.12);
        bonus = null;
      }
      if (m.eating) {
        m.p.score += level;
        ate = true;
      } else {
        m.p.snake.pop();
      }
    }
    if (bonus && --bonus.ticks <= 0) bonus = null;
    if (!ate) {
      updateHud();
      return;
    }

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

  function crash(losers) {
    beep(220, 0.3);
    if (!isDuel()) {
      endGame('GAME OVER');
    } else if (losers.length === players.length) {
      endGame('DRAW');
    } else {
      const winner = players.find((p) => !losers.includes(p));
      endGame(`${winner.label} WINS`);
    }
  }

  function endGame(title) {
    state = 'over';
    recordBest();
    const items = [];
    if (M().keepLevelOnCrash) {
      items.push({ label: `Retry Level ${level}`, action: () => retryLevel() });
    }
    const replay = M().keepLevelOnCrash ? 1 : startLevelFor(mode);
    items.push({ label: M().keepLevelOnCrash ? 'Restart Level 1' : 'Play again', action: () => startMode(mode, replay) });
    items.push({ label: 'Menu', action: showMainMenu });
    const scores = isDuel() ? players.map((p) => `${p.label} ${p.score}`).join('  ·  ') : `Score ${P1().score}`;
    showMenu(title, `${scores}  ·  Level ${level}`, items);
  }

  function retryLevel() {
    // Same level, same maze; the score goes back to where the level started.
    P1().score = levelStartScore;
    P1().snake = null;
    loadLevel();
    play();
  }

  function recordBest() {
    if (M().noBest) return;
    const score = P1().score;
    if (score > (save.best[mode] || 0)) {
      save.best[mode] = score;
      persist();
      // YouTube takes a single score, so report the best across all modes.
      sdk.sendScore(Math.max(...MODE_IDS.map((id) => save.best[id] || 0)));
    }
    updateHud();
  }

  function persist() { sdk.save(save); }

  const pad4 = (n) => String(n || 0).padStart(4, '0');

  function updateHud() {
    const inGame = state !== 'menu' && players.length;
    const timer = M().timed && inGame ? ` ${Math.ceil(timeLeft / 1000)}s` : '';
    levelEl.textContent = `L${level || 1}${timer}`;
    if (inGame && isDuel()) {
      scoreEl.textContent = `P1 ${pad4(players[0].score)}`;
      bestEl.textContent = `P2 ${pad4(players[1].score)}`;
      return;
    }
    const score = inGame ? P1().score : 0;
    scoreEl.textContent = pad4(score);
    bestEl.textContent = `HI ${pad4(Math.max(save.best[mode] || 0, score))}`;
  }

  // ---- Rendering ---------------------------------------------------------
  function draw() {
    const w = cell * COLS;
    const h = cell * ROWS;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    if (!players.length || !P1().snake) return;
    const gap = Math.max(1, Math.floor(cell / 8));
    ctx.fillStyle = FG;
    ctx.strokeStyle = FG;
    ctx.lineWidth = gap;
    for (const k of bricks) {
      // Brick: solid cell with a lighter notch, so it reads differently from the snake.
      const x = (k % COLS) * cell;
      const y = Math.floor(k / COLS) * cell;
      ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = BG;
      ctx.fillRect(x + gap, y + cell / 2 - gap / 2, cell - gap * 2, gap);
      ctx.fillStyle = FG;
    }
    players.forEach((p, i) => {
      p.snake.forEach((s, j) => {
        const x = s.x * cell + gap;
        const y = s.y * cell + gap;
        const size = cell - gap * 2;
        // P2 is drawn hollow (with a solid head) so the two snakes are easy to tell apart.
        if (i === 0 || j === 0) ctx.fillRect(x, y, size, size);
        else ctx.strokeRect(x + gap / 2, y + gap / 2, size - gap, size - gap);
      });
    });
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
    // Bonus critter: a plus-shaped bug; blinks when about to leave.
    if (bonus && (bonus.ticks > 10 || bonus.ticks % 2 === 0)) {
      const x = bonus.x * cell;
      const y = bonus.y * cell;
      const t = Math.max(2, Math.floor(cell / 3));
      ctx.fillRect(x + gap, y + (cell - t) / 2, cell - gap * 2, t);
      ctx.fillRect(x + (cell - t) / 2, y + gap, t, cell - gap * 2);
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
  function showMenu(title, text, items, index = 0) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    menuItems = items;
    menuIndex = index;
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

  const startLevelFor = (id) => (MODES[id].usesStartLevel ? save.settings.startLevel : 1);

  function showMainMenu() {
    state = 'menu';
    const items = MODE_IDS.map((id) => {
      const m = MODES[id];
      const label = id === 'maze' && save.mazeLevel > 1 ? `${m.name} · Lv ${save.mazeLevel}` : m.name;
      return { label, action: () => startMode(id, id === 'maze' ? save.mazeLevel : startLevelFor(id)) };
    });
    if (save.mazeLevel > 1) items.splice(3, 0, { label: 'Maze · from Lv 1', action: () => startMode('maze', 1) });
    items.push({ label: 'Settings', action: () => showSettings(0) });
    showMenu('SNAKE', 'Choose a mode', items);
    updateHud();
  }

  // Nokia-style options: wrap-around edges on/off and a starting speed level.
  function showSettings(index) {
    const st = save.settings;
    showMenu('SETTINGS', 'Walls: Classic, Time Attack, 2P\nStart level: all but Maze', [
      { label: `Walls: ${st.wrap ? 'Off (wrap)' : 'On (solid)'}`, action: () => { st.wrap = !st.wrap; persist(); showSettings(0); } },
      { label: `Start level: ${st.startLevel}`, action: () => { st.startLevel = (st.startLevel % 9) + 1; persist(); showSettings(1); } },
      { label: 'Back', action: showMainMenu },
    ], index);
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
  function turn(name, who = 0) {
    const p = players[who];
    if (!p) return;
    const next = DIRS[name];
    const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
    if (next === last || (next.x === -last.x && next.y === -last.y)) return;
    if (p.queue.length < 2) p.queue.push(next);
  }

  // `name` is a direction, 'select' (enter/space/centre button) or 'back'.
  // `who` is the player the input belongs to (only matters in 2 Players).
  function handleAction(name, who = 0) {
    if (menuItems.length) {
      if (name === 'up' || name === 'left') moveMenu(-1);
      else if (name === 'down' || name === 'right') moveMenu(1);
      else if (name === 'select') activateMenu();
      else if (name === 'back' && state === 'paused') play();
      return;
    }
    if (state !== 'playing' && state !== 'levelup') return;
    if (name === 'select' || name === 'back') { pause(); return; }
    if (DIRS[name]) turn(name, isDuel() ? who : 0);
  }

  // [action, player]; WASD steers P2 in 2 Players and P1 otherwise.
  const KEYS = {
    ArrowUp: ['up', 0], ArrowDown: ['down', 0], ArrowLeft: ['left', 0], ArrowRight: ['right', 0],
    KeyW: ['up', 1], KeyS: ['down', 1], KeyA: ['left', 1], KeyD: ['right', 1],
    Space: ['select', 0], Enter: ['select', 0], KeyP: ['back', 0], Escape: ['back', 0],
  };
  window.addEventListener('keydown', (e) => {
    const k = KEYS[e.code];
    if (!k) return;
    e.preventDefault();
    handleAction(k[0], k[1]);
  });

  pad.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    handleAction(btn.dataset.dir === 'pause' ? 'select' : btn.dataset.dir, 0);
  });

  // Swipe anywhere on the screen (outside the d-pad and menu buttons) to steer.
  // In 2 Players, swipes on the left half steer P2 and the right half P1.
  // Tracked per pointer so both players can swipe at the same time.
  const touches = new Map();
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#pad, #menu')) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  window.addEventListener('pointerup', (e) => {
    const start = touches.get(e.pointerId);
    if (!start) return;
    touches.delete(e.pointerId);
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (state !== 'playing' && state !== 'levelup') return;
    const who = isDuel() && start.x < window.innerWidth / 2 ? 1 : 0;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), who);
  });
  window.addEventListener('pointercancel', (e) => touches.delete(e.pointerId));

  // ---- Boot --------------------------------------------------------------
  async function boot() {
    resize();
    sdk.firstFrameReady();
    const data = await sdk.load();
    // Older saves stored a single number for Classic.
    if (Number.isInteger(data.best)) save.best.classic = data.best;
    else if (data.best && typeof data.best === 'object') save.best = data.best;
    if (Number.isInteger(data.mazeLevel) && data.mazeLevel > 0) save.mazeLevel = data.mazeLevel;
    if (data.settings) {
      if (typeof data.settings.wrap === 'boolean') save.settings.wrap = data.settings.wrap;
      const sl = data.settings.startLevel;
      if (Number.isInteger(sl) && sl >= 1 && sl <= 9) save.settings.startLevel = sl;
    }
    level = 1;
    showMainMenu();
    sdk.gameReady();
    requestAnimationFrame(loop);
  }

  boot();
})();

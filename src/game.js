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

  // ---- Ads (YouTube Playables ads API, public preview) -------------------
  // YouTube picks and plays the ad; the game only asks at natural breaks.
  // Outside YouTube there is no ad network, so ads are unavailable, unless the
  // page is opened with ?fakeads to preview the flow with a placeholder ad.
  const FAKE_ADS = !inPlayables && new URLSearchParams(location.search).has('fakeads');
  let adPlaying = false;

  const ads = {
    get available() { return (inPlayables && !!yt.ads) || FAKE_ADS; },
    // Interstitial: may or may not show; never reward for it.
    async interstitial() {
      adPlaying = true;
      try {
        if (inPlayables && yt.ads) await yt.ads.requestInterstitialAd();
        else if (FAKE_ADS) await fakeAd('Ad break', 3);
      } catch (e) {
        logError(e);
      } finally {
        adPlaying = false;
      }
    },
    // Rewarded: resolves true only if the player watched it, so only then reward.
    async rewarded(rewardId) {
      adPlaying = true;
      try {
        if (inPlayables && yt.ads) return !!(await yt.ads.requestRewardedAd(rewardId));
        if (FAKE_ADS) { await fakeAd('Rewarded ad', 5); return true; }
        return false;
      } catch (e) {
        logError(e);
        return false;
      } finally {
        adPlaying = false;
      }
    },
  };

  // Placeholder ad for previewing the flow outside YouTube (?fakeads).
  function fakeAd(label, seconds) {
    return new Promise((resolve) => {
      const show = (n) => showMenu('AD', `${label} · ${n}s\n(test placeholder)`, []);
      let n = seconds;
      show(n);
      const timer = setInterval(() => {
        if (--n <= 0) { clearInterval(timer); resolve(); } else show(n);
      }, 1000);
    });
  }

  function logError(e) {
    console.error(e);
    if (inPlayables) yt.health.logError();
  }
  window.addEventListener('error', () => { if (inPlayables) yt.health.logError(); });

  // ---- Constants ---------------------------------------------------------
  const COLS = 20;
  const ROWS = 20;
  let FG = '#43523d';
  let BG = '#c7f0d8';
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
    // Two players, each on their own device. Crashing into a wall, yourself or
    // the other snake loses; head-on is a draw. The host runs the game; the
    // guest only sends turns and draws snapshots.
    online: {
      name: 'Online 2P',
      foodsPerLevel: 5,
      tick: (lv) => Math.max(70, 170 - (lv - 1) * 10),
      walls: () => edgeWalls(),
      players: 2,
      usesStartLevel: true,
      noBest: true,
      hidden: true,
    },
  };
  // ---- Coins & shop --------------------------------------------------------
  // Coins are only earned (playing, rewarded ads) and spent in-game; YouTube
  // Playables does not allow selling them for real money.
  const COINS_PER_FOOD = 1;
  const COINS_PER_BONUS = 3;
  const COINS_PER_LEVEL = 5;
  const REWARD_COINS = 25;
  const CONTINUE_COST = 30;
  const CONTINUE_SECONDS = 15;          // Time Attack: extra time on continue
  const INTERSTITIAL_FROM_LEVEL = 5;    // ad breaks start once level 5 is cleared
  const INTERSTITIAL_GAP_MS = 120000;   // at most one ad break every 2 minutes
  // Rewarded-ad IDs: one fixed ID per reward type, no user data.
  const REWARD_IDS = { coins: 'coins-25-reward', continue: 'continue-run-reward', double: 'double-coins-reward' };

  const THEMES = {
    nokia: { name: 'Nokia Green', bg: '#c7f0d8', fg: '#43523d', price: 0 },
    blue: { name: '3310 Blue', bg: '#bfd9ec', fg: '#1e3550', price: 200 },
    amber: { name: 'Amber', bg: '#ffd889', fg: '#5b3b00', price: 400 },
    gray: { name: 'Classic Gray', bg: '#d6d6cc', fg: '#2b2b2b', price: 600 },
    night: { name: 'Night Mode', bg: '#18261b', fg: '#9fe3a9', price: 800 },
  };
  const SKINS = {
    classic: { name: 'Classic', price: 0 },
    striped: { name: 'Striped', price: 150 },
    dots: { name: 'Dotted', price: 300 },
    chunky: { name: 'Chunky', price: 500 },
  };

  // The "Walls" setting: wrap around the screen edge, or a solid border.
  const edgeWalls = () => (save.settings.wrap ? [] : border());
  const MODE_IDS = Object.keys(MODES).filter((id) => !MODES[id].hidden);

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
  const roomInput = document.getElementById('room-input');

  // ---- State -------------------------------------------------------------
  let cell = 16;
  let mode = 'classic';
  // One entry per snake: { snake, dir, queue, score, label }.
  let players = [];
  let food, bonus, bricks, level, foodsThisLevel, foodsTotal;
  let levelStartScore = 0;
  let timeLeft = 0;
  let save = {
    best: {},
    mazeLevel: 1,
    settings: { wrap: true, startLevel: 1 },
    coins: 0,
    owned: { theme: ['nokia'], skin: ['classic'] },
    theme: 'nokia',
    skin: 'classic',
  };
  // Per-run economy state.
  let runCoins = 0;
  let continued = false;
  let doubled = false;
  let endReason = 'crash';
  let lastTitle = '';
  let adBusy = false;
  let lastInterstitial = 0;
  let state = 'menu'; // menu | playing | paused | over | levelup
  let lastTick = 0;
  let lastFrame = 0;
  let menuItems = [];
  let menuIndex = 0;
  let toastTimer = 0;
  let audioOn = sdk.audioEnabled();
  let audioCtx = null;
  // Online play: `net` is { role: 'host' | 'guest', link } once connected,
  // `lobby` is a pending create/join that can still be cancelled.
  let net = null;
  let lobby = null;
  let gameId = 0;
  const isGuest = () => !!net && net.role === 'guest';
  const isHost = () => !!net && net.role === 'host';

  // ---- Audio (tiny Nokia-style beeps via WebAudio, no asset files) -------
  function beep(freq, duration) {
    if (!audioOn || adPlaying) return;
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
    runCoins = 0;
    continued = false;
    doubled = false;
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
        earnCoins(COINS_PER_BONUS);
        beep(1320, 0.12);
        bonus = null;
      }
      if (m.eating) {
        m.p.score += level;
        earnCoins(COINS_PER_FOOD);
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
    const cleared = level;
    level++;
    beep(1047, 0.15);
    earnCoins(COINS_PER_LEVEL);
    if (mode === 'maze' && level > save.mazeLevel) save.mazeLevel = level;
    if (players.length === 1) persist();
    const adBreak = wantsInterstitial(cleared);
    loadLevel();
    if (adBreak) {
      // Natural break between levels: show an ad, then a short "get ready".
      state = 'ad';
      draw();
      lastInterstitial = performance.now();
      ads.interstitial().then(() => {
        if (state !== 'ad') return;
        hideOverlay();
        freezeThen(`LEVEL ${level}`, 1300);
      });
    } else if (M().resetSnakeEachLevel) {
      // New maze: freeze briefly so the player can see the layout.
      freezeThen(`LEVEL ${level}`, 1300);
    } else {
      toast(`LEVEL ${level}`, 900);
    }
  }

  // Holds the game still while `text` shows, then carries on playing.
  function freezeThen(text, ms) {
    state = 'levelup';
    draw();
    broadcast();
    toast(text, ms, () => {
      if (state !== 'levelup') return;
      state = 'playing';
      lastTick = performance.now();
      broadcast();
    });
  }

  function wantsInterstitial(clearedLevel) {
    return players.length === 1 &&
      clearedLevel >= INTERSTITIAL_FROM_LEVEL &&
      ads.available &&
      performance.now() - lastInterstitial >= INTERSTITIAL_GAP_MS;
  }

  function earnCoins(n) {
    if (players.length !== 1) return; // no coins in 2-player modes
    save.coins += n;
    runCoins += n;
  }

  function crash(losers) {
    beep(220, 0.3);
    endReason = 'crash';
    if (!isDuel()) {
      endGame('GAME OVER');
      return;
    }
    const winner = losers.length === players.length ? -1 : players.findIndex((p) => !losers.includes(p));
    endGame(duelTitle(winner, 0), winner);
  }

  // `me` is this device's player index (0 = host, 1 = guest).
  function duelTitle(winner, me) {
    if (winner === -1) return 'DRAW';
    return winner === me ? 'YOU WIN' : 'YOU LOSE';
  }

  function endGame(title, winner = -1) {
    state = 'over';
    lastTitle = title;
    recordBest();
    const scores = isDuel() ? players.map((p) => `${p.label} ${p.score}`).join('  ·  ') : `Score ${P1().score}`;
    let text = `${scores}  ·  Level ${level}`;
    if (isHost()) {
      net.link.send({ t: 'over', winner, text });
      showMenu(title, text, [
        { label: 'Play again', action: startOnlineGame },
        { label: 'Leave', action: leaveOnline },
      ]);
      return;
    }
    const items = [];
    if (players.length === 1) {
      persist();
      text += `\n+${runCoins} coins  ·  You have ${save.coins}`;
      if (!continued) {
        if (ads.available) {
          items.push({ label: 'Continue · watch ad', action: () => rewardThen(REWARD_IDS.continue, continueRun, () => endGame(lastTitle)) });
        }
        if (save.coins >= CONTINUE_COST) {
          items.push({ label: `Continue · ${CONTINUE_COST} coins`, action: () => { save.coins -= CONTINUE_COST; persist(); continueRun(); } });
        }
      }
      if (runCoins > 0 && !doubled && ads.available) {
        items.push({
          label: `Double coins (+${runCoins}) · ad`,
          action: () => rewardThen(REWARD_IDS.double, () => {
            save.coins += runCoins;
            doubled = true;
            persist();
            beep(1320, 0.12);
            toast(`+${runCoins} COINS`, 1200);
            endGame(lastTitle);
          }, () => endGame(lastTitle)),
        });
      }
    }
    if (M().keepLevelOnCrash) {
      items.push({ label: `Retry Level ${level}`, action: () => retryLevel() });
    }
    const replay = M().keepLevelOnCrash ? 1 : startLevelFor(mode);
    items.push({ label: M().keepLevelOnCrash ? 'Restart Level 1' : 'Play again', action: () => startMode(mode, replay) });
    items.push({ label: 'Menu', action: showMainMenu });
    showMenu(title, text, items);
  }

  // Carry on the same run: same score and level, fresh snake (or more time).
  function continueRun() {
    continued = true;
    if (endReason === 'time') {
      timeLeft = CONTINUE_SECONDS * 1000;
    } else {
      spawn(P1(), 0);
      P1().queue = [];
      bonus = null;
      if (!food || P1().snake.some((s) => same(s, food))) placeFood();
    }
    hideOverlay();
    updateHud();
    freezeThen('CONTINUE!', 1000);
  }

  // Plays a rewarded ad and calls onReward only if it was watched.
  async function rewardThen(rewardId, onReward, onNoReward) {
    if (adBusy) return;
    adBusy = true;
    showMenu('AD', 'Loading ad…', []);
    const watched = await ads.rewarded(rewardId);
    adBusy = false;
    if (watched) {
      onReward();
    } else {
      onNoReward();
      toast('NO AD RIGHT NOW', 1500);
    }
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
    // Skins apply in single player; online the snakes keep solid vs hollow.
    const skin = isDuel() ? 'classic' : save.skin;
    players.forEach((p, i) => {
      p.snake.forEach((s, j) => {
        const x = s.x * cell + gap;
        const y = s.y * cell + gap;
        const size = cell - gap * 2;
        const hollow = () => ctx.strokeRect(x + gap / 2, y + gap / 2, size - gap, size - gap);
        if (i === 1) {
          // P2 is drawn hollow (with a solid head) so the two snakes are easy to tell apart.
          if (j === 0) ctx.fillRect(x, y, size, size); else hollow();
        } else if (skin === 'striped' && j % 2 === 1) {
          hollow();
        } else if (skin === 'dots' && j > 0) {
          const d = Math.max(2, Math.floor(size / 2));
          ctx.fillRect(s.x * cell + (cell - d) / 2, s.y * cell + (cell - d) / 2, d, d);
        } else if (skin === 'chunky') {
          ctx.fillRect(s.x * cell, s.y * cell, cell, cell);
        } else {
          ctx.fillRect(x, y, size, size);
        }
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
          endReason = 'time';
          endGame("TIME'S UP");
        }
      }
      if (state === 'playing' && !isGuest() && t - lastTick >= M().tick(level)) {
        lastTick = t;
        step();
        draw();
        broadcast();
      }
    }
    requestAnimationFrame(loop);
  }

  // ---- Overlay / menus ---------------------------------------------------
  function showMenu(title, text, items, index = 0) {
    roomInput.classList.add('hidden');
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
    const selected = menuEl.children[menuIndex];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
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
    // Online play needs network access, which YouTube Playables does not allow,
    // so it is only offered in the web version.
    if (!inPlayables) items.push({ label: 'Online 2P', action: openOnline });
    items.push({ label: 'Shop', action: () => showShop(0) });
    items.push({ label: 'Settings', action: () => showSettings(0) });
    showMenu('SNAKE', `Choose a mode  ·  ${save.coins} coins`, items);
    updateHud();
  }

  // Nokia-style options: wrap-around edges on/off and a starting speed level.
  function showSettings(index) {
    const st = save.settings;
    showMenu('SETTINGS', 'Walls: Classic, Time Attack, Online\nStart level: all but Maze', [
      { label: `Walls: ${st.wrap ? 'Off (wrap)' : 'On (solid)'}`, action: () => { st.wrap = !st.wrap; persist(); showSettings(0); } },
      { label: `Start level: ${st.startLevel}`, action: () => { st.startLevel = (st.startLevel % 9) + 1; persist(); showSettings(1); } },
      { label: 'Back', action: showMainMenu },
    ], index);
  }

  function showShop(index) {
    state = 'menu';
    const items = [
      { label: 'Themes', action: () => showCatalog('theme', 0) },
      { label: 'Snake skins', action: () => showCatalog('skin', 0) },
    ];
    if (ads.available) {
      items.push({
        label: `Watch ad · +${REWARD_COINS} coins`,
        action: () => rewardThen(REWARD_IDS.coins, () => {
          save.coins += REWARD_COINS;
          persist();
          beep(1320, 0.12);
          toast(`+${REWARD_COINS} COINS`, 1200);
          showShop(2);
        }, () => showShop(2)),
      });
    }
    items.push({ label: 'Back', action: showMainMenu });
    showMenu('SHOP', `Coins: ${save.coins}`, items, index);
  }

  // Lists themes or skins: buy with coins, or equip one you own.
  function showCatalog(kind, index) {
    const table = kind === 'theme' ? THEMES : SKINS;
    const owned = save.owned[kind];
    const items = Object.entries(table).map(([id, entry], i) => ({
      label: id === save[kind] ? `✓ ${entry.name}` : owned.includes(id) ? entry.name : `${entry.name} · ${entry.price} coins`,
      action: () => {
        if (!owned.includes(id)) {
          if (save.coins < entry.price) {
            toast('NOT ENOUGH COINS', 1200);
            return;
          }
          save.coins -= entry.price;
          owned.push(id);
          beep(1047, 0.15);
        }
        save[kind] = id;
        persist();
        applyTheme();
        showCatalog(kind, i);
      },
    }));
    items.push({ label: 'Back', action: () => showShop(kind === 'theme' ? 0 : 1) });
    showMenu(kind === 'theme' ? 'THEMES' : 'SKINS', `Coins: ${save.coins}`, items, index);
  }

  function applyTheme() {
    const t = THEMES[save.theme] || THEMES.nokia;
    FG = t.fg;
    BG = t.bg;
    document.documentElement.style.setProperty('--lcd-fg', t.fg);
    document.documentElement.style.setProperty('--lcd-bg', t.bg);
    draw();
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

  function hideOverlay() {
    overlay.classList.add('hidden');
    menuItems = [];
    menuEl.replaceChildren();
  }

  function play() {
    hideOverlay();
    state = 'playing';
    lastTick = performance.now();
    updateHud();
    draw();
    broadcast();
  }

  function pause() {
    if (state !== 'playing' && state !== 'levelup') return;
    if (isGuest()) {
      // The host owns the game; ask it to pause for both players.
      net.link.send({ t: 'pause' });
      return;
    }
    state = 'paused';
    if (net) net.link.send({ t: 'paused' });
    showMenu('PAUSED', `${M().name} · Level ${level}`, [
      { label: 'Resume', action: play },
      net
        ? { label: 'Leave game', action: leaveOnline }
        : { label: 'Quit to menu', action: () => { recordBest(); persist(); showMainMenu(); } },
    ]);
  }

  // ---- Online 2P ---------------------------------------------------------
  let onlineLoad = null;
  function loadOnline() {
    if (window.SnakeNet) return Promise.resolve();
    onlineLoad = onlineLoad || new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'online.js';
      s.onload = resolve;
      s.onerror = () => { onlineLoad = null; reject(new Error('online.js missing')); };
      document.head.appendChild(s);
    });
    return onlineLoad;
  }

  function openOnline(code) {
    loadOnline().then(
      () => (typeof code === 'string' ? joinRoom(code) : showOnlineMenu()),
      () => showMenu('ONLINE', 'Online play is not available here.', [{ label: 'Back', action: showMainMenu }]),
    );
  }

  function showOnlineMenu() {
    state = 'menu';
    showMenu('ONLINE 2P', 'Play a friend on another device', [
      { label: 'Create room', action: createRoom },
      { label: 'Join room', action: () => joinRoom('') },
      { label: 'Back', action: showMainMenu },
    ]);
  }

  // Shared by host and guest: what to do with the connection once it exists.
  const linkHandlers = {
    onData: (msg) => (isHost() ? hostReceive(msg) : guestReceive(msg)),
    onClose: () => {
      net = null;
      state = 'over';
      showMenu('FRIEND LEFT', 'The connection was closed.', [{ label: 'Menu', action: showMainMenu }]);
    },
  };

  function onlineError(message, retry) {
    lobby = null;
    showMenu('ONLINE 2P', message, [
      { label: 'Try again', action: retry },
      { label: 'Back', action: showOnlineMenu },
    ]);
  }

  function cancelLobby() {
    if (lobby) lobby.cancel();
    lobby = null;
    showOnlineMenu();
  }

  function createRoom() {
    showMenu('ONLINE 2P', 'Creating room…', [{ label: 'Cancel', action: cancelLobby }]);
    lobby = window.SnakeNet.host({
      ...linkHandlers,
      onCode: (code) => {
        showMenu(`ROOM ${code}`, 'Send your friend the code or link.\nWaiting for them to join…', [
          { label: 'Share link', action: () => shareRoom(code) },
          { label: 'Cancel', action: cancelLobby },
        ]);
      },
      onConnect: (link) => {
        lobby = null;
        net = { role: 'host', link };
        startOnlineGame();
      },
      onError: (message) => onlineError(message, createRoom),
    });
  }

  function shareRoom(code) {
    const url = `${location.origin}${location.pathname}?room=${code}`;
    const text = `Play Snake with me! Room ${code}`;
    if (navigator.share) {
      navigator.share({ title: 'Nokia Snake', text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => toast('LINK COPIED', 1200), () => toast(`CODE ${code}`, 1500));
    } else {
      toast(`CODE ${code}`, 1500);
    }
  }

  function joinRoom(prefill) {
    state = 'menu';
    const tryJoin = () => {
      const code = window.SnakeNet.normalizeCode(roomInput.value);
      if (code.length !== window.SnakeNet.CODE_LENGTH) {
        toast('ENTER 4 LETTERS', 1000);
        roomInput.focus();
        return;
      }
      connect(code);
    };
    showMenu('JOIN ROOM', 'Enter your friend\'s room code', [
      { label: 'Join', action: tryJoin },
      { label: 'Back', action: showOnlineMenu },
    ]);
    roomInput.value = window.SnakeNet.normalizeCode(prefill);
    roomInput.classList.remove('hidden');
    roomInput.focus();
    if (roomInput.value.length === window.SnakeNet.CODE_LENGTH) tryJoin();
  }

  function connect(code) {
    showMenu('JOIN ROOM', `Connecting to ${code}…`, [{ label: 'Cancel', action: cancelLobby }]);
    lobby = window.SnakeNet.join(code, {
      ...linkHandlers,
      onConnect: (link) => {
        lobby = null;
        net = { role: 'guest', link };
        mode = 'online';
        gameId = 0;
        showMenu('CONNECTED', 'Starting…', [{ label: 'Leave', action: leaveOnline }]);
      },
      onError: (message) => onlineError(message, () => joinRoom(code)),
    });
  }

  function leaveOnline() {
    if (net) net.link.close();
    net = null;
    if (lobby) lobby.cancel();
    lobby = null;
    showMainMenu();
  }

  // Host: start (or restart) a match with a short "get ready" freeze.
  function startOnlineGame() {
    gameId++;
    startMode('online', startLevelFor('online'));
    state = 'levelup';
    broadcast();
    toast('YOU: SOLID SNAKE', 1800, () => {
      if (state !== 'levelup') return;
      state = 'playing';
      lastTick = performance.now();
      broadcast();
    });
  }

  // Sends the board to the guest. Pauses and game-overs have their own messages.
  function broadcast() {
    if (!isHost() || (state !== 'playing' && state !== 'levelup')) return;
    net.link.send({
      t: 'snap',
      game: gameId,
      state,
      level,
      players: players.map((p) => ({ snake: p.snake, score: p.score })),
      food,
      bonus,
      bricks: [...bricks],
    });
  }

  function hostReceive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'turn' && DIRS[msg.d] && (state === 'playing' || state === 'levelup')) turn(msg.d, 1);
    else if (msg.t === 'pause') pause();
    else if (msg.t === 'resume' && state === 'paused') play();
    else if (msg.t === 'again' && state === 'over') startOnlineGame();
  }

  function guestReceive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'snap') {
      const newGame = msg.game !== gameId;
      const newLevel = !newGame && msg.level !== level;
      gameId = msg.game;
      level = msg.level;
      players = msg.players.map((p, i) => ({ snake: p.snake, score: p.score, label: `P${i + 1}`, queue: [] }));
      food = msg.food;
      bonus = msg.bonus;
      bricks = new Set(msg.bricks);
      if ((msg.state === 'playing' || msg.state === 'levelup') && state !== msg.state) {
        overlay.classList.add('hidden');
        menuItems = [];
        menuEl.replaceChildren();
      }
      state = msg.state === 'levelup' ? 'levelup' : 'playing';
      if (newGame) toast('YOU: HOLLOW SNAKE', 1800);
      else if (newLevel) toast(`LEVEL ${level}`, 900);
      updateHud();
      draw();
    } else if (msg.t === 'paused') {
      state = 'paused';
      showMenu('PAUSED', `${M().name} · Level ${level}`, [
        { label: 'Resume', action: () => net && net.link.send({ t: 'resume' }) },
        { label: 'Leave game', action: leaveOnline },
      ]);
    } else if (msg.t === 'over') {
      state = 'over';
      showMenu(duelTitle(msg.winner, 1), msg.text, [
        { label: 'Play again', action: () => { if (net) { net.link.send({ t: 'again' }); toast('WAITING…', 1200); } } },
        { label: 'Leave', action: leaveOnline },
      ]);
    }
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
    if (!DIRS[name]) return;
    if (isGuest()) net.link.send({ t: 'turn', d: name });
    else turn(name, 0);
  }

  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'select', Enter: 'select', KeyP: 'back', Escape: 'back',
  };
  window.addEventListener('keydown', (e) => {
    if (e.target === roomInput) {
      // Let the player type the code; Enter joins, Escape goes back.
      if (e.key === 'Enter') { e.preventDefault(); menuIndex = 0; activateMenu(); }
      else if (e.key === 'Escape') { e.preventDefault(); showOnlineMenu(); }
      return;
    }
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
  const touches = new Map();
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#pad, #menu, #room-input')) return;
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
    handleAction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
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
    if (Number.isInteger(data.coins) && data.coins >= 0) save.coins = data.coins;
    for (const [kind, table] of [['theme', THEMES], ['skin', SKINS]]) {
      const owned = data.owned && Array.isArray(data.owned[kind]) ? data.owned[kind].filter((id) => table[id]) : [];
      save.owned[kind] = [...new Set([...save.owned[kind], ...owned])];
      if (save.owned[kind].includes(data[kind])) save[kind] = data[kind];
    }
    applyTheme();
    lastInterstitial = performance.now(); // YouTube already shows a pre-roll at load
    level = 1;
    showMainMenu();
    const room = new URLSearchParams(location.search).get('room');
    if (room && !inPlayables) {
      // Opened from a shared link: drop the code from the URL so a reload
      // does not rejoin, then go straight to joining.
      history.replaceState(null, '', location.pathname);
      openOnline(room);
    }
    sdk.gameReady();
    requestAnimationFrame(loop);
  }

  boot();
})();

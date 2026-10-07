# Nokia Snake: YouTube Playable

A classic Nokia 3310-style Snake game built as a [YouTube Playable](https://developers.google.com/youtube/gaming/playables).
It is plain HTML, CSS and JavaScript, with no build tools or dependencies, and the YouTube bundle is about 50 KB.

## Features

- Green LCD look and diamond food, like the original
- **Levels** start at 1. Each level clears after a set number of foods, then the next level is harder.
  Each food is worth as many points as the current level.
- **6 game modes**:
  | Mode | Rules |
  |---|---|
  | **Classic** | No walls; the snake wraps around the edges. Faster every level (5 foods per level). |
  | **Box** | A brick wall around the edge. Touch it and you're out. Faster every level. |
  | **Maze** | A new brick maze every level (6 foods per level), and the snake resets to its starting length. If you crash, you can **retry the level you reached** instead of starting over. Your furthest level is saved, so the menu offers "Maze · Lv N" to continue. After 8 hand-made mazes, every level adds more random bricks, and every maze is checked so no part of the board is sealed off. |
  | **Time Attack** | 60 seconds to score as much as you can. It still levels up and speeds up. |
  | **2 Players** | Two snakes on one screen, competing for the same food. Hitting a wall, yourself or the other snake loses. A head-on crash is a draw. |
  | **Online 2P** *(web version only)* | The same 2-player rules, but each person plays **on their own phone or computer**. See [Online 2P](#online-2p) below. |
- **Settings**, like the old Nokia options menu:
  - **Walls**: Off (the snake wraps around the edges) or On (a solid border). Applies to Classic, Time Attack and 2 Players.
  - **Start level**: 1–9, so you can skip the slow early levels. Applies to every mode except Maze.
- **Bonus critter**: after every 5th food, a plus-shaped bonus critter appears for a short time. Catch it fast for extra points.
  It blinks just before it leaves.
- Best score saved separately for each mode
- **Coins, Shop and ads.** See [Coins, Shop & ads](#coins-shop--ads) below.
- Controls: arrow keys or WASD, swiping, or the on-screen d-pad. In 2 Players, P1 uses the arrows, the d-pad, or
  swipes on the right half of the screen. P2 uses WASD or swipes on the left half. Enter/Space or the centre button
  selects in menus and pauses during play. Esc or P pauses too.
- Works in portrait and landscape
- Uses the YouTube Playables SDK:
  - `firstFrameReady()` and `gameReady()` lifecycle signals
  - `onPause` pauses the game when YouTube asks it to
  - Audio follows `isAudioEnabled()` and `onAudioEnabledChange()`
  - Best scores and maze progress are stored in the cloud with `saveData()` / `loadData()`
  - The best score across all modes is reported with `engagement.sendScore()`
  - Errors are reported with `health.logError()`
- Outside YouTube it still runs, and the high score is saved in `localStorage`

## Coins, Shop & ads

**Earning coins** (single-player modes only):

| How | Coins |
|---|---|
| Each food | +1 |
| Bonus critter | +3 |
| Each level cleared | +5 |
| Shop → **Watch ad** (rewarded ad) | +25 |
| Game over → **Double coins** (rewarded ad) | doubles the coins from that run |

**Spending coins:**
- **Continue** after a game over: 30 coins, or **free if you watch an ad**. You keep your score and level, and get a
  fresh snake (in Time Attack, +15 seconds instead). Allowed once per run.
- **Shop → Themes:** 3310 Blue (200), Amber (400), Classic Gray (600), Night Mode (800)
- **Shop → Snake skins:** Striped (150), Dotted (300), Chunky (500)

**Ads** use the YouTube Playables ads API (`ytgame.ads`, currently a public preview):
- **Pre-roll:** YouTube shows it automatically while the game loads. No code needed.
- **Interstitial (ad break):** `requestInterstitialAd()` is called between levels once the player has cleared
  **Level 5**, at most once every **2 minutes**. The game freezes during the ad, then shows "LEVEL N" before play resumes.
  YouTube decides whether an ad plays and how long it is.
- **Rewarded:** `requestRewardedAd(id)` runs only when the player chooses it. Coins or the continue are given only if
  it returns `true`. Each reward type uses one fixed ID: `coins-25-reward`, `continue-run-reward` and
  `double-coins-reward`.
- 2-player modes show no ads and give no coins.
- Outside YouTube (the web version) there is no ad network, so ad options are hidden. Open the page with
  `?fakeads` to try the ad flow with a 3–5 second placeholder.

**Rules to know:**
- **Selling coins for real money is not allowed** on YouTube Playables (no in-game purchases). YouTube says it may
  test in-game purchases in 2027. Coins can only be earned.
- Ad revenue goes through YouTube's Playables monetization program, which YouTube is still piloting with selected
  developers. Ask about it when you're onboarded.

## Online 2P

1. Player 1 opens the game and picks **Online 2P → Create room**. A 4-letter room code appears, for example `ROOM PHD3`.
2. Player 1 taps **Share link** to send a link like `https://…/?room=PHD3` by WhatsApp, SMS and so on, or just tells their friend the code.
3. Player 2 opens the link, which joins automatically, or picks **Online 2P → Join room** and types the code.
4. The game starts on both devices. Player 1 is the **solid** snake and Player 2 is the **hollow** one.
   Each player steers with arrows, swipes or the d-pad on their own device.
5. Either player can pause, which pauses both. After a match, either player can choose **Play again**.
   If someone leaves, the other player sees "FRIEND LEFT".

How it works:
- The two devices connect **directly to each other** (peer-to-peer WebRTC via [PeerJS](https://peerjs.com/)).
  There is no game server to run or pay for. The free PeerJS cloud service only helps the two devices find each other.
- Player 1's device runs the game, Player 2's device sends its moves and draws what Player 1's device sends back.
- Only the 4-letter code, moves and board positions are exchanged. There are no accounts and no personal data.
- Some strict networks (certain office or mobile networks) can block direct connections. If a room won't connect,
  try Wi-Fi on both devices.
- To use your own PeerServer instead of the free cloud one, set
  `window.SNAKE_PEER_OPTIONS = { host, port, path }` before `game.js` loads.

**Online 2P is not in the YouTube Playables build.** Playables can't make network requests other than the YouTube SDK,
so `scripts/build.sh` leaves `online.js` out of the zip, and the game hides the menu option when running on YouTube.

## Host the web version on GitHub Pages (free)

The included workflow `.github/workflows/pages.yml` publishes the `src/` folder:

1. Merge this branch into `main`.
2. In the repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The workflow runs on every push to `main`, or you can run it from the **Actions** tab. The game will be at
   `https://<your-user>.github.io/nokia-snake-game/`. Share that link, or a `?room=CODE` link, with friends.

## Run locally

```bash
cd src
python3 -m http.server 8080
# open http://localhost:8080
```

## Package for upload

```bash
./scripts/build.sh
# -> dist/nokia-snake-playable.zip  (index.html sits at the zip root)
```

## How to publish a game on YouTube Playables

Playables is invite-only. You can't upload from YouTube Studio; you need to be accepted as a Playables developer first.

1. **Apply for access.** Go to the [YouTube Playables developer page](https://developers.google.com/youtube/gaming/playables)
   and submit the interest form with your game details. You can link a playable demo, such as this repo on
   GitHub Pages (see "Host the web version on GitHub Pages" above).
2. **Get onboarded.** Once approved, you get access to the private developer resources: the full SDK docs,
   the **Playables Test Suite**, the certification requirements, and the submission portal.
3. **Test in the Test Suite.** Upload `dist/nokia-snake-playable.zip` (or point it at a local server) and confirm:
   - `firstFrameReady` and `gameReady` both fire
   - The game pauses when YouTube sends a pause
   - Muting and unmuting works
   - Save data loads after a reload
   - No network requests go anywhere except the SDK. This game makes none.
4. **Check certification requirements.** These are the usual ones, and this game already meets them:
   - Small initial bundle, no external assets or CDNs
   - Responsive in every aspect ratio
   - No ads, outbound links or in-game purchases
   - Sound respects the YouTube mute state
   - Calls the SDK lifecycle methods
   Always check the current list in the developer portal, because it changes.
5. **Submit.** Upload the zip and fill in the store listing in the portal: title, description, icon,
   screenshots, age rating and supported languages. YouTube reviews it, and if it passes, it goes live in the
   Playables tab.

## Project layout

```
src/index.html    page shell; the SDK script loads first
src/style.css     Nokia LCD styling and responsive layout
src/game.js       game loop, modes, menus, input and SDK integration
src/online.js     Online 2P connection (web only, not in the YouTube zip)
.github/workflows/pages.yml  deploys src/ to GitHub Pages
scripts/build.sh  builds the upload zip
```

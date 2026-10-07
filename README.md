# Nokia Snake: YouTube Playable

A classic Nokia 3310-style Snake game built as a [YouTube Playable](https://developers.google.com/youtube/gaming/playables).
It is plain HTML, CSS and JavaScript, with no build tools or dependencies, and the whole bundle is about 31 KB.

## Features

- Green LCD look and diamond food, like the original
- **Levels** start at 1. Each level clears after a set number of foods, then the next level is harder.
  Each food is worth as many points as the current level.
- **5 game modes**:
  | Mode | Rules |
  |---|---|
  | **Classic** | No walls; the snake wraps around the edges. Faster every level (5 foods per level). |
  | **Box** | A brick wall around the edge. Touch it and you're out. Faster every level. |
  | **Maze** | A new brick maze every level (6 foods per level), and the snake resets to its starting length. If you crash, you can **retry the level you reached** instead of starting over. Your furthest level is saved, so the menu offers "Maze · Lv N" to continue. After 8 hand-made mazes, every level adds more random bricks, and every maze is checked so no part of the board is sealed off. |
  | **Time Attack** | 60 seconds to score as much as you can. It still levels up and speeds up. |
  | **2 Players** | Two snakes on one screen, competing for the same food. Hitting a wall, yourself or the other snake loses. A head-on crash is a draw. |
- **Settings**, like the old Nokia options menu:
  - **Walls**: Off (the snake wraps around the edges) or On (a solid border). Applies to Classic, Time Attack and 2 Players.
  - **Start level**: 1–9, so you can skip the slow early levels. Applies to every mode except Maze.
- **Bonus critter**: after every 5th food, a plus-shaped bonus critter appears for a short time. Catch it fast for extra points.
  It blinks just before it leaves.
- Best score saved separately for each mode
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
   GitHub Pages (see below).
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

### Optional: host a public demo on GitHub Pages

In the repo's **Settings → Pages**, deploy from the branch that holds the game, then link to
`https://<user>.github.io/nokia-snake-game/src/` on your application form.

## Project layout

```
src/index.html    page shell; the SDK script loads first
src/style.css     Nokia LCD styling and responsive layout
src/game.js       game loop, input and SDK integration
scripts/build.sh  builds the upload zip
```

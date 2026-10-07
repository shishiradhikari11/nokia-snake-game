# Nokia Snake: YouTube Playable

A classic Nokia 3310-style Snake game built as a [YouTube Playable](https://developers.google.com/youtube/gaming/playables).
It is plain HTML, CSS and JavaScript, with no build tools or dependencies, and the whole bundle is about 14 KB.

## Features

- Green LCD look, diamond food, and walls that wrap around like the original
- Controls: arrow keys or WASD, swiping, or the on-screen d-pad
- Works in portrait and landscape
- Uses the YouTube Playables SDK:
  - `firstFrameReady()` and `gameReady()` lifecycle signals
  - `onPause` pauses the game when YouTube asks it to
  - Audio follows `isAudioEnabled()` and `onAudioEnabledChange()`
  - High score is stored in the cloud with `saveData()` / `loadData()`
  - Best score is reported with `engagement.sendScore()`
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

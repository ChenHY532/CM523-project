# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

No build step or package manager. Open `index.html` directly in a browser:

```bash
open index.html          # macOS
# or drag index.html into any modern browser (Chrome/Firefox/Safari/Edge)
```

There are no automated tests, linting tools, or dev servers configured.

## Architecture

Three-file structure — all game logic lives in a single JS file:

- `index.html` — Loads Matter.js 0.19.0 (via jsDelivr CDN), `style.css`, and `script.js`
- `script.js` — All game logic (~360 lines)
- `style.css` — All visual styling (~236 lines)

### script.js layout

| Lines | Responsibility |
|-------|---------------|
| 1–39 | `NEWS_SOURCE` data array (4 real, 2 fake items) and `state`/`dom` objects |
| 42–62 | Matter.js engine/world init; player physics body (circle, radius 20) |
| 65–124 | `generatePlatform()` and `extendMap()` — procedural terrain generation |
| 127–248 | Collision handlers (stomp/land/leave/fall logic) and visual feedback |
| 251–357 | Keyboard input, game loop (`requestAnimationFrame`), camera follow |

### Physics & rendering

- **Physics:** Matter.js (headless — no built-in renderer). Bodies drive DOM element positions via `transform: translate`.
- **Rendering:** Entirely DOM-based. Platforms are `<div>` elements; the player is a `<div>` synced each frame to its Matter.js body position.
- **Game loop:** 60 fps via `requestAnimationFrame`. Each tick: run physics engine, sync DOM positions, handle continuous input, extend map ahead of player.

### Key constants (all inline in script.js)

- `engine.gravity.y = 1.1` — gravity
- `speed = 7` — auto-forward px/frame
- `jumpForce = 14` — vertical impulse on jump
- Platform gap: 150–350 px random; height variation ±150 px
- Fake news spawn rate: 20%

### Game mechanics summary

- Player auto-moves right; [A]/[←] reverses direction, [SPACE] jumps, [S]/[↓] stomps mid-air
- Landing on a **real news** platform: background shows title/summary; leaving awards **+1**
- **Stomping a fake** platform: shatters it, awards **+2** and gives upward bounce
- **Landing on fake** without stomp: platform decays, screen flashes red
- Falling below y=1000: respawn at nearest forward platform, **−2** score
- Background layer (`#bg-layer`) displays active platform's category, timestamp, title, summary

### State object

`state` in script.js is the single source of truth:
- `state.platforms` — array of `{ body, el, news, active }` objects
- `state.keys` — live keyboard state map
- `state.score` — current score
- `state.onPlatform` / `state.stomping` / `state.jumping` — movement flags
- `state.started` / `state.respawning` — lifecycle flags

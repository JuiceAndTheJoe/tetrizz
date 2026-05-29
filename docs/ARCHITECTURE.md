# TETRIZZ — architecture map

Read this first to get oriented; it tells you which file owns what so you can
jump straight to the relevant code instead of scanning the tree.

TETRIZZ is brainrot-themed multiplayer Tetris. It's an **npm-workspaces monorepo**
that ships as a **single OSC "My App"**: one Node process (`server.js`) serves the
built client, runs the Colyseus game server, and talks to Postgres.

```
tetrizz/
├── server.js              # OSC/prod entry — Express + Colyseus + Postgres on $PORT (8080)
├── package.json           # workspaces root + run scripts
├── docs/ARCHITECTURE.md   # this file
├── archive/index-v0.html  # original single-file prototype (visual reference only)
└── packages/
    ├── shared/   # @tetrizz/shared — pure game logic, no DOM/Audio/globals
    ├── server/   # @tetrizz/server — Colyseus room (esbuild-bundled, includes shared)
    └── client/   # @tetrizz/client — Vite + Phaser frontend
```

## packages/shared — pure game logic

Imported by **both** client and server, so the simulation is identical on each.
No DOM, no Phaser, no Colyseus. `index.ts` is a barrel re-exporting everything.

| File | Owns |
|---|---|
| `types.ts` | `PieceType`, `CellValue` (`0 \| PieceType \| 'G'` — `'G'` = received garbage), `Grid`, `GameState`, `LockEvent` |
| `pieces.ts` | `SHAPES` (SRS rotation matrices), `META` (per-piece name/color/glow), `GARBAGE_COLOR`, `cellColor(v)` — the color resolver both renderers use |
| `board.ts` | `COLS=10`, `ROWS=20`, `collides` / `tryMove` / `tryRotate` / `ghostY` / `mergePiece` / `clearLines` / `emptyGrid` |
| `bag.ts` | 7-bag randomizer (`createBag`, `takeNext`) |
| `rng.ts` | seeded PRNG (`nextInt`) — keeps both boards deterministic from one seed |
| `scoring.ts` | `applyClearScore`, `dropIntervalForLevel`, `fxTier` (clear intensity → FX/SFX tier) |
| `state.ts` | game-step fns: `createGame`, `inputMove/Rotate/SoftDrop/HardDrop`, `inputHold`, `tickGravity`; `QUEUE_SIZE` |
| `garbage.ts` | versus attack model: `ATTACK_TABLE`, `COMBO_BONUS`, `B2B_BONUS`, `computeAttack`, `applyGarbage` (stamps `'G'` rows) |
| `versus.ts` | wire types: `RoomStateSnapshot`, `PlayerVersusState`, `AttackEntry`, `ClientInput`, `MatchResult`; tick constants (`VERSUS_TICK_HZ=30`, `CANCEL_WINDOW_TICKS`, `COUNTDOWN_TICKS`, `RECONNECT_SECONDS`) |

## packages/server — Colyseus game server

Built with esbuild (`build:server`) → `packages/server/dist/index.js`. esbuild
**bundles `shared` from source**, so a `shared/` change needs a server rebuild.

- `src/index.ts` — `attachColyseus(httpServer, { pool })`: defines the `versus`
  room on the same http server Express uses (OSC is single-port). WS upgrades go
  to Colyseus; HTTP stays with Express.
- `src/rooms/VersusRoom.ts` — **authoritative** 1v1 room, the heart of versus:
  - max 2 clients; `waiting → countdown → playing → finished` (→ countdown again on
    rematch).
  - **single-use room**: explicitly `lock()`s when the match starts so it's never
    re-matchmade into, then `disconnect()`s ~30 s after `finished` unless both
    players opt into a rematch first.
  - **rematch protocol**: clients send `'rematch'` while the room is `finished`;
    the room collects sessionIds in `rematchReady`. Once both connected players are
    ready it clears `result`, picks a fresh seed, resets all per-player state, and
    re-runs `startCountdown()` in-place — no scene/lobby round-trip. If a player
    leaves the room mid-window (consented `BACK TO MENU`), the room broadcasts
    `'rematchAborted'` to whoever's left and tears itself down shortly after.
  - 30 Hz tick: drain each player's input queue, advance gravity, flush ripe
    garbage, KO check, then `broadcast('snapshot', RoomStateSnapshot)` with both
    players' full state every tick.
  - garbage: a clear → `computeAttack` → push `AttackEntry` to opponent's
    `attackQueue`; entries wait `CANCEL_WINDOW_TICKS` (the opponent's own clears
    can cancel them) before `applyGarbage` dumps `'G'` rows.
  - writes match rows to Postgres (best-effort; `pool` may be null); 30 s
    reconnection grace via `allowReconnection`.

## packages/client — Vite + Phaser frontend

- `index.html` — DOM shell: left/right side panels, center `.stage` →
  `.board-wrap` containing `#game` (Phaser canvas) + `#overlay` (start/death/result
  card), hold/next, leaderboard, chat.
- `src/main.ts` — `Phaser.Game` config; scene list `[Boot, Menu, Game, Lobby, Versus]`;
  base board 300×600, `Scale.FIT`.
- `src/scenes/`
  - `BootScene.ts` — asset preload.
  - `MenuScene.ts` — handle entry + solo / 1v1 choice.
  - `GameScene.ts` — **solo** play: runs the `shared` simulation locally each frame.
    Layered Graphics: `gridGfx` (static, drawn once) + `boardGfx`/`ghostGfx`/`pieceGfx`
    (dynamic). Owns HUD wiring, FX, audio, best-score persistence + `/api/scores`.
  - `LobbyScene.ts` — versus matchmaking / waiting room. Hands off to `VersusScene`
    as soon as the room hits `countdown` (or `playing`, if that snapshot was missed).
  - `VersusScene.ts` — **server-driven** 1v1 render. Connects via `RoomClient`,
    draws both boards from snapshots. Mirrors GameScene's layering: `staticGfx`
    (frames + grid lines + Hold/Next rail boxes, drawn once) + `dynGfx` (cells,
    pieces, Hold/Next contents, garbage telegraph — redrawn only when a snapshot
    arrives, coalesced to frame rate via a `dirty` flag in `update()`, not in the
    WS callback). Cell colors are parsed once into a packed-int lookup. Also owns:
    the versus HUD; a left rail showing **my Hold + Next**; the **3-2-1 countdown**
    (local timer seeded from `startsAtTick`, then `GO!` on the first `playing`
    snapshot); a left-edge **incoming-garbage telegraph** (amber = cancelable,
    pulsing red = past the cancel window); the full **clear FX/juice** reused from
    solo (`fx/*` flames/embers/shake/bg-glow + `ui/reactions`), driven by my own
    `lastLockEvent` tier; **gameplay music** (start on `GO!`) and a **game-over mog
    takeover** (`ui/mogTakeover` + the mog song) shown on both clients; the result
    overlay with a **REMATCH** button (sends `'rematch'` to the same room — once both
    players opt in the room restarts in-place; if the opp bails or the 30 s window
    expires, the client parks on a `BACK TO MENU` overlay) + BACK TO MENU; and
    **client-side reconnect** on a mid-match drop.
- `src/net/room.ts` — `RoomClient`: thin wrapper over `colyseus.js`. `join('versus')`,
  snapshot listener, leave, and `reconnect()` (resumes the same session via the
  stored `reconnectionToken` within the server's grace window; a deliberate
  `leave()` is flagged so it doesn't trip the scene's reconnect UI). **Endpoint:**
  `ws://localhost:8080` in dev, same-origin in prod.
- `src/input.ts` — keyboard bindings + DAS/ARR key repeat; shared by both play scenes.
- `src/ui/` — `overlay`, `hud`, `chat`, `leaderboard`, `reactions`, `phrases`,
  `touch` (mobile on-screen controls), `mogTakeover` (versus game-over DOM/CSS
  overlay: mogface fade-in + TV-static flash), `audioControls` (top-right dock:
  mute speaker + Music/SFX volume sliders; shared across scenes via `setActiveSfx`).
- `src/audio/sfx.ts` — `Sfx`: one-shot SFX (clears, streak loss, charlie
  high-score sting) **and** background music. Music is a gapless **intro → looping
  loop** scheduled on raw WebAudio (sample-accurate `start(when)`) routed through
  Phaser's master node so mute/volume apply; `startMusic`/`stopMusic`, charlie
  ducks the loop to silence while it plays, and `playMog` is the versus game-over
  sting. Separate user volumes: **SFX** scales every one-shot; **music** scales the
  loop against a hard 50% cap (`setSfxVolume`/`setMusicVolume`). `MUSIC_FILES`/
  `SFX_FILES` are both preloaded by `BootScene`.
- `src/fx/` — `bgglow`, `embers`, `flames`, `shake`, `textures` (visual juice).
- `src/persistence/store.ts` — `localStorage`: best score, handle, mute, sfx +
  music volume.
- `src/style.css` — all styling. `body.versus-stage …` rules re-scope the layout
  and overlay for the wide/short versus arena (vs. the tall solo board).

## server.js — production / OSC entry

Express on `$PORT` (8080): `/health`, `/api/leaderboard` + `/api/scores`
(Postgres-backed; `DATABASE_URL` optional — versus runs fine without it), static
serving of `packages/client/dist`, SPA fallback, and `attachColyseus`.

## Data flow at a glance

- **Solo:** `GameScene` simulates locally with `shared` fns → renders → persists
  best score to `localStorage` and POSTs to `/api/scores`.
- **Versus:** client sends `ClientInput` → `VersusRoom` simulates *both* boards
  authoritatively at 30 Hz → broadcasts `RoomStateSnapshot` → clients render. The
  client never simulates opponent logic; it only draws snapshots.

## Build / run

| Command | Does |
|---|---|
| `npm run dev` | Vite client on `:5173` (HMR). Enough for **solo**. |
| `npm run dev:server` | Build + run Colyseus on `:8080`. Needed for **versus**. |
| `npm run build` | shared typecheck → server esbuild → client Vite build → `packages/client/dist` |
| `npm run typecheck` | `tsc --noEmit` across all packages |
| `node server.js` / `npm start` | Production entry (what OSC runs) |

### Local 1v1 loop

Versus needs the server *and* the client. `npm run dev` alone won't connect.

```
# terminal 1 — game server (:8080)
npm run dev:server          # rebuild + restart after any shared/ or server/ change

# terminal 2 — client with hot reload (:5173)
npm run dev
```

Open **two** browser windows at http://localhost:5173 (e.g. one normal + one
incognito), click **1v1 VERSUS** in both — they matchmake into the same room.

- Client/CSS edits → instant via Vite HMR, no restart.
- `shared/` or `server/` edits → Ctrl-C terminal 1, re-run `npm run dev:server`
  (the server bundles `shared`, so its logic only updates on rebuild).

## Deploy (OSC)

Workspace **team2**, app `tetrizz`, live at **https://rizz.apps.osaas.io**. Push to
GitHub, then restart the app. See `CLAUDE.md` for the exact deploy rules.

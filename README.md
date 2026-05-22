# TETRIZZ

Brainrot-coded multiplayer Tetris on OSC. Vanilla MVP at `archive/index-v0.html`; production build at `packages/client`.

> **New here?** Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a map of the
> codebase — which file owns what, the solo vs. versus data flow, and how to run it.

## Repo layout

```
tetrizz/
├── packages/
│   ├── shared/          # @tetrizz/shared — pure game logic (pieces, board, scoring, RNG, garbage)
│   ├── server/          # @tetrizz/server — Colyseus 1v1 versus room (esbuild-bundled)
│   └── client/          # @tetrizz/client — Vite + Phaser frontend
├── server.js            # OSC/prod entry — Express + Colyseus + Postgres on $PORT
├── docs/ARCHITECTURE.md # codebase map (start here)
├── archive/
│   └── index-v0.html    # the original single-file prototype for visual reference
├── sounds/              # original SFX (also copied into packages/client/public/sounds)
├── package.json         # npm workspaces root
└── tsconfig.base.json
```

## Local dev

```bash
npm install         # one-time, at the repo root
npm run dev         # starts Vite dev server on http://localhost:5173 (enough for SOLO)
npm run typecheck   # tsc across all packages
npm run build       # production build into packages/client/dist
npm run preview     # serve the production build locally
```

Keyboard controls match the original MVP — see the "How to cook" panel in-game.

### Testing 1v1 versus locally

Versus is server-authoritative, so it needs the Colyseus server running alongside
Vite — `npm run dev` alone won't connect. Use **two terminals**:

```bash
# terminal 1 — game server on :8080 (Express + Colyseus)
npm run dev:server   # builds the server bundle, then runs it

# terminal 2 — client with hot reload on :5173
npm run dev
```

Then open **two** browser windows at http://localhost:5173 (e.g. one normal + one
incognito) and click **1v1 VERSUS** in both — they matchmake into the same room, so
you can play yourself. The dev client connects its socket to `ws://localhost:8080`
directly; matchmaking works cross-origin (the server sends permissive CORS).

- **Client / CSS edits** (scenes, `style.css`, UI) → instant via Vite HMR, no restart.
- **`shared/` or `server/` edits** → Ctrl-C terminal 1 and re-run `npm run dev:server`.
  The server esbuild-bundles `shared`, so its game logic (e.g. garbage rules) only
  updates on a rebuild.

No Postgres needed — versus runs with `DATABASE_URL` unset (only match-history
writes are skipped). `npm run dev:server` reports `db=off` in that case.

## Deploying to OSC (single-player MVP)

Eyevinn Open Source Cloud (OSC) ships a CLI named `osc` (npm package `@osaas/cli`) that handles static-site publishing.

### One-time setup

```bash
npm install -g @osaas/cli
osc login          # follow the prompts
```

### Publish a static build

```bash
npm run build
osc web publish tetrizz-staging packages/client/dist/
```

This uploads the bundle to OSC's static-site service, registers it under the slug
`tetrizz-staging`, and returns a hosted URL with CDN distribution.

### Production release

```bash
osc web publish tetrizz packages/client/dist/
```

### Custom domain + TLS

After the first publish, open the site in the OSC dashboard, attach your domain,
and OSC will provision the certificate automatically.

## What lives where

- **Everything runs in one OSC My App** (`server.js`): Express serves the built
  client, Colyseus runs the 1v1 versus room, and both share the same port. See
  `CLAUDE.md` for the deploy workflow (push → restart) and tenant details.
- **Audio assets**: bundled inside the frontend build (`packages/client/public/sounds/`)
- **Per-user state**: `localStorage` (best score, handle, mute).
- **Global state**: Postgres (`DATABASE_URL`) holds the leaderboard (`/api/scores`,
  `/api/leaderboard`) and versus match history. Optional in dev — unset it and those
  reads return empty / writes are skipped.

## Verification checklist (Phase 1)

- [x] `npm run typecheck` clean
- [x] `npm run build` produces `dist/index.html` + `dist/assets/*` + `dist/sounds/*`
- [x] `npm run preview` serves all assets with 200 responses
- [ ] Production URL on OSC loads on a clean device, plays a full game, persists best score
- [ ] Custom domain attached, TLS verified

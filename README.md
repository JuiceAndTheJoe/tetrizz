# TETRIZZ

Brainrot-coded Tetris, headed for OSC. Vanilla MVP at `archive/index-v0.html`; production build at `packages/client`.

## Repo layout

```
tetrizz/
├── packages/
│   ├── shared/          # @tetrizz/shared — pure game logic (pieces, board, scoring, RNG)
│   └── client/          # @tetrizz/client — Vite + Phaser frontend
├── archive/
│   └── index-v0.html    # the original single-file prototype for visual reference
├── sounds/              # original SFX (also copied into packages/client/public/sounds)
├── package.json         # npm workspaces root
└── tsconfig.base.json
```

## Local dev

```bash
npm install         # one-time, at the repo root
npm run dev         # starts Vite dev server on http://localhost:5173
npm run typecheck   # tsc across both packages
npm run build       # production build into packages/client/dist
npm run preview     # serve the production build locally
```

Keyboard controls match the original MVP — see the "How to cook" panel in-game.

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

- **Frontend** (this repo): OSC Static Website Publishing
- **Backend** (Phase 2, not yet built): OSC My App (Node.js) + `birme-osc-postgresql`
- **Audio assets**: bundled inside the frontend build (`packages/client/public/sounds/`)
- **Per-user state**: `localStorage` for now (best score, handle, mute). Phase 2 moves the
  global leaderboard + handle reservation to Postgres behind a Colyseus REST endpoint.

## Verification checklist (Phase 1)

- [x] `npm run typecheck` clean
- [x] `npm run build` produces `dist/index.html` + `dist/assets/*` + `dist/sounds/*`
- [x] `npm run preview` serves all assets with 200 responses
- [ ] Production URL on OSC loads on a clean device, plays a full game, persists best score
- [ ] Custom domain attached, TLS verified

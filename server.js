// Tiny Node server for OSC My App deployment.
// Serves packages/client/dist on $PORT with /health, /api/* leaderboard, and SPA fallback.

import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { attachColyseus } from './packages/server/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'packages', 'client', 'dist');
const port = Number(process.env.PORT) || 8080;

const app = express();
app.use(express.json({ limit: '4kb' }));

// ---------- db ----------
const databaseUrl = process.env.DATABASE_URL;
/** @type {pg.Pool | null} */
let pool = null;
if (databaseUrl) {
  pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  pool.on('error', (err) => console.error('[pg] idle client error', err));
  await initSchema(pool).catch((err) => {
    console.error('[pg] schema init failed', err);
  });
} else {
  console.warn('[pg] DATABASE_URL not set — /api/leaderboard will return empty');
}

async function initSchema(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS high_scores (
      id         BIGSERIAL PRIMARY KEY,
      handle     TEXT NOT NULL,
      score      INTEGER NOT NULL CHECK (score >= 0),
      lines      INTEGER NOT NULL CHECK (lines >= 0),
      level      INTEGER NOT NULL CHECK (level >= 1),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS high_scores_score_idx ON high_scores (score DESC, created_at DESC);`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id            BIGSERIAL PRIMARY KEY,
      seed          INTEGER NOT NULL,
      started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at      TIMESTAMPTZ,
      status        TEXT NOT NULL DEFAULT 'in_progress',
      winner_handle TEXT
    );
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS match_players (
      match_id        BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      handle          TEXT NOT NULL,
      score           INTEGER NOT NULL DEFAULT 0,
      lines           INTEGER NOT NULL DEFAULT 0,
      attack_sent     INTEGER NOT NULL DEFAULT 0,
      attack_received INTEGER NOT NULL DEFAULT 0,
      ko_at           INTEGER,
      PRIMARY KEY (match_id, handle)
    );
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS match_players_handle_idx ON match_players (handle);`);

  // One-time cleanup of smoke-test rows inserted while verifying the API.
  // Idempotent — deletes only the exact rows from earlier API smoke tests.
  await p.query(`DELETE FROM high_scores WHERE handle IN ('@esvel', '@cooktest');`);

  // Migrate to per-handle best: dedupe (keep highest, tiebreak by oldest id), then add UNIQUE.
  // Wrapped so the constraint addition only runs once.
  await p.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'high_scores'::regclass AND conname = 'high_scores_handle_key'
      ) THEN
        DELETE FROM high_scores a USING high_scores b
        WHERE a.handle = b.handle
          AND (a.score < b.score OR (a.score = b.score AND a.id > b.id));
        ALTER TABLE high_scores ADD CONSTRAINT high_scores_handle_key UNIQUE (handle);
      END IF;
    END $$;
  `);
}

// ---------- routes ----------
app.get('/health', (_req, res) => res.status(200).send('ok'));

app.get('/api/leaderboard', async (req, res) => {
  if (!pool) return res.json([]);
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 10;
  try {
    const { rows } = await pool.query(
      `SELECT handle, score, lines, level, created_at
         FROM high_scores
         ORDER BY score DESC, created_at DESC
         LIMIT $1`,
      [limit],
    );
    res.json(rows);
  } catch (err) {
    console.error('[api] leaderboard query failed', err);
    res.status(500).json({ error: 'db' });
  }
});

app.post('/api/scores', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'no-db' });
  const body = req.body ?? {};
  const handle = sanitizeHandle(body.handle);
  const score = sanitizeInt(body.score, 0, 999_999_999);
  const lines = sanitizeInt(body.lines, 0, 9999);
  const level = sanitizeInt(body.level, 1, 99);
  if (!handle || score == null || lines == null || level == null) {
    return res.status(400).json({ error: 'bad-input' });
  }
  try {
    // Per-handle best: insert if new, overwrite only when the new score strictly beats the old.
    // RETURNING is empty when the submitted score didn't beat the stored one — fall back to a SELECT.
    const upsert = await pool.query(
      `INSERT INTO high_scores (handle, score, lines, level)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (handle) DO UPDATE
         SET score = EXCLUDED.score,
             lines = EXCLUDED.lines,
             level = EXCLUDED.level,
             created_at = now()
         WHERE EXCLUDED.score > high_scores.score
       RETURNING handle, score, lines, level, created_at`,
      [handle, score, lines, level],
    );
    if (upsert.rows.length > 0) {
      return res.status(201).json({ ...upsert.rows[0], replaced: true });
    }
    const current = await pool.query(
      `SELECT handle, score, lines, level, created_at FROM high_scores WHERE handle = $1`,
      [handle],
    );
    res.status(200).json({ ...current.rows[0], replaced: false });
  } catch (err) {
    console.error('[api] score upsert failed', err);
    res.status(500).json({ error: 'db' });
  }
});

function sanitizeHandle(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^@+/, '').slice(0, 14);
  if (!trimmed) return null;
  // allow alnum, dot, underscore, hyphen — block control chars / quotes / markup
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return null;
  return '@' + trimmed;
}

function sanitizeInt(raw, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

// ---------- static + SPA fallback ----------
app.use(express.static(dist, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (/\/assets\//.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// SPA fallback: any non-/api, extensionless route → index.html
app.get(/^(?!\/api\/)[^.]*$/, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

const httpServer = http.createServer(app);
attachColyseus(httpServer, { pool });
httpServer.listen(port, () => {
  console.log(`[tetrizz] listening on :${port} — serving ${dist} — db=${pool ? 'on' : 'off'} — colyseus=on`);
});

// Tiny Node static server for OSC My App deployment.
// Serves packages/client/dist on $PORT with /health and SPA fallback.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'packages', 'client', 'dist');
const port = Number(process.env.PORT) || 8080;

const app = express();

app.get('/health', (_req, res) => res.status(200).send('ok'));

app.use(express.static(dist, {
  extensions: ['html'],
  // long-cache hashed assets, no-cache for index.html
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (/\/assets\//.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// SPA fallback: any request without a file extension serves index.html
app.get(/^[^.]*$/, (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(port, () => {
  console.log(`[tetrizz] listening on :${port} — serving ${dist}`);
});

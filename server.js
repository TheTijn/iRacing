import express from 'express';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3100;
const PUBLIC = fileURLToPath(new URL('./public', import.meta.url));

// Cache busting: every server start (= every deploy) gets a new version, stamped into index.html
// as ?v=… on the CSS/scripts and into a generated import map, so the ES modules main.js imports
// are versioned too. Browsers and the CDN can then never mix a new page with old modules.
const VERSION = process.env.BUILD_ID || Date.now().toString(36);

function renderIndex() {
  const modules = readdirSync(join(PUBLIC, 'js')).filter(f => f.endsWith('.js')).sort();
  const imports = Object.fromEntries(modules.map(f => [`./js/${f}`, `./js/${f}?v=${VERSION}`]));
  return readFileSync(join(PUBLIC, 'index.html'), 'utf8')
    .replace('<!--importmap-->', `<script type="importmap">${JSON.stringify({ imports })}</script>`)
    .replaceAll('__V__', VERSION);
}

// Read per request so edits to index.html / new modules show up without a restart in dev.
app.get(['/', '/index.html'], (req, res) => {
  res.set('Cache-Control', 'no-cache').type('html').send(renderIndex());
});

// express.static supports HTTP Range requests, which iOS Safari needs for <video>.
app.use(express.static(PUBLIC, {
  setHeaders(res, file) {
    if (/\.(mp4|jpg|svg|woff2)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800');
    // Code and data always revalidate (cheap 304s via ETag) instead of browser-heuristic caching.
    else if (/\.(js|css|json|html)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.listen(PORT, () => console.log(`Instant Racing running at http://localhost:${PORT} (v${VERSION})`));

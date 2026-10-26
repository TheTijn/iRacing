import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3100;
// `ng build` output: the app plus everything in public/ (media, data/races.json).
const DIST = fileURLToPath(new URL('./dist/instant-racing/browser', import.meta.url));

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build found in dist/instant-racing/browser: run `npm run build` (or `npm start`) first.');
  process.exit(1);
}

// Cache busting comes from the Angular build: JS/CSS file names carry a content hash, so they can be cached
// for good. index.html and data always revalidate (cheap 304s via ETag); media is cached for 7 days.
// express.static supports HTTP Range requests, which iOS Safari needs for <video>.
app.use(express.static(DIST, {
  setHeaders(res, file) {
    if (/-[A-Z0-9]{8}\.(js|css)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (/\.(mp4|jpg|svg|woff2|ico)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.listen(PORT, () => console.log(`Instant Racing running at http://localhost:${PORT}`));

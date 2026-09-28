import express from 'express';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = process.env.PORT || 3100;

// express.static supports HTTP Range requests, which iOS Safari needs for <video>.
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), {
  setHeaders(res, file) {
    if (/\.(mp4|jpg|svg|woff2)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800');
  },
}));

app.listen(PORT, () => console.log(`Instant Racing running at http://localhost:${PORT}`));

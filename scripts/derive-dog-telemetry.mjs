#!/usr/bin/env node
// Derives per-frame race telemetry for the Kiron greyhound videos, which ship without a .txt.
// Reads the running-order bar burned into the footage (6 trap chips at fixed positions, bottom
// centre) by colour, then merges hand-checked keyframes (<video>.keys.json: jump/finish/replay
// frames, distance readings off the HUD, order overrides) into the same line format as the horse
// telemetry: phase, leaderDistanceToGo, trap numbers in running order (leader first).
//
// Usage: node scripts/derive-dog-telemetry.mjs [--dump]   (needs ffmpeg; sources in "Dog racing videos/")
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'Dog racing videos');
const DUMP = process.argv.includes('--dump');

// Crop of the 1920×1080 source holding the order bar, and the chip interiors inside it
// (3 large chips for 1st–3rd, then 3 small ones).
const CROP = { x: 640, y: 860, w: 640, h: 104 };
const CHIPS = [
  [652, 868, 740, 956], [772, 868, 860, 956], [892, 868, 980, 956],
  [1012, 891, 1076, 956], [1108, 891, 1172, 956], [1204, 891, 1268, 956],
].map(([x0, y0, x1, y1]) => ({ x0: x0 - CROP.x, y0: y0 - CROP.y, x1: x1 - CROP.x, y1: y1 - CROP.y }));

/** Colour features of one chip, sampled from strips left and right of the trap number. */
function features(buf, c) {
  const band = Math.max(6, Math.round((c.x1 - c.x0) * 0.16));
  const inset = 3;
  let n = 0, r = 0, g = 0, b = 0, l = 0, l2 = 0;
  for (let y = c.y0 + inset; y < c.y1 - inset; y++) {
    for (const [xa, xb] of [[c.x0 + inset, c.x0 + inset + band], [c.x1 - inset - band, c.x1 - inset]]) {
      for (let x = xa; x < xb; x++) {
        const i = (y * CROP.w + x) * 3;
        const R = buf[i], G = buf[i + 1], B = buf[i + 2];
        const L = 0.299 * R + 0.587 * G + 0.114 * B;
        r += R; g += G; b += B; l += L; l2 += L * L; n++;
      }
    }
  }
  r /= n; g /= n; b /= n; l /= n;
  return { r, g, b, l, sd: Math.sqrt(Math.max(0, l2 / n - l * l)) };
}

/** Trap number for a chip, or 0 when the colour doesn't match any trap (no bar on screen). */
function classify({ r, g, b, l, sd }) {
  if (sd > 45 && sd < 110) return 6;                                  // black/white hoops
  if (sd > 30) return 0;
  if (b - r > 25 && b - g > 20) return 2;                             // blue
  if (r > 110 && g > 100 && b < 0.6 * g) return 5;                    // yellow
  if (r - g > 25 && r - b > 20 && g < 90) return 1;                   // red
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (sat < 20 && l > 115) return 3;                                  // white
  if (sat < 20 && l < 60) return 4;                                   // black
  return 0;
}

function readFrames(file, onFrame) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an',
      '-vf', `crop=${CROP.w}:${CROP.h}:${CROP.x}:${CROP.y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    const size = CROP.w * CROP.h * 3;
    let pending = Buffer.alloc(0), f = 0;
    ff.stdout.on('data', d => {
      pending = Buffer.concat([pending, d]);
      while (pending.length >= size) { onFrame(pending.subarray(0, size), f++); pending = pending.subarray(size); }
    });
    ff.on('error', reject);
    ff.on('close', code => (code === 0 ? resolve(f) : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

const isPerm = o => o.length === 6 && o.every(Boolean) && new Set(o).size === 6;

/** Replace orders that flicker for fewer than `hold` frames (chip slide animations) with the previous one. */
function debounce(raw, hold = 3) {
  const out = raw.slice();
  let cur = null;
  for (let f = 0; f < raw.length; f++) {
    const o = raw[f];
    if (!o) { out[f] = null; continue; }
    if (!cur) { cur = o; out[f] = o; continue; }
    if (o.join() === cur.join()) { out[f] = cur; continue; }
    let k = 1;
    while (k < hold && f + k < raw.length && raw[f + k] && raw[f + k].join() === o.join()) k++;
    if (k >= hold) cur = o;
    out[f] = cur;
  }
  return out;
}

/** Linear interpolation of distance-to-go between [frame, metres] keyframes. */
function distAt(f, keys) {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f0, d0] = keys[i - 1], [f1, d1] = keys[i];
    if (f <= f1) return d0 + (d1 - d0) * (f - f0) / (f1 - f0);
  }
  return keys.at(-1)[1];
}

for (const mp4 of readdirSync(SRC).filter(f => f.endsWith('.mp4')).sort()) {
  const name = basename(mp4, '.mp4');
  const raw = [];
  const feats = [];
  const frames = await readFrames(join(SRC, mp4), (buf, f) => {
    const fs = CHIPS.map(c => features(buf, c));
    const o = fs.map(classify);
    raw[f] = isPerm(o) ? o : null;
    if (DUMP) feats[f] = { o, fs: fs.map(x => [x.r, x.g, x.b, x.sd].map(Math.round)) };
  });
  const valid = raw.filter(Boolean).length;
  console.log(`· ${name}: ${frames} frames, order bar read on ${valid}`);
  if (DUMP) writeFileSync(join(SRC, `${name}.dump.json`), JSON.stringify({ raw, feats }));

  const keysFile = join(SRC, `${name}.keys.json`);
  if (!existsSync(keysFile)) { console.warn(`! ${name}.keys.json missing — create it, then re-run`); continue; }
  const keys = JSON.parse(readFileSync(keysFile, 'utf8'));
  for (const { from, to, order } of keys.overrides || []) for (let f = from; f <= to; f++) raw[f] = order;

  const order = debounce(raw);
  const { jumpFrame, finishFrame, replayStart, replayEnd, result } = keys;
  // Before the bar first appears the dogs are in the traps; hold the first read order.
  const first = order.findIndex(Boolean);
  assert.ok(first >= 0 && first < finishFrame, `${name}: no order bar before the finish`);
  let last = order[first];
  const lines = [`# venue=${keys.venue}`, `# fps=${keys.fps || 30}`, `# derived from the burned-in order bar by scripts/derive-dog-telemetry.mjs`];
  for (let f = 0; f < frames; f++) {
    if (f >= finishFrame) last = result;
    else if (order[f]) last = order[f];
    const phase = f < jumpFrame ? 'G'
      : f <= finishFrame ? 'I'
      : replayStart != null && f >= replayStart && f <= replayEnd ? '1'
      : replayEnd != null && f > replayEnd ? '3' : 'R';
    const d = f >= finishFrame ? 0 : Math.max(0.1, distAt(f, keys.dist));
    lines.push(`${phase},${f >= finishFrame && phase === 'I' ? 0 : Math.round(d * 10) / 10},${last.join(',')}`);
  }
  const lastRead = order.slice(0, finishFrame).filter(Boolean).at(-1);
  assert.deepEqual(lastRead, result, `${name}: last order bar read ${lastRead} differs from keys result (add an override?)`);
  writeFileSync(join(SRC, `${name}.txt`), lines.join('\n') + '\n');
  console.log(`✓ ${name}.txt: jump @${jumpFrame}, finish @${finishFrame}, result ${result.join('-')}`);
}

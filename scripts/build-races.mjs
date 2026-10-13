#!/usr/bin/env node
// Parses the per-frame race telemetry (.txt next to each source video) into public/data/races.json.
//
// Line format (one line per video frame):
//   phase, leaderDistanceToGo, runnerNo@1st, runnerNo@2nd, ... runnerNo@last
// Phases: G = in gates/traps, I = running, R = pull-up, 1/2 = slow-mo finish replay, 3 = empty shot.
// Optional header lines `# key=value` (venue, fps) override the per-sport defaults below.
// Horse telemetry ships with the videos; dog telemetry is derived by scripts/derive-dog-telemetry.mjs.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/data/races.json');
const DIST_STEP = 5; // sample leader distance every N frames

const SOURCES = [
  { sport: 'horses', dir: 'Test Videos', fps: 25, trimSec: 65,
    id: f => f.match(/_(\d+)\.txt$/)[1], venue: f => f.split('_')[0],
    media: id => `assets/races/race-${id}` },
  { sport: 'dogs', dir: 'Dog racing videos', fps: 30, trimSec: null,
    id: f => `d${f.match(/-(\d+)\.txt$/)[1]}`, venue: () => null,
    media: id => `assets/races/dogs/dog-${id.slice(1)}` },
];

const races = [];
for (const src of SOURCES) {
  const dir = join(ROOT, src.dir);
  if (!existsSync(dir)) { console.warn(`! ${src.dir}/ missing — no ${src.sport} races`); continue; }
  for (const file of readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
    const id = src.id(file);
    const text = readFileSync(join(dir, file), 'utf8').split(/\r?\n/).map(l => l.trim());
    const meta = Object.fromEntries(text.filter(l => /^#\s*\w+=/.test(l)).map(l => l.replace(/^#\s*/, '').split('=')));
    const fps = Number(meta.fps || src.fps);
    const venue = meta.venue || src.venue(file);
    assert.ok(venue, `${id}: no venue`);

    const frames = text.filter(l => /^[A-Z0-9],/.test(l)).map(l => {
      const [phase, dist, ...order] = l.split(',');
      return { phase, dist: Number(dist), order: order.map(Number) };
    });

    const runners = frames[0].order.length;
    const distance = frames[0].dist;
    frames.forEach((fr, i) => {
      assert.equal(fr.order.length, runners, `${id}: frame ${i} has ${fr.order.length} runners`);
      assert.equal(new Set(fr.order).size, runners, `${id}: frame ${i} has duplicate runners`);
      assert.ok(fr.order.every(n => n >= 1 && n <= runners), `${id}: frame ${i} has a runner number out of range`);
    });

    const gateEndFrame = frames.findIndex(f => f.phase !== 'G');
    const finishFrame = frames.findIndex(f => f.phase === 'I' && f.dist === 0);
    const replayStart = frames.findIndex(f => f.phase === '1');
    let replayEnd = frames.findIndex((f, i) => i > replayStart && f.phase !== '1' && f.phase !== '2');
    if (replayStart > 0 && replayEnd < 0) replayEnd = frames.length - 1;   // replay runs to the end of the video
    assert.ok(gateEndFrame > 0 && finishFrame > gateEndFrame, `${id}: bad gate/finish frames`);

    const result = frames[finishFrame].order;
    assert.deepEqual(frames.at(-1).order, result, `${id}: finish order differs from final line`);

    // Running order: only store frames where the order changes (race window only).
    const orderEvents = [];
    let prev = '';
    for (let f = 0; f <= finishFrame; f++) {
      const key = frames[f].order.join(',');
      if (key !== prev) { orderEvents.push({ f, order: frames[f].order }); prev = key; }
    }

    const dist = [];
    for (let f = 0; f <= finishFrame; f += DIST_STEP) dist.push(Math.round(frames[f].dist * 10) / 10);

    const base = src.media(id);
    if (!existsSync(join(ROOT, 'public', `${base}.mp4`))) console.warn(`! ${base}.mp4 missing (run scripts/transcode.sh)`);
    const lastFrame = src.trimSec ? src.trimSec * fps - 1 : frames.length - 1;

    races.push({
      id, sport: src.sport, venue, distance, runners, fps,
      src: `${base}.mp4`, poster: `${base}.jpg`, thumb: `${base}-run.jpg`,
      gateEndFrame, finishFrame,
      replayStart: replayStart > 0 ? replayStart : null,
      replayEnd: replayStart > 0 && replayEnd > 0 ? Math.min(replayEnd, lastFrame) : null,
      result, distStep: DIST_STEP, dist, orderEvents,
    });
    console.log(`✓ ${src.sport} ${id} (${venue}): ${runners} runners, ${distance}m, finish @${(finishFrame / fps).toFixed(2)}s, ` +
      `result ${result.slice(0, 3).join('-')}, ${orderEvents.length} order changes`);
  }
}

for (const { sport } of SOURCES) assert.ok(races.some(r => r.sport === sport), `no ${sport} races found`);
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), races }));
console.log(`→ ${OUT} (${races.length} races)`);

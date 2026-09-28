#!/usr/bin/env node
// Parses the per-frame race telemetry (.txt next to each source video) into public/data/races.json.
//
// Line format (one line per video frame, 25 fps):
//   phase, leaderDistanceToGo, horseNo@1st, horseNo@2nd, ... horseNo@last
// Phases: G = in gates, I = running, R = pull-up, 1/2 = slow-mo finish replay, 3 = empty shot.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'Test Videos');
const OUT = join(ROOT, 'public/data/races.json');
const FPS = 25;
const DIST_STEP = 5; // sample leader distance every N frames

const races = [];
for (const file of readdirSync(SRC).filter(f => f.endsWith('.txt')).sort()) {
  const id = file.match(/_(\d+)\.txt$/)[1];
  const venue = file.split('_')[0];
  const lines = readFileSync(join(SRC, file), 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => /^[A-Z0-9],/.test(l));

  const frames = lines.map(l => {
    const [phase, dist, ...order] = l.split(',');
    return { phase, dist: Number(dist), order: order.map(Number) };
  });

  const runners = frames[0].order.length;
  const distance = frames[0].dist;
  frames.forEach((fr, i) => {
    assert.equal(fr.order.length, runners, `${id}: frame ${i} has ${fr.order.length} runners`);
    assert.equal(new Set(fr.order).size, runners, `${id}: frame ${i} has duplicate horses`);
  });

  const gateEndFrame = frames.findIndex(f => f.phase !== 'G');
  const finishFrame = frames.findIndex(f => f.phase === 'I' && f.dist === 0);
  const replayStart = frames.findIndex(f => f.phase === '1');
  const replayEnd = frames.findIndex(f => f.phase === '3');
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

  const mp4 = `assets/races/race-${id}.mp4`;
  if (!existsSync(join(ROOT, 'public', mp4))) console.warn(`! ${mp4} missing (run scripts/transcode.sh)`);

  races.push({
    id, venue, distance, runners, fps: FPS,
    src: mp4, poster: `assets/races/race-${id}.jpg`,
    gateEndFrame, finishFrame,
    replayStart: replayStart > 0 ? replayStart : null,
    replayEnd: replayEnd > 0 ? Math.min(replayEnd, 65 * FPS - 1) : null,
    result, distStep: DIST_STEP, dist, orderEvents,
  });
  console.log(`✓ ${id}: ${runners} runners, ${distance}m, finish @${(finishFrame / FPS).toFixed(2)}s, ` +
    `result ${result.slice(0, 3).join('-')}, ${orderEvents.length} order changes`);
}

assert.ok(races.length > 0, 'no races found');
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), races }));
console.log(`→ ${OUT} (${races.length} races)`);

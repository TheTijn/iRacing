import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildField, WIN_BOOK, PLACE_BOOK } from '../public/js/field.js';

// Deterministic PRNG so failures are reproducible
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

test('every field has a realistic, coherent market', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const f = buildField(10, mulberry(seed));
    assert.deepEqual(f.horses, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(new Set(Object.values(f.runners).map(r => r.name)).size, 10, 'unique names');
    const winBook = f.horses.reduce((s, h) => s + 1 / f.win[h], 0);
    const placeBook = f.horses.reduce((s, h) => s + 1 / f.place[h], 0);
    assert.ok(Math.abs(winBook - WIN_BOOK) < 0.01, `seed ${seed}: win book ${winBook}`);
    assert.ok(Math.abs(placeBook - PLACE_BOOK * f.places) < 0.05, `seed ${seed}: place book ${placeBook}`);
    for (const h of f.horses) {
      assert.ok(f.place[h] <= f.win[h] && f.place[h] >= 1.01, `seed ${seed}: #${h} place ${f.place[h]} win ${f.win[h]}`);
    }
    assert.equal(f.byOdds[0], f.favourite);
    assert.ok(f.byOdds.every((h, i, a) => i === 0 || f.win[a[i - 1]] <= f.win[h]), 'sorted by odds');
  }
});

test('smaller fields pay fewer places', () => {
  const f = buildField(6, mulberry(7));
  assert.equal(f.places, 2);
  assert.equal(f.horses.length, 6);
});

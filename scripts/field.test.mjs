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

test('numbers follow the market: #1 favourite, #2 second favourite, …', () => {
  for (const [sport, n] of [['dogs', 6], ['horses', 10], ['horses', 6]]) {
    for (let seed = 1; seed <= 300; seed++) {
      const f = buildField(n, mulberry(seed), sport);
      assert.equal(f.favourite, 1, `${sport} seed ${seed}: favourite is #1`);
      assert.deepEqual(f.byOdds, f.horses, `${sport} seed ${seed}: number order is price order`);
      for (let h = 2; h <= n; h++) {
        assert.ok(f.win[h - 1] <= f.win[h], `${sport} seed ${seed}: win #${h - 1} ${f.win[h - 1]} > #${h} ${f.win[h]}`);
        assert.ok(f.place[h - 1] <= f.place[h], `${sport} seed ${seed}: place #${h - 1} ${f.place[h - 1]} > #${h} ${f.place[h]}`);
      }
    }
  }
});

test('smaller fields pay fewer places', () => {
  const f = buildField(6, mulberry(7));
  assert.equal(f.places, 2);
  assert.equal(f.horses.length, 6);
});

test('greyhound fields: six traps, two places, coherent market', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const f = buildField(6, mulberry(seed), 'dogs');
    assert.equal(f.sport, 'dogs');
    assert.deepEqual(f.horses, [1, 2, 3, 4, 5, 6]);
    assert.equal(f.places, 2);
    assert.equal(new Set(Object.values(f.runners).map(r => r.name)).size, 6, 'unique names');
    assert.ok(Object.values(f.runners).every(r => r.form.every(p => p >= 1 && p <= 6)), 'greyhound form is 1–6');
    assert.ok(Object.values(f.runners).every(r => r.silk && r.silk.body), 'every trap has a jacket');
    const winBook = f.horses.reduce((s, h) => s + 1 / f.win[h], 0);
    const placeBook = f.horses.reduce((s, h) => s + 1 / f.place[h], 0);
    assert.ok(Math.abs(winBook - WIN_BOOK) < 0.01, `seed ${seed}: win book ${winBook}`);
    assert.ok(Math.abs(placeBook - PLACE_BOOK * f.places) < 0.05, `seed ${seed}: place book ${placeBook}`);
    for (const h of f.horses) assert.ok(f.place[h] <= f.win[h] && f.place[h] >= 1.01, `seed ${seed}: #${h}`);
  }
});

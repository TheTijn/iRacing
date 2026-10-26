import { buildField, WIN_BOOK, PLACE_BOOK } from './field';
import type { SportKey } from './models';

// Deterministic PRNG so failures are reproducible
const mulberry = (seed: number) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

describe('buildField', () => {
  it('gives every field a realistic, coherent market', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const f = buildField(10, mulberry(seed));
      expect(f.horses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(new Set(Object.values(f.runners).map(r => r.name)).size, 'unique names').toBe(10);
      const winBook = f.horses.reduce((s, h) => s + 1 / f.win[h], 0);
      const placeBook = f.horses.reduce((s, h) => s + 1 / f.place[h], 0);
      expect(Math.abs(winBook - WIN_BOOK), `seed ${seed}: win book ${winBook}`).toBeLessThan(0.01);
      expect(Math.abs(placeBook - PLACE_BOOK * f.places), `seed ${seed}: place book ${placeBook}`).toBeLessThan(0.05);
      for (const h of f.horses) {
        expect(f.place[h] <= f.win[h] && f.place[h] >= 1.01, `seed ${seed}: #${h} place ${f.place[h]} win ${f.win[h]}`).toBe(true);
      }
      expect(f.byOdds[0]).toBe(f.favourite);
      expect(f.byOdds.every((h, i, a) => i === 0 || f.win[a[i - 1]] <= f.win[h]), 'sorted by odds').toBe(true);
    }
  });

  it('numbers runners by the market: #1 favourite, #2 second favourite, …', () => {
    for (const [sport, n] of [['dogs', 6], ['horses', 10], ['horses', 6]] as [SportKey, number][]) {
      for (let seed = 1; seed <= 300; seed++) {
        const f = buildField(n, mulberry(seed), sport);
        expect(f.favourite, `${sport} seed ${seed}: favourite is #1`).toBe(1);
        expect(f.byOdds, `${sport} seed ${seed}: number order is price order`).toEqual(f.horses);
        for (let h = 2; h <= n; h++) {
          expect(f.win[h - 1] <= f.win[h], `${sport} seed ${seed}: win #${h - 1} ${f.win[h - 1]} > #${h} ${f.win[h]}`).toBe(true);
          expect(f.place[h - 1] <= f.place[h], `${sport} seed ${seed}: place #${h - 1} ${f.place[h - 1]} > #${h} ${f.place[h]}`).toBe(true);
        }
      }
    }
  });

  it('pays fewer places on smaller fields', () => {
    const f = buildField(6, mulberry(7));
    expect(f.places).toBe(2);
    expect(f.horses.length).toBe(6);
  });

  it('builds greyhound fields: six traps, two places, coherent market', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const f = buildField(6, mulberry(seed), 'dogs');
      expect(f.sport).toBe('dogs');
      expect(f.horses).toEqual([1, 2, 3, 4, 5, 6]);
      expect(f.places).toBe(2);
      expect(new Set(Object.values(f.runners).map(r => r.name)).size, 'unique names').toBe(6);
      expect(Object.values(f.runners).every(r => r.form.every(p => p >= 1 && p <= 6)), 'greyhound form is 1–6').toBe(true);
      expect(Object.values(f.runners).every(r => r.silk && r.silk.body), 'every trap has a jacket').toBe(true);
      const winBook = f.horses.reduce((s, h) => s + 1 / f.win[h], 0);
      const placeBook = f.horses.reduce((s, h) => s + 1 / f.place[h], 0);
      expect(Math.abs(winBook - WIN_BOOK), `seed ${seed}: win book ${winBook}`).toBeLessThan(0.01);
      expect(Math.abs(placeBook - PLACE_BOOK * f.places), `seed ${seed}: place book ${placeBook}`).toBeLessThan(0.05);
      for (const h of f.horses) expect(f.place[h] <= f.win[h] && f.place[h] >= 1.01, `seed ${seed}: #${h}`).toBe(true);
    }
  });

  it('builds eight-dog fields (Summerset Park): three places, a jacket for every trap', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const f = buildField(8, mulberry(seed), 'dogs');
      expect(f.horses).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(f.places).toBe(3);
      expect(new Set(Object.values(f.runners).map(r => r.name)).size, 'unique names').toBe(8);
      expect(Object.values(f.runners).every(r => r.silk && r.silk.body), 'every trap has a jacket').toBe(true);
      const winBook = f.horses.reduce((s, h) => s + 1 / f.win[h], 0);
      expect(Math.abs(winBook - WIN_BOOK), `seed ${seed}: win book ${winBook}`).toBeLessThan(0.01);
    }
  });
});

// Pricing, settlement and race data. Run with `npm test` (ng test, Vitest).
import racesJson from '../../../public/data/races.json';
import type { Race } from './models';
import {
  expandCombos, pickError, buildBet, settle, betCost, maxReturn, liveState, winProbs,
  comboProbability, exoticPrice, formatOdds, toAmerican, toFractional, placesFor, EXOTICS,
  h2hPairs, aheadProb, winnerSets, MATCH_BOOK, SET_SIDES, round2,
} from './pricing';
import { SPORTS, GAMES, gameRaces } from './sports';
import { buildField } from './field';
import { withVirtualRunners, sampleFinish, mergeOrder } from './virtual';
import type { BetType, SetSide } from './models';

// Deterministic PRNG so failures are reproducible
const mulberry = (seed: number) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const PROFILES = SPORTS.horses.profiles;

const horses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const field = {
  horses,
  win: Object.fromEntries(horses.map((h, i) => [h, PROFILES[i].win])),
  place: Object.fromEntries(horses.map((h, i) => [h, PROFILES[i].place])),
};
const races = (racesJson as unknown as { races: Race[] }).races;
const race = (id: string) => races.find(r => r.id === id)!;
const bet = (type: BetType, legs: number[][], box = false, stake = 1) => buildBet(type, legs, { stake, box, field });

describe('pricing', () => {
  it('counts combinations', () => {
    const s = [1, 2, 3, 4];
    expect(expandCombos('EXACTA', [s], true).length).toBe(12);      // n(n-1)
    expect(expandCombos('TRIFECTA', [s], true).length).toBe(24);    // n(n-1)(n-2)
    expect(expandCombos('TRIFECTA', [horses], true).length).toBe(720);
    expect(expandCombos('QUINELLA', [s]).length).toBe(6);           // C(n,2)
    expect(expandCombos('SWINGER', [s]).length).toBe(6);
    expect(expandCombos('TRIO', [s]).length).toBe(4);               // C(n,3)
    expect(expandCombos('EXACTA', [[1], [2, 3, 4]]).length).toBe(3);
    expect(expandCombos('EXACTA', [[1, 2], [1, 2]]).length).toBe(2); // no self pairs
    expect(expandCombos('TRIFECTA', [[1], [2, 3], [2, 3, 4]]).length).toBe(4);
    expect(expandCombos('EXACTA', [[1], []]).length).toBe(0);
    expect(expandCombos('WIN', [[4]]).length).toBe(1);
  });

  it('validates picks', () => {
    expect(pickError('EXACTA', [[1], []])).toBe('Pick a horse for 2nd');
    expect(pickError('EXACTA', [[1], [1]])).toBe('Pick different horses for each position');
    expect(pickError('EXACTA', [[1], [2]])).toBeNull();
    expect(pickError('TRIO', [[1, 2]])).toBe('Pick 1 more horse');
    expect(pickError('TRIFECTA', [[1]], true)).toBe('Pick 2 more horses');
    expect(pickError('SWINGER', [[3, 9]])).toBeNull();
  });

  it('has sane race data', () => {
    expect(races.filter(r => r.sport === 'horses').length).toBe(5);
    expect(races.filter(r => r.sport === 'dogs').length).toBeGreaterThanOrEqual(2);
    for (const r of races) {
      expect(SPORTS[r.sport], `${r.id}: unknown sport ${r.sport}`).toBeTruthy();
      expect(r.venue, `${r.id}: venue`).toBeTruthy();
      expect(r.result.length).toBe(r.runners);
      expect(r.orderEvents.at(-1)!.order).toEqual(r.result);
      expect(r.finishFrame).toBeGreaterThan(r.gateEndFrame);
    }
  });

  it('settles against video 190 podium 1-2-6', () => {
    const podium = race('190').result;
    expect(podium.slice(0, 3)).toEqual([1, 2, 6]);
    const win1 = bet('WIN', [[1]], false, 10);
    expect(settle(win1, podium)).toBe(37.8);
    expect(settle(bet('WIN', [[2]]), podium)).toBe(0);
    expect(settle(bet('PLACE', [[6]], false, 2), podium)).toBe(2 * field.place[6]);
    expect(settle(bet('PLACE', [[9]]), podium)).toBe(0);
    expect(settle(bet('EXACTA', [[1], [2]]), podium)).toBeGreaterThan(0);
    expect(settle(bet('EXACTA', [[2], [1]]), podium)).toBe(0);
    expect(settle(bet('EXACTA', [[1, 2]], true), podium)).toBeGreaterThan(0);
    expect(settle(bet('TRIFECTA', [[1], [2], [6]]), podium)).toBeGreaterThan(0);
    expect(settle(bet('TRIFECTA', [[1], [6], [2]]), podium)).toBe(0);
    expect(settle(bet('QUINELLA', [[2, 1]]), podium)).toBeGreaterThan(0);
    expect(settle(bet('QUINELLA', [[1, 6]]), podium)).toBe(0);
    expect(settle(bet('TRIO', [[6, 2, 1]]), podium)).toBeGreaterThan(0);
    expect(settle(bet('TRIO', [[6, 2, 3]]), podium)).toBe(0);

    const sw = bet('SWINGER', [[1, 6, 9]]);           // pairs 1-6 ✓, 1-9 ✗, 6-9 ✗
    const p16 = sw.combos.find(c => c.sel.join() === '1,6')!.price;
    expect(settle(sw, podium)).toBe(p16);
    const sw3 = bet('SWINGER', [[1, 2, 6]]);          // all three pairs win
    expect(settle(sw3, podium)).toBe(Math.round(sw3.combos.reduce((s, c) => s + c.price, 0) * 100) / 100);
  });

  it('gives every game races; dog games are one venue each', () => {
    for (const g of Object.values(GAMES)) {
      const rs = gameRaces(g, races);
      expect(rs.length, `${g.key}: no races`).toBeGreaterThan(0);
      if (g.runners) expect(rs.every(r => r.runners <= g.runners!), `${g.key}: video field larger than the game`).toBe(true);
    }
    expect(gameRaces(GAMES.crawford, races).map(r => r.id)).toEqual(['d01']);
    expect(gameRaces(GAMES.summerset, races).map(r => r.id)).toEqual(['d02', 's123', 's124', 's125', 's126']);
    expect(SPORTS.dogs.colours[7] && SPORTS.dogs.colours[8], 'trap jackets for 7 and 8').toBeTruthy();
  });

  it('matches the greyhound results to the finish shown in the videos', () => {
    expect(race('d01').result).toEqual([2, 3, 4, 6, 1, 5]);
    expect(race('d02').result).toEqual([4, 1, 6, 2, 5, 3]);
    for (const r of races.filter(x => /^d\d/.test(x.id))) {
      expect(r.runners).toBe(6);
      expect(r.distance).toBe(720);
      expect(r.replayStart! > r.finishFrame && r.replayEnd! > r.replayStart!, `${r.id}: replay window`).toBe(true);
    }
    // Summerset Park 8-dog footage (360m, no replay). The file names are not the finish order (1-2-4 finishes 1-2-3).
    expect(race('s123').result).toEqual([1, 2, 3, 6, 5, 4, 8, 7]);
    expect(race('s124').result).toEqual([1, 2, 3, 4, 6, 5, 7, 8]);
    expect(race('s125').result).toEqual([1, 5, 3, 6, 2, 7, 4, 8]);
    expect(race('s126').result).toEqual([1, 6, 3, 2, 5, 7, 4, 8]);
    for (const r of races.filter(x => /^s\d/.test(x.id))) {
      expect(r.runners).toBe(8);
      expect(r.distance).toBe(360);
      expect(r.replayStart).toBeNull();
    }
  });

  it('settles against every video podium', () => {
    for (const r of races) {
      const [a, b, c] = r.result;
      expect(settle(bet('WIN', [[a]]), r.result), r.id).toBeGreaterThan(0);
      for (const h of [a, b, c]) expect(settle(bet('PLACE', [[h]]), r.result), r.id).toBeGreaterThan(0);
      expect(settle(bet('PLACE', [[r.result[3]]]), r.result), r.id).toBe(0);
      expect(settle(bet('TRIFECTA', [[a], [b], [c]]), r.result), r.id).toBeGreaterThan(0);
      expect(settle(bet('TRIO', [[c, a, b]]), r.result), r.id).toBeGreaterThan(0);
    }
  });

  it('costs a ticket at unit × combos', () => {
    expect(betCost(bet('TRIFECTA', [[1, 2, 3, 4]], true, 0.5))).toBe(12);
    expect(betCost(bet('QUINELLA', [[1, 2, 3]], false, 2))).toBe(6);
  });

  it('has consistent Harville probabilities', () => {
    const p = winProbs(field.win);
    expect(Math.abs(Object.values(p).reduce((s, x) => s + x, 0) - 1)).toBeLessThan(1e-9);
    // Sum of all exacta probabilities = 1; all trifectas = 1
    const ex = expandCombos('EXACTA', [horses], true).reduce((s, c) => s + comboProbability('EXACTA', c, p), 0);
    const tri = expandCombos('TRIFECTA', [horses], true).reduce((s, c) => s + comboProbability('TRIFECTA', c, p), 0);
    expect(Math.abs(ex - 1) < 1e-9 && Math.abs(tri - 1) < 1e-9).toBe(true);
    // Swinger pair probabilities sum to 3 (each podium contains 3 pairs)
    const sw = expandCombos('SWINGER', [horses]).reduce((s, c) => s + comboProbability('SWINGER', c, p, horses), 0);
    expect(Math.abs(sw - 3)).toBeLessThan(1e-9);
    // Favourite exacta priced shorter than the reverse; caps respected
    expect(exoticPrice('EXACTA', [1, 2], p, horses)).toBeLessThan(exoticPrice('EXACTA', [2, 1], p, horses));
    expect(exoticPrice('TRIFECTA', [10, 9, 8], p, horses)).toBeLessThanOrEqual(5000);
    expect(exoticPrice('SWINGER', [1, 2], p, horses)).toBeGreaterThanOrEqual(1.01);
  });

  it('gives an exact max return, not a naive sum', () => {
    const w1 = bet('WIN', [[1]], false, 10);   // 37.80
    const w2 = bet('WIN', [[2]], false, 10);   // 58.40
    expect(maxReturn([w1, w2], horses)).toBe(58.4);
    const p1 = bet('PLACE', [[1]], false, 10);
    expect(maxReturn([w1, p1], horses)).toBe(59.2);
    expect(maxReturn([], horses)).toBe(0);
  });

  it('tracks live state', () => {
    const order = [3, 1, 2, 4, 5, 6, 7, 8, 9, 10];
    expect(liveState(bet('WIN', [[3]]), order)).toBe('winning');
    expect(liveState(bet('WIN', [[1]]), order)).toBe('close');
    expect(liveState(bet('WIN', [[2]]), order)).toBe('out');
    expect(liveState(bet('PLACE', [[4]]), order)).toBe('close');
    expect(liveState(bet('PLACE', [[5]]), order)).toBe('out');
    expect(liveState(bet('EXACTA', [[1], [3]]), order)).toBe('close');
  });

  it('formats odds', () => {
    expect(formatOdds(3.78)).toBe('3.78');
    expect(toAmerican(3.78)).toBe('+278');
    expect(toAmerican(2)).toBe('+100');
    expect(toAmerican(1.5)).toBe('-200');
    expect(toFractional(3.75)).toBe('11/4');
    expect(toFractional(2.0)).toBe('1/1');
    expect(toFractional(1.5)).toBe('1/2');
    expect(toFractional(11)).toBe('10/1');
  });

  it('pays places by field size', () => {
    expect(placesFor(10)).toBe(3);
    expect(placesFor(6)).toBe(2);
  });

  it('builds and settles every exotic type', () => {
    const podium = [4, 3, 5, 2, 1, 9, 7, 10, 8, 6];
    for (const t of EXOTICS) {
      const b = bet(t, [[4, 3, 5]], true);
      expect(b.combos.length, t).toBeGreaterThan(0);
      expect(settle(b, podium), t).toBeGreaterThan(0);
    }
  });

  it('pays the top 2 only on a six-runner (greyhound) Place', () => {
    const field = { horses: [1, 2, 3, 4, 5, 6], win: { 1: 3, 2: 4, 3: 5, 4: 7, 5: 9, 6: 12 }, place: { 1: 1.6, 2: 1.9, 3: 2.2, 4: 2.8, 5: 3.4, 6: 4 } };
    const places = placesFor(6);
    expect(places).toBe(2);
    const order = [4, 1, 6, 2, 5, 3];
    expect(settle(buildBet('PLACE', [[1]], { stake: 10, field }), order, places)).toBe(16);
    expect(settle(buildBet('PLACE', [[6]], { stake: 10, field }), order, places)).toBe(0);
    // Reverse Forecast = boxed Exacta: two combos, one pays
    const rf = buildBet('EXACTA', [[1, 4]], { stake: 1, box: true, field });
    expect(rf.combos.length).toBe(2);
    expect(settle(rf, order, places)).toBeGreaterThan(0);
  });
});

// ---------- Head to Head tab ----------
describe('head to head markets', () => {
  it('prices and settles matchups', () => {
    expect(h2hPairs(field)).toEqual([[1, 2], [2, 3], [3, 4]]);   // F1 v F2, F2 v F3, F3 v F4
    const p = winProbs(field.win);
    for (const [a, b] of h2hPairs(field)) {
      expect(Math.abs(aheadProb(a, b, p) + aheadProb(b, a, p) - 1)).toBeLessThan(1e-12);
      const book = 1 / bet('H2H', [[a], [b]]).combos[0].price + 1 / bet('H2H', [[b], [a]]).combos[0].price;
      expect(Math.abs(book - MATCH_BOOK), `${a} v ${b}: book ${book}`).toBeLessThan(0.01);
      expect(bet('H2H', [[a], [b]]).combos[0].price, 'favourite is shorter').toBeLessThan(bet('H2H', [[b], [a]]).combos[0].price);
    }
    const order = [5, 3, 1, 9, 2, 4, 6, 7, 8, 10];
    expect(settle(bet('H2H', [[1], [2]], false, 10), order)).toBeGreaterThan(10);   // 1 is 3rd, 2 is 5th
    expect(settle(bet('H2H', [[2], [1]]), order)).toBe(0);
    expect(settle(bet('H2H', [[2], [4]]), order), 'both outside the podium').toBeGreaterThan(0);
    // A partial order: the runner missing from it finished behind
    expect(settle(bet('H2H', [[1], [2]]), [5, 3, 1])).toBeGreaterThan(0);
    expect(settle(bet('H2H', [[2], [4]]), [5, 3, 1])).toBe(0);
  });

  it('prices odd/even and high/low on the winning number', () => {
    expect(winnerSets([1, 2, 3, 4, 5, 6])).toEqual({ Odd: [1, 3, 5], Even: [2, 4, 6], Low: [1, 2, 3], High: [4, 5, 6] });
    expect(winnerSets([1, 2, 3, 4, 5, 6, 7, 8]).High).toEqual([5, 6, 7, 8]);
    for (const [type, [x, y]] of Object.entries(SET_SIDES) as [BetType, [SetSide, SetSide]][]) {
      const bx = buildBet(type, [], { stake: 1, field, side: x });
      const by = buildBet(type, [], { stake: 1, field, side: y });
      expect(bx.side).toBe(x);
      expect(Math.abs(1 / bx.combos[0].price + 1 / by.combos[0].price - MATCH_BOOK), type).toBeLessThan(0.01);
      expect([...bx.legs[0], ...by.legs[0]].sort((a, b) => a - b), `${type} covers the field once`).toEqual(horses);
    }
    const odd = buildBet('ODDEVEN', [], { stake: 10, field, side: 'Odd' });
    expect(settle(odd, [3, 2, 1])).toBe(round2(10 * odd.combos[0].price));
    expect(settle(odd, [4, 3, 1])).toBe(0);
    const high = buildBet('HILO', [], { stake: 1, field, side: 'High' });
    expect(settle(high, [6, 1, 2])).toBeGreaterThan(0);
    expect(settle(high, [5, 6, 7])).toBe(0);   // 1–5 is Low in a ten-runner field
    expect(liveState(odd, [2, 1, 4, 3, 5, 6, 7, 8, 9, 10])).toBe('close');
  });

  it('keeps max return exact with head to head bets', () => {
    const a = bet('H2H', [[1], [2]], false, 10), b = bet('H2H', [[2], [1]], false, 10);
    expect(maxReturn([a, b], horses), 'opposite sides never both pay').toBe(Math.max(settle(a, [1, 2]), settle(b, [2, 1])));
    const c = bet('H2H', [[3], [4]], false, 10);
    expect(maxReturn([a, c], horses)).toBe(round2(settle(a, [1, 2]) + settle(c, [3, 4])));
    // Win on 2 + H2H 1 over 2 can't both land
    const w2 = bet('WIN', [[2]], false, 10);
    expect(maxReturn([w2, a], horses)).toBe(Math.max(settle(w2, [2]), settle(a, [1, 2])));
    // Head to head is decided behind the podium too: 9 wins, and 1 can still beat 2 in 4th/5th
    const w9 = bet('WIN', [[9]], false, 10);
    expect(maxReturn([w9, a], horses)).toBe(round2(settle(w9, [9]) + settle(a, [1, 2])));
    expect(liveState(a, [5, 6, 7, 8, 2, 1, 3, 4, 9, 10]), 'one overtake anywhere in the field').toBe('close');
  });
});

// ---------- Virtual runners (Summerset Park: 8 dogs on 6-dog footage) ----------
describe('virtual runners', () => {
  it('join the video race coherently', () => {
    const base = race('d02');
    for (let seed = 1; seed <= 300; seed++) {
      const f = buildField(8, mulberry(seed), 'dogs');
      const r = withVirtualRunners(base, f, mulberry(seed * 7919));
      expect(r.runners).toBe(8);
      expect(r.virtual).toEqual([7, 8]);
      expect([...r.result].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(r.result.filter(h => h <= 6), `seed ${seed}: video dogs keep their finish order`).toEqual(base.result);
      expect(r.orderEvents.at(-1)!.order, `seed ${seed}: last running order is the result`).toEqual(r.result);
      expect(r.orderEvents.at(-1)!.f).toBeLessThanOrEqual(r.finishFrame);
      for (const e of r.orderEvents) expect(new Set(e.order).size, `seed ${seed} @${e.f}: duplicate runner`).toBe(8);
      expect(r.orderEvents.every((e, i, a) => i === 0 || a[i - 1].f < e.f), 'events in frame order').toBe(true);
    }
    const six = buildField(6, mulberry(1), 'dogs');
    expect(withVirtualRunners(base, six), 'six-dog fields use the video as is').toBe(base);
    expect(mergeOrder([4, 1, 6, 2, 5, 3], { 7: 0, 8: 5 })).toEqual([7, 4, 1, 6, 2, 8, 5, 3]);
  });

  it('finish where their price says (Harville)', () => {
    const f = buildField(8, mulberry(42), 'dogs');
    const p = winProbs(f.win);
    const rnd = mulberry(99);
    const N = 20000;
    let wins7 = 0, wins8 = 0;
    for (let i = 0; i < N; i++) {
      const order = sampleFinish(f.horses, p, rnd);
      if (order[0] === 7) wins7++;
      if (order[0] === 8) wins8++;
    }
    expect(Math.abs(wins7 / N - p[7]), `trap 7 wins ${wins7 / N} vs ${p[7]}`).toBeLessThan(0.01);
    expect(Math.abs(wins8 / N - p[8]), `trap 8 wins ${wins8 / N} vs ${p[8]}`).toBeLessThan(0.01);
  });
});

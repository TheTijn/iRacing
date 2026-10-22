// node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  expandCombos, pickError, buildBet, settle, betCost, maxReturn, liveState, winProbs,
  comboProbability, exoticPrice, formatOdds, toAmerican, toFractional, placesFor, EXOTICS,
  h2hPairs, aheadProb, winnerSets, MATCH_BOOK, SET_SIDES, round2,
} from '../public/js/pricing.js';
import { SPORTS, GAMES, gameRaces } from '../public/js/sports.js';
import { buildField } from '../public/js/field.js';
import { withVirtualRunners, sampleFinish, mergeOrder } from '../public/js/virtual.js';

const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const PROFILES = SPORTS.horses.profiles;

const horses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const field = {
  horses,
  win: Object.fromEntries(horses.map((h, i) => [h, PROFILES[i].win])),
  place: Object.fromEntries(horses.map((h, i) => [h, PROFILES[i].place])),
};
const races = JSON.parse(readFileSync(new URL('../public/data/races.json', import.meta.url))).races;
const bet = (type, legs, box = false, stake = 1) => buildBet(type, legs, { stake, box, field });

test('combination counts', () => {
  const s = [1, 2, 3, 4];
  assert.equal(expandCombos('EXACTA', [s], true).length, 12);      // n(n-1)
  assert.equal(expandCombos('TRIFECTA', [s], true).length, 24);    // n(n-1)(n-2)
  assert.equal(expandCombos('TRIFECTA', [horses], true).length, 720);
  assert.equal(expandCombos('QUINELLA', [s]).length, 6);           // C(n,2)
  assert.equal(expandCombos('SWINGER', [s]).length, 6);
  assert.equal(expandCombos('TRIO', [s]).length, 4);               // C(n,3)
  assert.equal(expandCombos('EXACTA', [[1], [2, 3, 4]]).length, 3);
  assert.equal(expandCombos('EXACTA', [[1, 2], [1, 2]]).length, 2); // no self pairs
  assert.equal(expandCombos('TRIFECTA', [[1], [2, 3], [2, 3, 4]]).length, 4);
  assert.equal(expandCombos('EXACTA', [[1], []]).length, 0);
  assert.equal(expandCombos('WIN', [[4]]).length, 1);
});

test('pick validation', () => {
  assert.equal(pickError('EXACTA', [[1], []]), 'Pick a horse for 2nd');
  assert.equal(pickError('EXACTA', [[1], [1]]), 'Pick different horses for each position');
  assert.equal(pickError('EXACTA', [[1], [2]]), null);
  assert.equal(pickError('TRIO', [[1, 2]]), 'Pick 1 more horse');
  assert.equal(pickError('TRIFECTA', [[1]], true), 'Pick 2 more horses');
  assert.equal(pickError('SWINGER', [[3, 9]]), null);
});

test('race data is sane', () => {
  assert.equal(races.filter(r => r.sport === 'horses').length, 5);
  assert.ok(races.filter(r => r.sport === 'dogs').length >= 2);
  for (const r of races) {
    assert.ok(SPORTS[r.sport], `${r.id}: unknown sport ${r.sport}`);
    assert.ok(r.venue, `${r.id}: venue`);
    assert.equal(r.result.length, r.runners);
    assert.deepEqual(r.orderEvents.at(-1).order, r.result);
    assert.ok(r.finishFrame > r.gateEndFrame);
  }
});

test('settlement against video 190 podium 1-2-6', () => {
  const podium = races.find(r => r.id === '190').result;
  assert.deepEqual(podium.slice(0, 3), [1, 2, 6]);
  const win1 = bet('WIN', [[1]], false, 10);
  assert.equal(settle(win1, podium), 37.8);
  assert.equal(settle(bet('WIN', [[2]]), podium), 0);
  assert.equal(settle(bet('PLACE', [[6]], false, 2), podium), 2 * field.place[6]);
  assert.equal(settle(bet('PLACE', [[9]]), podium), 0);
  assert.ok(settle(bet('EXACTA', [[1], [2]]), podium) > 0);
  assert.equal(settle(bet('EXACTA', [[2], [1]]), podium), 0);
  assert.ok(settle(bet('EXACTA', [[1, 2]], true), podium) > 0);
  assert.ok(settle(bet('TRIFECTA', [[1], [2], [6]]), podium) > 0);
  assert.equal(settle(bet('TRIFECTA', [[1], [6], [2]]), podium), 0);
  assert.ok(settle(bet('QUINELLA', [[2, 1]]), podium) > 0);
  assert.equal(settle(bet('QUINELLA', [[1, 6]]), podium), 0);
  assert.ok(settle(bet('TRIO', [[6, 2, 1]]), podium) > 0);
  assert.equal(settle(bet('TRIO', [[6, 2, 3]]), podium), 0);

  const sw = bet('SWINGER', [[1, 6, 9]]);           // pairs 1-6 ✓, 1-9 ✗, 6-9 ✗
  const p16 = sw.combos.find(c => c.sel.join() === '1,6').price;
  assert.equal(settle(sw, podium), p16);
  const sw3 = bet('SWINGER', [[1, 2, 6]]);          // all three pairs win
  assert.equal(settle(sw3, podium), Math.round(sw3.combos.reduce((s, c) => s + c.price, 0) * 100) / 100);
});

test('every game has races; dog games are one venue each', () => {
  for (const g of Object.values(GAMES)) {
    const rs = gameRaces(g, races);
    assert.ok(rs.length, `${g.key}: no races`);
    if (g.runners) assert.ok(rs.every(r => r.runners <= g.runners), `${g.key}: video field larger than the game`);
  }
  assert.deepEqual(gameRaces(GAMES.crawford, races).map(r => r.id), ['d01']);
  assert.deepEqual(gameRaces(GAMES.summerset, races).map(r => r.id), ['d02', 's123', 's124', 's125', 's126']);
  assert.ok(SPORTS.dogs.colours[7] && SPORTS.dogs.colours[8], 'trap jackets for 7 and 8');
});

test('greyhound results match the finish shown in the videos', () => {
  assert.deepEqual(races.find(r => r.id === 'd01').result, [2, 3, 4, 6, 1, 5]);
  assert.deepEqual(races.find(r => r.id === 'd02').result, [4, 1, 6, 2, 5, 3]);
  for (const r of races.filter(x => /^d\d/.test(x.id))) {
    assert.equal(r.runners, 6);
    assert.equal(r.distance, 720);
    assert.ok(r.replayStart > r.finishFrame && r.replayEnd > r.replayStart, `${r.id}: replay window`);
  }
  // Summerset Park 8-dog footage (360m, no replay). The file names are not the finish order (1-2-4 finishes 1-2-3).
  assert.deepEqual(races.find(r => r.id === 's123').result, [1, 2, 3, 6, 5, 4, 8, 7]);
  assert.deepEqual(races.find(r => r.id === 's124').result, [1, 2, 3, 4, 6, 5, 7, 8]);
  assert.deepEqual(races.find(r => r.id === 's125').result, [1, 5, 3, 6, 2, 7, 4, 8]);
  assert.deepEqual(races.find(r => r.id === 's126').result, [1, 6, 3, 2, 5, 7, 4, 8]);
  for (const r of races.filter(x => /^s\d/.test(x.id))) {
    assert.equal(r.runners, 8);
    assert.equal(r.distance, 360);
    assert.equal(r.replayStart, null);
  }
});

test('settlement against every video podium', () => {
  for (const r of races) {
    const [a, b, c] = r.result;
    assert.ok(settle(bet('WIN', [[a]]), r.result) > 0, r.id);
    for (const h of [a, b, c]) assert.ok(settle(bet('PLACE', [[h]]), r.result) > 0, r.id);
    assert.equal(settle(bet('PLACE', [[r.result[3]]]), r.result), 0, r.id);
    assert.ok(settle(bet('TRIFECTA', [[a], [b], [c]]), r.result) > 0, r.id);
    assert.ok(settle(bet('TRIO', [[c, a, b]]), r.result) > 0, r.id);
  }
});

test('ticket cost is unit × combos', () => {
  assert.equal(betCost(bet('TRIFECTA', [[1, 2, 3, 4]], true, 0.5)), 12);
  assert.equal(betCost(bet('QUINELLA', [[1, 2, 3]], false, 2)), 6);
});

test('harville probabilities are consistent', () => {
  const p = winProbs(field.win);
  assert.ok(Math.abs(Object.values(p).reduce((s, x) => s + x, 0) - 1) < 1e-9);
  // Sum of all exacta probabilities = 1; all trifectas = 1
  const ex = expandCombos('EXACTA', [horses], true).reduce((s, c) => s + comboProbability('EXACTA', c, p), 0);
  const tri = expandCombos('TRIFECTA', [horses], true).reduce((s, c) => s + comboProbability('TRIFECTA', c, p), 0);
  assert.ok(Math.abs(ex - 1) < 1e-9 && Math.abs(tri - 1) < 1e-9);
  // Swinger pair probabilities sum to 3 (each podium contains 3 pairs)
  const sw = expandCombos('SWINGER', [horses]).reduce((s, c) => s + comboProbability('SWINGER', c, p, horses), 0);
  assert.ok(Math.abs(sw - 3) < 1e-9);
  // Favourite exacta priced shorter than the reverse; caps respected
  assert.ok(exoticPrice('EXACTA', [1, 2], p, horses) < exoticPrice('EXACTA', [2, 1], p, horses));
  assert.ok(exoticPrice('TRIFECTA', [10, 9, 8], p, horses) <= 5000);
  assert.ok(exoticPrice('SWINGER', [1, 2], p, horses) >= 1.01);
});

test('max return is exact, not a naive sum', () => {
  const w1 = bet('WIN', [[1]], false, 10);   // 37.80
  const w2 = bet('WIN', [[2]], false, 10);   // 58.40
  assert.equal(maxReturn([w1, w2], horses), 58.4);
  const p1 = bet('PLACE', [[1]], false, 10);
  assert.equal(maxReturn([w1, p1], horses), 59.2);
  assert.equal(maxReturn([], horses), 0);
});

test('live state', () => {
  const order = [3, 1, 2, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(liveState(bet('WIN', [[3]]), order), 'winning');
  assert.equal(liveState(bet('WIN', [[1]]), order), 'close');
  assert.equal(liveState(bet('WIN', [[2]]), order), 'out');
  assert.equal(liveState(bet('PLACE', [[4]]), order), 'close');
  assert.equal(liveState(bet('PLACE', [[5]]), order), 'out');
  assert.equal(liveState(bet('EXACTA', [[1], [3]]), order), 'close');
});

test('odds formats', () => {
  assert.equal(formatOdds(3.78), '3.78');
  assert.equal(toAmerican(3.78), '+278');
  assert.equal(toAmerican(2), '+100');
  assert.equal(toAmerican(1.5), '-200');
  assert.equal(toFractional(3.75), '11/4');
  assert.equal(toFractional(2.0), '1/1');
  assert.equal(toFractional(1.5), '1/2');
  assert.equal(toFractional(11), '10/1');
});

test('places by field size', () => {
  assert.equal(placesFor(10), 3);
  assert.equal(placesFor(6), 2);
});

test('every exotic type builds and settles', () => {
  const podium = [4, 3, 5, 2, 1, 9, 7, 10, 8, 6];
  for (const t of EXOTICS) {
    const b = bet(t, [[4, 3, 5]], true);
    assert.ok(b.combos.length > 0, t);
    assert.ok(settle(b, podium) > 0, t);
  }
});

test('six-runner (greyhound) Place pays the top 2 only', () => {
  const field = { horses: [1, 2, 3, 4, 5, 6], win: { 1: 3, 2: 4, 3: 5, 4: 7, 5: 9, 6: 12 }, place: { 1: 1.6, 2: 1.9, 3: 2.2, 4: 2.8, 5: 3.4, 6: 4 } };
  const places = placesFor(6);
  assert.equal(places, 2);
  const order = [4, 1, 6, 2, 5, 3];
  assert.equal(settle(buildBet('PLACE', [[1]], { stake: 10, field }), order, places), 16);
  assert.equal(settle(buildBet('PLACE', [[6]], { stake: 10, field }), order, places), 0);
  // Reverse Forecast = boxed Exacta: two combos, one pays
  const rf = buildBet('EXACTA', [[1, 4]], { stake: 1, box: true, field });
  assert.equal(rf.combos.length, 2);
  assert.ok(settle(rf, order, places) > 0);
});

// ---------- Head to Head tab ----------
test('head to head: matchups, prices and settlement', () => {
  assert.deepEqual(h2hPairs(field), [[1, 2], [2, 3], [3, 4]]);   // F1 v F2, F2 v F3, F3 v F4
  const p = winProbs(field.win);
  for (const [a, b] of h2hPairs(field)) {
    assert.ok(Math.abs(aheadProb(a, b, p) + aheadProb(b, a, p) - 1) < 1e-12);
    const book = 1 / bet('H2H', [[a], [b]]).combos[0].price + 1 / bet('H2H', [[b], [a]]).combos[0].price;
    assert.ok(Math.abs(book - MATCH_BOOK) < 0.01, `${a} v ${b}: book ${book}`);
    assert.ok(bet('H2H', [[a], [b]]).combos[0].price < bet('H2H', [[b], [a]]).combos[0].price, 'favourite is shorter');
  }
  const order = [5, 3, 1, 9, 2, 4, 6, 7, 8, 10];
  assert.ok(settle(bet('H2H', [[1], [2]], false, 10), order) > 10);   // 1 is 3rd, 2 is 5th
  assert.equal(settle(bet('H2H', [[2], [1]]), order), 0);
  assert.ok(settle(bet('H2H', [[2], [4]]), order) > 0, 'both outside the podium');
  // A partial order: the runner missing from it finished behind
  assert.ok(settle(bet('H2H', [[1], [2]]), [5, 3, 1]) > 0);
  assert.equal(settle(bet('H2H', [[2], [4]]), [5, 3, 1]), 0);
});

test('odd/even and high/low on the winning number', () => {
  assert.deepEqual(winnerSets([1, 2, 3, 4, 5, 6]), { Odd: [1, 3, 5], Even: [2, 4, 6], Low: [1, 2, 3], High: [4, 5, 6] });
  assert.deepEqual(winnerSets([1, 2, 3, 4, 5, 6, 7, 8]).High, [5, 6, 7, 8]);
  for (const [type, [x, y]] of Object.entries(SET_SIDES)) {
    const bx = buildBet(type, [], { stake: 1, field, side: x });
    const by = buildBet(type, [], { stake: 1, field, side: y });
    assert.equal(bx.side, x);
    assert.ok(Math.abs(1 / bx.combos[0].price + 1 / by.combos[0].price - MATCH_BOOK) < 0.01, type);
    assert.deepEqual([...bx.legs[0], ...by.legs[0]].sort((a, b) => a - b), horses, `${type} covers the field once`);
  }
  const odd = buildBet('ODDEVEN', [], { stake: 10, field, side: 'Odd' });
  assert.equal(settle(odd, [3, 2, 1]), round2(10 * odd.combos[0].price));
  assert.equal(settle(odd, [4, 3, 1]), 0);
  const high = buildBet('HILO', [], { stake: 1, field, side: 'High' });
  assert.ok(settle(high, [6, 1, 2]) > 0);
  assert.equal(settle(high, [5, 6, 7]), 0);   // 1–5 is Low in a ten-runner field
  assert.equal(liveState(odd, [2, 1, 4, 3, 5, 6, 7, 8, 9, 10]), 'close');
});

test('max return with head to head bets is exact', () => {
  const a = bet('H2H', [[1], [2]], false, 10), b = bet('H2H', [[2], [1]], false, 10);
  assert.equal(maxReturn([a, b], horses), Math.max(settle(a, [1, 2]), settle(b, [2, 1])), 'opposite sides never both pay');
  const c = bet('H2H', [[3], [4]], false, 10);
  assert.equal(maxReturn([a, c], horses), round2(settle(a, [1, 2]) + settle(c, [3, 4])));
  // Win on 2 + H2H 1 over 2 can't both land
  const w2 = bet('WIN', [[2]], false, 10);
  assert.equal(maxReturn([w2, a], horses), Math.max(settle(w2, [2]), settle(a, [1, 2])));
  // Head to head is decided behind the podium too: 9 wins, and 1 can still beat 2 in 4th/5th
  const w9 = bet('WIN', [[9]], false, 10);
  assert.equal(maxReturn([w9, a], horses), round2(settle(w9, [9]) + settle(a, [1, 2])));
  assert.equal(liveState(a, [5, 6, 7, 8, 2, 1, 3, 4, 9, 10]), 'close', 'one overtake anywhere in the field');
});

// ---------- Virtual runners (Summerset Park: 8 dogs on 6-dog footage) ----------
test('virtual runners join the video race coherently', () => {
  const base = races.find(r => r.id === 'd02');
  for (let seed = 1; seed <= 300; seed++) {
    const f = buildField(8, mulberry(seed), 'dogs');
    const r = withVirtualRunners(base, f, mulberry(seed * 7919));
    assert.equal(r.runners, 8);
    assert.deepEqual(r.virtual, [7, 8]);
    assert.deepEqual([...r.result].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(r.result.filter(h => h <= 6), base.result, `seed ${seed}: video dogs keep their finish order`);
    assert.deepEqual(r.orderEvents.at(-1).order, r.result, `seed ${seed}: last running order is the result`);
    assert.ok(r.orderEvents.at(-1).f <= r.finishFrame);
    for (const e of r.orderEvents) assert.equal(new Set(e.order).size, 8, `seed ${seed} @${e.f}: duplicate runner`);
    assert.ok(r.orderEvents.every((e, i, a) => i === 0 || a[i - 1].f < e.f), 'events in frame order');
  }
  const six = buildField(6, mulberry(1), 'dogs');
  assert.equal(withVirtualRunners(base, six), base, 'six-dog fields use the video as is');
  assert.deepEqual(mergeOrder([4, 1, 6, 2, 5, 3], { 7: 0, 8: 5 }), [7, 4, 1, 6, 2, 8, 5, 3]);
});

test('virtual runners finish where their price says (Harville)', () => {
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
  assert.ok(Math.abs(wins7 / N - p[7]) < 0.01, `trap 7 wins ${wins7 / N} vs ${p[7]}`);
  assert.ok(Math.abs(wins8 / N - p[8]) < 0.01, `trap 8 wins ${wins8 / N} vs ${p[8]}`);
});

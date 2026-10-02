// node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  expandCombos, pickError, buildBet, settle, betCost, maxReturn, liveState, winProbs,
  comboProbability, exoticPrice, formatOdds, toAmerican, toFractional, placesFor, EXOTICS,
} from '../public/js/pricing.js';
import { SPORTS } from '../public/js/sports.js';
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

test('greyhound results match the finish shown in the videos', () => {
  assert.deepEqual(races.find(r => r.id === 'd01').result, [2, 3, 4, 6, 1, 5]);
  assert.deepEqual(races.find(r => r.id === 'd02').result, [4, 1, 6, 2, 5, 3]);
  for (const r of races.filter(x => x.sport === 'dogs')) {
    assert.equal(r.runners, 6);
    assert.equal(r.distance, 720);
    assert.ok(r.replayStart > r.finishFrame && r.replayEnd > r.replayStart, `${r.id}: replay window`);
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

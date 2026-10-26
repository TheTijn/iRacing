// Virtual runners: a game can field more runners than its video shows (Summerset Park runs eight dogs on
// six-dog footage). Pure (no Angular, no DOM): used by the app and the unit tests.
//
// Each extra runner gets
//   - a finishing place drawn from its price: a whole finish is sampled from the win probabilities with
//     Harville (the model behind every price on the card) and the extra runner keeps the place it got
//     there, so its odds stay honest. The video's runners keep their order relative to each other.
//   - a path through the field: a few moves after the break that home in on that place well before the
//     line, merged into the video's running order so the strip, live bets and callouts just work.
import { winProbs } from './pricing';
import type { ByRunner, Field, OrderEvent, Race } from './models';

const SETTLE_AT = 0.82;   // share of the race after which virtual runners hold their final place
const MAX_STEP = 2;       // places a virtual runner gains or loses per move (except at the break)

/** One finish order sampled from win probabilities, Harville-style (winner, then 2nd from the rest, …). */
export function sampleFinish(horses: number[], p: ByRunner<number>, rnd = Math.random): number[] {
  const left = horses.slice();
  const out: number[] = [];
  while (left.length) {
    let x = rnd() * left.reduce((s, h) => s + p[h], 0);
    let i = 0;
    for (; i < left.length - 1; i++) { x -= p[left[i]]; if (x <= 0) break; }
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/** The video's running order with virtual runners slotted in. slots: { runner: index in the full order }. */
export function mergeOrder(realOrder: number[], slots: ByRunner<number>): number[] {
  const at = new Map(Object.entries(slots).map(([h, i]): [number, number] => [i, +h]));
  const out: number[] = [];
  for (let i = 0, r = 0; i < realOrder.length + at.size; i++) out.push(at.has(i) ? at.get(i)! : realOrder[r++]);
  return out;
}

// Nearest free index to `want` (ties go towards the back), so two virtual runners never share a place.
function freeSlot(want: number, used: Set<number>, total: number): number {
  for (let d = 0; d < total; d++) {
    for (const i of [want + d, want - d]) if (i >= 0 && i < total && !used.has(i)) return i;
  }
  return want;
}

/**
 * The race with the field's extra runners (numbers above the video's field) added: runner count, result
 * and running order cover the whole field. Returns the race unchanged when the field fits the video.
 */
export function withVirtualRunners(race: Race, field: Pick<Field, 'horses' | 'win'>, rnd = Math.random): Race {
  const extra = field.horses.filter(h => h > race.runners);
  if (!extra.length) return race;
  const total = field.horses.length;
  const finish = sampleFinish(field.horses, winProbs(field.win), rnd);
  const final: ByRunner<number> = Object.fromEntries(extra.map(h => [h, finish.indexOf(h)]));

  // Keyframes of virtual places: at the back in trap order while in the traps, a random place out of the
  // break, then moves every 2–4.5s that close in on the final place, which they hold from SETTLE_AT on.
  const { gateEndFrame: jump, finishFrame: end, fps } = race;
  const settleF = Math.round(jump + (end - jump) * SETTLE_AT);
  let cur: ByRunner<number> = Object.fromEntries(extra.map((h, i) => [h, total - extra.length + i]));
  const keys: { f: number; slots: ByRunner<number> }[] = [{ f: 0, slots: cur }];
  let first = true;
  for (let f = jump + Math.round(fps * (0.8 + rnd())); f < settleF; f += Math.round(fps * (2 + rnd() * 2.5))) {
    const progress = (f - jump) / (settleF - jump);
    const used = new Set<number>();
    const next: ByRunner<number> = {};
    for (const h of extra) {
      let want: number;
      if (first) want = Math.floor(rnd() * total);
      else {
        const pull = (final[h] - cur[h]) * (0.3 + 0.7 * progress);
        const noise = (rnd() * 3 - 1.5) * (1 - progress);
        const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, Math.round(pull + noise)));
        want = Math.max(0, Math.min(total - 1, cur[h] + step));
      }
      next[h] = freeSlot(want, used, total);
      used.add(next[h]);
    }
    keys.push({ f, slots: next });
    cur = next;
    first = false;
  }
  keys.push({ f: settleF, slots: final });

  // Running order: every frame where the video's order or a virtual place changes.
  const realEv = race.orderEvents;
  const frames = [...new Set([...realEv.map(e => e.f), ...keys.map(k => k.f)])].sort((a, b) => a - b);
  const orderEvents: OrderEvent[] = [];
  let ri = 0, ki = 0, prev = '';
  for (const f of frames) {
    while (ri + 1 < realEv.length && realEv[ri + 1].f <= f) ri++;
    while (ki + 1 < keys.length && keys[ki + 1].f <= f) ki++;
    const order = mergeOrder(realEv[ri].order, keys[ki].slots);
    const key = order.join();
    if (key !== prev) { orderEvents.push({ f, order }); prev = key; }
  }
  return { ...race, runners: total, result: mergeOrder(race.result, final), orderEvents, virtual: extra };
}

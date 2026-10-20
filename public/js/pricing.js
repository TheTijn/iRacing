// Pure pricing / combination / settlement engine. No DOM — imported by the app and by node tests.
//
// Every bet is normalised to the same shape so one settle() covers all markets:
//   { type, stake, box, legs: [[horse...], ...], combos: [{ sel: [horse...], price }] }
// (+ `side` on Odd/Even and High/Low bets: which half of the field the winner must come from).
// `stake` is per combination; ticket cost = stake × combos.length.

export const BET_TYPES = {
  WIN:      { label: 'Win',      ordered: true,  size: 1, cap: Infinity },
  PLACE:    { label: 'Place',    ordered: false, size: 1, cap: Infinity },
  EXACTA:   { label: 'Exacta',   ordered: true,  size: 2, cap: 500, boxable: true },
  TRIFECTA: { label: 'Trifecta', ordered: true,  size: 3, cap: 5000, boxable: true },
  QUINELLA: { label: 'Quinella', ordered: false, size: 2, cap: 250 },
  TRIO:     { label: 'Trio',     ordered: false, size: 3, cap: 1000 },
  SWINGER:  { label: 'Swinger',  ordered: false, size: 2, cap: 150 },
  // Head to Head tab. H2H: sel [a, b] = a finishes ahead of b. ODDEVEN / HILO: sel = the set of numbers the
  // winner must come from (bet.side names it: Odd, Even, High, Low).
  H2H:      { label: 'Head to Head', ordered: true,  size: 2, cap: Infinity, pair: true },
  ODDEVEN:  { label: 'Odd/Even',     ordered: false, size: 1, cap: Infinity, set: true },
  HILO:     { label: 'High/Low',     ordered: false, size: 1, cap: Infinity, set: true },
};
export const EXOTICS = ['EXACTA', 'TRIFECTA', 'QUINELLA', 'TRIO', 'SWINGER'];
export const EXOTIC_MARGIN = 0.2;
export const MATCH_BOOK = 1.11;   // two-way markets (head to head, odd/even, high/low): ~11% book, as on the reference card
export const SET_SIDES = { ODDEVEN: ['Odd', 'Even'], HILO: ['High', 'Low'] };

export const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

/** Number of paying places for a field size (UK/EU convention). */
export function placesFor(runners) {
  if (runners >= 8) return 3;
  if (runners >= 5) return 2;
  return 1;
}

/** Normalised win probabilities from decimal win odds: { horse: odds } → { horse: p }. */
export function winProbs(winOdds) {
  const implied = Object.entries(winOdds).map(([h, o]) => [h, 1 / o]);
  const book = implied.reduce((s, [, p]) => s + p, 0);
  return Object.fromEntries(implied.map(([h, p]) => [h, p / book]));
}

// Harville ordered-finish probability for a sequence of horses finishing 1st, 2nd, 3rd…
function harville(seq, p) {
  let prob = 1, used = 0;
  for (const h of seq) {
    prob *= p[h] / (1 - used);
    used += p[h];
  }
  return prob;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(r => [x, ...r]));
}

/** Probability that a single combination of an exotic bet type wins. */
export function comboProbability(type, sel, p, allHorses) {
  switch (type) {
    case 'EXACTA':
    case 'TRIFECTA': return harville(sel, p);
    case 'QUINELLA':
    case 'TRIO': return permutations(sel).reduce((s, perm) => s + harville(perm, p), 0);
    case 'SWINGER': {
      const [a, b] = sel;
      return allHorses
        .filter(k => k != a && k != b)
        .reduce((s, k) => s + comboProbability('TRIO', [a, b, k], p), 0);
    }
    default: throw new Error(`No exotic probability for ${type}`);
  }
}

/** P(a finishes ahead of b). Exact under Harville (Plackett–Luce): only the two runners' strengths matter. */
export const aheadProb = (a, b, p) => p[a] / (p[a] + p[b]);

/** Decimal price for a two-way market outcome of probability `prob`. */
export const matchPrice = prob => round2(Math.max(1.01, 1 / (prob * MATCH_BOOK)));

/** Runner numbers per winner market: Odd / Even, and Low (bottom half) / High (top half) of the field. */
export function winnerSets(horses) {
  const nos = horses.slice().sort((a, b) => a - b);
  const half = Math.floor(nos.length / 2);
  return { Odd: nos.filter(h => h % 2), Even: nos.filter(h => !(h % 2)), Low: nos.slice(0, half), High: nos.slice(half) };
}

/** Head to head matchups: favourite v 2nd favourite, 2nd v 3rd, 3rd v 4th (F1 v F2, F2 v F3, F3 v F4). */
export function h2hPairs(field, count = 3) {
  const ranked = field.byOdds || field.horses.slice().sort((a, b) => field.win[a] - field.win[b] || a - b);
  return ranked.slice(0, count + 1).map((h, i, a) => [h, a[i + 1]]).slice(0, Math.min(count, ranked.length - 1));
}

/** Fixed decimal price for one exotic combination. */
export function exoticPrice(type, sel, p, allHorses) {
  const prob = comboProbability(type, sel, p, allHorses);
  const price = (1 - EXOTIC_MARGIN) / prob;
  return round2(Math.min(Math.max(price, 1.01), BET_TYPES[type].cap));
}

const uniq = a => [...new Set(a)];

/**
 * Expand pick legs into concrete selections.
 * Ordered, not boxed: legs = [set1st, set2nd(, set3rd)] → cartesian product without repeats.
 * Boxed ordered bets / any-order bets: legs = [set] → permutations or combinations of `size`.
 */
export function expandCombos(type, legs, box = false) {
  const { ordered, size } = BET_TYPES[type];
  if (size === 1) return uniq(legs[0] || []).map(h => [h]);

  if (ordered && !box) {
    if (legs.length < size || legs.slice(0, size).some(l => !l || !l.length)) return [];
    let out = [[]];
    for (let i = 0; i < size; i++) {
      out = out.flatMap(prefix => uniq(legs[i]).filter(h => !prefix.includes(h)).map(h => [...prefix, h]));
    }
    return out;
  }

  const set = uniq(legs[0] || []).sort((a, b) => a - b);
  const choose = (start, k) => {
    if (k === 0) return [[]];
    const res = [];
    for (let i = start; i <= set.length - k; i++) {
      for (const rest of choose(i + 1, k - 1)) res.push([set[i], ...rest]);
    }
    return res;
  };
  const combos = choose(0, size);
  return ordered ? combos.flatMap(permutations) : combos;
}

/** Why a set of picks can't form a bet yet (null when valid). */
export function pickError(type, legs, box = false, noun = 'horse') {
  const { ordered, size } = BET_TYPES[type];
  const pos = ['1st', '2nd', '3rd'];
  if (ordered && !box && size > 1) {
    for (let i = 0; i < size; i++) if (!legs[i] || !legs[i].length) return `Pick a ${noun} for ${pos[i]}`;
    if (!expandCombos(type, legs, box).length) return `Pick different ${noun}s for each position`;
    return null;
  }
  const n = uniq(legs[0] || []).length;
  if (n < size) return `Pick ${size - n} more ${noun}${size - n > 1 ? 's' : ''}`;
  return null;
}

/**
 * Build a normalised bet.
 * field: { horses: [no...], win: {no: odds}, place: {no: odds} }
 */
export function buildBet(type, legs, { stake, box = false, field, side }) {
  let combos;
  if (BET_TYPES[type].set) {
    const sel = winnerSets(field.horses)[side];
    const p = winProbs(field.win);
    combos = [{ sel, price: matchPrice(sel.reduce((s, h) => s + p[h], 0)) }];
    return { type, stake, box: false, side, legs: [sel.slice()], combos };
  }
  if (type === 'H2H') {
    const sel = [legs[0][0], legs[1][0]];
    combos = [{ sel, price: matchPrice(aheadProb(sel[0], sel[1], winProbs(field.win))) }];
  } else if (type === 'WIN' || type === 'PLACE') {
    const h = legs[0][0];
    combos = [{ sel: [h], price: (type === 'WIN' ? field.win : field.place)[h] }];
  } else {
    const p = winProbs(field.win);
    combos = expandCombos(type, legs, box).map(sel => ({ sel, price: exoticPrice(type, sel, p, field.horses) }));
  }
  return { type, stake, box: !!box, legs: legs.map(l => l.slice()), combos };
}

export const betCost = bet => round2(bet.stake * bet.combos.length);

/** Does one combination win on a finish order (podium = [1st, 2nd, 3rd, …])? */
export function comboWins(type, sel, podium, places = 3) {
  const top = n => podium.slice(0, n);
  switch (type) {
    case 'H2H': {   // a runner missing from a partial order finished behind everyone listed
      const ia = podium.findIndex(h => h == sel[0]), ib = podium.findIndex(h => h == sel[1]);
      return ia >= 0 && (ib < 0 || ia < ib);
    }
    case 'ODDEVEN':
    case 'HILO': return sel.some(h => h == podium[0]);
    case 'WIN': return podium[0] == sel[0];
    case 'PLACE': return top(places).some(h => h == sel[0]);
    case 'EXACTA': return podium[0] == sel[0] && podium[1] == sel[1];
    case 'TRIFECTA': return podium[0] == sel[0] && podium[1] == sel[1] && podium[2] == sel[2];
    case 'QUINELLA': return sel.every(h => top(2).some(x => x == h));
    case 'TRIO': return sel.every(h => top(3).some(x => x == h));
    case 'SWINGER': return sel.every(h => top(3).some(x => x == h));
    default: return false;
  }
}

/** Total return (stake included) of a bet for a finish order. */
export function settle(bet, podium, places = 3) {
  let ret = 0;
  for (const c of bet.combos) if (comboWins(bet.type, c.sel, podium, places)) ret += bet.stake * c.price;
  return round2(ret);
}

/** Winning combos of a bet (for highlighting). */
export const winningCombos = (bet, podium, places = 3) =>
  bet.combos.filter(c => comboWins(bet.type, c.sel, podium, places));

/**
 * Exact best-case return of a whole slip: max over every possible finish of the sum of all bets.
 * Honest — two Win bets on different horses can never both pay.
 * Every market but Head to Head depends only on the 1-2-3, so it enumerates podiums; head to head bets
 * also depend on the order behind the podium, so for each podium it tries every order of the other
 * runners they name (at most a handful: matchups only use the four favourites).
 */
export function maxReturn(bets, horses, places = 3) {
  if (!bets.length) return 0;
  const pairBets = bets.filter(b => BET_TYPES[b.type].pair);
  const podiumBets = bets.filter(b => !BET_TYPES[b.type].pair);
  const pairRunners = [...new Set(pairBets.flatMap(b => b.combos.flatMap(c => c.sel)))];
  let best = 0;
  const podium = [0, 0, 0];
  for (const a of horses) for (const b of horses) {
    if (b == a) continue;
    for (const c of horses) {
      if (c == a || c == b) continue;
      podium[0] = a; podium[1] = b; podium[2] = c;
      let sum = 0;
      for (const bet of podiumBets) sum += settle(bet, podium, places);
      if (pairBets.length) {
        let bestPairs = 0;
        for (const rest of permutations(pairRunners.filter(h => !podium.some(x => x == h)))) {
          const order = [...podium, ...rest];
          let s = 0;
          for (const bet of pairBets) s += settle(bet, order, places);
          if (s > bestPairs) bestPairs = s;
        }
        sum += bestPairs;
      }
      if (sum > best) best = sum;
    }
  }
  return round2(best);
}

/** Max possible return of a single bet (used for "pays up to"). */
export const betMaxReturn = (bet, horses, places = 3) => maxReturn([bet], horses, places);

/**
 * Live state against the current running order:
 *   'winning' – would pay if the race ended now
 *   'close'   – would pay after a single overtake among the first 4 positions
 *   'out'     – otherwise
 */
export function liveState(bet, order, places = 3) {
  if (settle(bet, order, places) > 0) return 'winning';
  // Head to head runners can be anywhere in the field, so any single overtake counts.
  const depth = BET_TYPES[bet.type].pair ? order.length - 1 : Math.min(order.length - 1, places + 1);
  for (let i = 0; i < depth; i++) {
    const o = order.slice();
    [o[i], o[i + 1]] = [o[i + 1], o[i]];
    if (settle(bet, o, places) > 0) return 'close';
  }
  return 'out';
}

// ---------- Odds formatting ----------
const FRACTIONS = [
  [1, 10], [1, 8], [1, 7], [1, 6], [1, 5], [2, 9], [1, 4], [2, 7], [1, 3], [4, 11], [2, 5], [4, 9], [1, 2],
  [8, 15], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [11, 10], [6, 5], [5, 4],
  [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2],
  [4, 1], [9, 2], [5, 1], [11, 2], [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [17, 2], [9, 1], [10, 1],
  [11, 1], [12, 1], [14, 1], [16, 1], [18, 1], [20, 1], [22, 1], [25, 1], [28, 1], [33, 1], [40, 1],
  [50, 1], [66, 1], [80, 1], [100, 1],
];

export function toFractional(dec) {
  const target = dec - 1;
  if (target > 100) return `${Math.round(target)}/1`;
  let best = FRACTIONS[0], diff = Infinity;
  for (const f of FRACTIONS) {
    const d = Math.abs(f[0] / f[1] - target);
    if (d < diff) { diff = d; best = f; }
  }
  return `${best[0]}/${best[1]}`;
}

export function toAmerican(dec) {
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `-${Math.round(100 / (dec - 1))}`;
}

export function formatOdds(dec, fmt = 'decimal') {
  if (fmt === 'american') return toAmerican(dec);
  if (fmt === 'fractional') return toFractional(dec);
  return dec >= 100 ? dec.toFixed(0) : dec.toFixed(2);
}

// Builds a race field: random runner profiles on saddle (or trap) numbers, with prices rescaled so
// every race has a realistic book (a random subset of profiles would otherwise over- or under-round).
import { SPORTS } from './sports.js';
import { placesFor, round2 } from './pricing.js';

export const WIN_BOOK = 1.11;    // ~11% overround, as on the legacy card (12 runners)
export const PLACE_BOOK = 1.11;  // per paying place

function shuffle(a, rnd = Math.random) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function buildField(runnerCount, rnd = Math.random, sport = 'horses') {
  const { profiles: pool, colours } = SPORTS[sport];
  const horses = Array.from({ length: runnerCount }, (_, i) => i + 1);
  // Numbers follow the market: #1 is the favourite, #2 second favourite, and so on (rescaling keeps the order).
  const profiles = shuffle(pool, rnd).slice(0, runnerCount).sort((a, b) => a.win - b.win || a.place - b.place);
  const places = placesFor(runnerCount);

  const winBook = profiles.reduce((s, p) => s + 1 / p.win, 0);
  const placeBook = profiles.reduce((s, p) => s + 1 / p.place, 0);
  const winScale = winBook / WIN_BOOK;
  const placeScale = placeBook / (PLACE_BOOK * places);

  const runners = {}, win = {}, place = {};
  horses.forEach((no, i) => {
    const p = profiles[i];
    const w = Math.max(1.05, round2(p.win * winScale));
    const pl = Math.min(w, Math.max(1.01, round2(p.place * placeScale)));
    runners[no] = { no, name: p.name, form: p.form, rating: p.rating, win: w, place: pl, silk: colours[no] };
    win[no] = w;
    place[no] = pl;
  });
  const favourite = horses.reduce((a, b) => (win[b] < win[a] ? b : a));
  const byOdds = horses.slice().sort((a, b) => win[a] - win[b] || a - b);
  return { sport, horses, runners, win, place, places, favourite, byOdds };
}

// Per-sport game data and wording. Pure (no Angular, no DOM): also used by the unit tests via field.ts.
// Race telemetry (results, running order, venue) lives in public/data/races.json, tagged by `sport`.
import { BET_TYPES, EXOTICS } from './pricing';
import type { BetType, ByRunner, Colours, GameKey, Race, SportKey } from './models';

export interface Profile {
  name: string;
  form: number[];
  rating: number;
  win: number;
  place: number;
}

// Runner profiles. Each profile is kept together (name, form, rating, prices) so the favourite
// always has favourite-like form. Each race assigns a random subset of profiles to saddle/trap
// numbers, so the favourite changes from race to race. Prices are rescaled to a fixed book in field.ts.
const HORSE_PROFILES: Profile[] = [
  { name: 'Comet Jack',        form: [7, 1, 3, 1, 1], rating: 4,   win: 3.78,  place: 2.14 },
  { name: 'Stud Muffin',       form: [2, 3, 1, 0, 0], rating: 3,   win: 5.84,  place: 2.62 },
  { name: 'The Dealer',        form: [0, 1, 6, 0, 6], rating: 3,   win: 6.44,  place: 2.73 },
  { name: 'Captive',           form: [8, 6, 5, 2, 4], rating: 2.5, win: 9.72,  place: 3.26 },
  { name: 'Treble Allowance',  form: [5, 2, 0, 4, 8], rating: 3,   win: 10.32, place: 3.34 },
  { name: 'Pine Cliffs',       form: [8, 3, 0, 2, 0], rating: 2.5, win: 13.99, place: 3.79 },
  { name: 'Silverado',         form: [0, 5, 0, 5, 3], rating: 2.5, win: 16.82, place: 4.10 },
  { name: 'Limerick',          form: [0, 5, 0, 2, 0], rating: 2.5, win: 20.22, place: 4.42 },
  { name: 'Steel Warrior',     form: [6, 6, 0, 7, 8], rating: 2.5, win: 23.14, place: 4.68 },
  { name: 'Byron King',        form: [3, 6, 0, 0, 0], rating: 2,   win: 25.43, place: 4.87 },
  { name: 'Blackjack',         form: [0, 6, 0, 6, 0], rating: 2.5, win: 34.25, place: 5.53 },
  { name: 'Front Runner',      form: [5, 8, 0, 0, 0], rating: 2.5, win: 35.81, place: 5.64 },
];

// Greyhound form only goes 1–6 (six-dog fields).
const DOG_PROFILES: Profile[] = [
  { name: 'Swift Rebel',       form: [1, 2, 1, 3, 1], rating: 4,   win: 3.40,  place: 1.80 },
  { name: 'Copper Flash',      form: [2, 1, 4, 1, 2], rating: 3.5, win: 4.20,  place: 2.00 },
  { name: 'Midnight Blaze',    form: [3, 1, 2, 5, 1], rating: 3.5, win: 4.80,  place: 2.15 },
  { name: 'Rapid Ruby',        form: [4, 3, 1, 2, 4], rating: 3,   win: 5.60,  place: 2.35 },
  { name: 'Lucky Bandit',      form: [2, 5, 3, 3, 2], rating: 3,   win: 6.50,  place: 2.55 },
  { name: 'Silver Arrow',      form: [5, 2, 6, 1, 3], rating: 2.5, win: 7.40,  place: 2.75 },
  { name: 'Shadow Dancer',     form: [6, 4, 2, 4, 5], rating: 2.5, win: 8.50,  place: 3.00 },
  { name: 'Quick Kestrel',     form: [3, 6, 5, 2, 6], rating: 2,   win: 9.80,  place: 3.25 },
  { name: 'Ballyhoo Boy',      form: [5, 5, 4, 6, 3], rating: 2,   win: 11.50, place: 3.55 },
  { name: 'Jetstream Jo',      form: [6, 3, 6, 5, 4], rating: 2,   win: 13.00, place: 3.80 },
];

// Silks as rendered in the race videos (identical across videos for each saddle number).
// pattern: plain | check | stripe | yoke
const SILKS: ByRunner<Colours> = {
  1:  { body: '#F2892B', sleeves: '#12A594', cap: '#12A594', pattern: 'plain' },
  2:  { body: '#F3A9CB', sleeves: '#F3A9CB', cap: '#F07FB4', pattern: 'plain' },
  3:  { body: '#FFFFFF', alt: '#D9262E', sleeves: '#1C1C1E', cap: '#D9262E', pattern: 'check' },
  4:  { body: '#2338B0', alt: '#F6D40C', sleeves: '#F6D40C', cap: '#F6D40C', pattern: 'stripe' },
  5:  { body: '#F4F4F2', sleeves: '#F4F4F2', cap: '#F4F4F2', pattern: 'plain' },
  6:  { body: '#18181B', sleeves: '#18181B', cap: '#18181B', pattern: 'plain' },
  7:  { body: '#8D7BF2', sleeves: '#F4F4F2', cap: '#F4F4F2', pattern: 'plain' },
  8:  { body: '#1E9150', sleeves: '#B45FE3', cap: '#B45FE3', pattern: 'plain' },
  9:  { body: '#18181B', alt: '#E4B21D', sleeves: '#18181B', cap: '#F4F4F2', pattern: 'yoke' },
  10: { body: '#18181B', sleeves: '#18181B', cap: '#F4F4F2', pattern: 'plain' },
};

// Trap jackets, matching the chips in the Kiron greyhound videos (standard trap colours). Traps 7 and 8
// (eight-dog games) match the Summerset Park trap box: black/red quarters, and green.
const TRAPS: ByRunner<Colours> = {
  1: { body: '#C0272F', ink: '#FFFFFF' },
  2: { body: '#2F48B5', ink: '#FFFFFF' },
  3: { body: '#ECECEA', ink: '#141414' },
  4: { body: '#17171A', ink: '#FFFFFF' },
  5: { body: '#E8C21E', ink: '#141414' },
  6: { body: '#17171A', alt: '#F4F4F2', ink: '#D9262E', pattern: 'hoops' },
  7: { body: '#17171A', alt: '#D9262E', ink: '#FFFFFF', pattern: 'quarters' },
  8: { body: '#3FC93C', ink: '#141414' },
};

export interface MarketLabel {
  label: string;
  box: string;
  toggle: string;
}

export interface Sport {
  key: SportKey;
  name: string;
  title: string;
  brand: string;
  noun: string;
  nouns: string;
  icon: 'silk' | 'trap';
  number: string;
  surface: string;
  profiles: Profile[];
  colours: ByRunner<Colours>;
  exotics: BetType[];
  labels: Partial<Record<BetType, MarketLabel>>;
  loading: string;
  waiting: string;
  replayTag: string;
}

export const SPORTS: Record<SportKey, Sport> = {
  horses: {
    key: 'horses', name: 'Horses', title: 'Horse racing', brand: 'Horse Racing',
    noun: 'horse', nouns: 'horses', icon: 'silk', number: 'number',
    surface: 'Turf', profiles: HORSE_PROFILES, colours: SILKS,
    exotics: EXOTICS,
    labels: {},
    loading: 'Horses to the gates…',
    waiting: 'A fresh field is waiting at the gates.',
    replayTag: 'Replay · Photo finish',
  },
  dogs: {
    key: 'dogs', name: 'Dogs', title: 'Greyhound racing', brand: 'Greyhounds',
    noun: 'dog', nouns: 'dogs', icon: 'trap', number: 'trap',
    surface: 'Sand', profiles: DOG_PROFILES, colours: TRAPS,
    // UK greyhound markets: Forecast / Tricast, boxed as Reverse Forecast / Combination Tricast.
    // Quinella is left out because Reverse Forecast covers "1st & 2nd in any order".
    exotics: ['EXACTA', 'TRIFECTA', 'TRIO', 'SWINGER'],
    labels: {
      EXACTA:   { label: 'Forecast', box: 'Reverse Forecast', toggle: 'Reverse' },
      TRIFECTA: { label: 'Tricast',  box: 'Combination Tricast', toggle: 'Combo' },
    },
    loading: 'Dogs in the traps…',
    waiting: 'A fresh field is waiting in the traps.',
    replayTag: 'Replay · Finish line',
  },
};
export const SPORT_KEYS = Object.keys(SPORTS) as SportKey[];

export interface Game {
  key: GameKey;
  sport: SportKey;
  venue: string;
  runners?: number;
}

// Games in the lobby. A game is one venue of a sport: its races are the videos with that venue. `runners`
// sets the field size; when it is bigger than the video's field the extra runners are virtual (virtual.ts).
export const GAMES: Record<GameKey, Game> = {
  crawford:  { key: 'crawford',  sport: 'dogs',   venue: 'Crawford Park',  runners: 6 },
  summerset: { key: 'summerset', sport: 'dogs',   venue: 'Summerset Park', runners: 8 },
  milnerton: { key: 'milnerton', sport: 'horses', venue: 'Milnerton' },
};
export const GAME_ORDER: GameKey[] = ['summerset', 'crawford', 'milnerton'];   // lobby order; the first is the default

export const isGameKey = (key: string | null | undefined): key is GameKey => !!key && key in GAMES;

/** Videos a game plays. */
export const gameRaces = (game: Game, races: Race[]) => races.filter(r => r.sport === game.sport && r.venue === game.venue);

/** Market name, e.g. 'Exacta box' (horses) or 'Reverse Forecast' (dogs). */
export function betLabel(sport: SportKey, type: BetType, box = false): string {
  const o = SPORTS[sport]?.labels[type];
  if (box) return o?.box || `${o?.label || BET_TYPES[type].label} box`;
  return o?.label || BET_TYPES[type].label;
}

/** Label of the any-order switch for a boxable market ('Box', or 'Reverse' for a Forecast). */
export const boxToggleLabel = (sport: SportKey, type: BetType) => SPORTS[sport]?.labels[type]?.toggle || 'Box';

/** One-line explanation of a market for this sport and field size. */
export function betHint(sport: SportKey, type: BetType, { box = false, places = 3 }: { box?: boolean; places?: number } = {}): string {
  const { noun, nouns } = SPORTS[sport];
  if (box) return `${type === 'EXACTA' ? 'Top 2' : 'Top 3'} in any order`;
  switch (type) {
    case 'WIN': return 'Pick the winner';
    case 'PLACE': return `Pick a ${noun} to finish top ${places}`;
    case 'EXACTA': return '1st & 2nd in exact order';
    case 'TRIFECTA': return '1st, 2nd & 3rd in exact order';
    case 'QUINELLA': return '1st & 2nd in any order';
    case 'TRIO': return 'Top 3 in any order';
    case 'SWINGER': return `2 ${nouns} both in the top 3`;
    case 'H2H': return `Which ${noun} finishes ahead?`;
    case 'ODDEVEN': case 'HILO': return `Winning ${SPORTS[sport].number} number`;
    default: return '';
  }
}

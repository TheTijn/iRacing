// Static game data. Race telemetry (results, running order) lives in /data/races.json.

// Runner profiles from the legacy race card. Each profile is kept together (name, form, rating,
// prices) so the favourite always has favourite-like form. Each race assigns a random subset of
// profiles to saddle numbers, so the favourite changes from race to race.
export const PROFILES = [
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

// Silks as rendered in the race videos (identical across videos for each saddle number).
// pattern: plain | check | stripe | yoke
export const SILKS = {
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

export const VENUE = { name: 'Milnerton', surface: 'Turf' };

export const CONFIG = {
  startBalance: 1000,
  stakeChips: [1, 2, 5, 10, 25, 50],
  defaultStake: 5,
  minStake: 0.1,
  maxStake: 1000,
  maxBets: 20,
  finishBeatMs: 1200,    // finish-line footage shown before the result screen
  historyLimit: 50,
};

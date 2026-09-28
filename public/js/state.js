// Single mutable game state + a tiny event bus. Modules mutate state, then emit so views re-render.
export const state = {
  phase: 'loading',          // loading | betting | racing | result
  races: [],                 // telemetry from data/races.json
  race: null,                // current race telemetry (video)
  raceNo: 1177,
  field: null,               // { horses, runners{no:runner}, win{no:odds}, place{no:odds}, places, favourite }
  market: 'wp',              // wp | exotic
  exoticType: 'EXACTA',
  box: false,
  legs: [[], [], []],        // exotic picks by position (legs[0] only for box / any-order)
  slip: [],                  // bets on the slip (not yet placed)
  stake: 5,                  // default stake per bet / per combination
  placed: [],                // bets riding on the current race
  lastPlaced: [],            // for Rebet
  outcome: null,
  balance: 0,
  settings: null,
};

const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

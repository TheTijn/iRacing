// Shared types for the game. Pure: no Angular, no DOM.

export type SportKey = 'dogs' | 'horses';
export type GameKey = 'crawford' | 'summerset' | 'milnerton';
export type Phase = 'loading' | 'lobby' | 'betting' | 'racing' | 'result';
export type Market = 'wp' | 'exotic' | 'h2h';
export type BetType =
  | 'WIN' | 'PLACE' | 'EXACTA' | 'TRIFECTA' | 'QUINELLA' | 'TRIO' | 'SWINGER' | 'H2H' | 'ODDEVEN' | 'HILO';
export type SetSide = 'Odd' | 'Even' | 'High' | 'Low';
export type LiveState = 'winning' | 'close' | 'out';
export type OddsFormat = 'decimal' | 'fractional' | 'american';
export type Currency = 'EUR' | 'USD' | 'GBP';

/** Runner number → value (win odds, place odds, …). */
export type ByRunner<T> = Record<number, T>;

export interface Combo {
  sel: number[];
  price: number;
}

/**
 * Every bet has one shape, so one settle() covers every market. `stake` is per combination.
 * `side` names the half of the field on Odd/Even and High/Low bets.
 */
export interface Bet {
  type: BetType;
  stake: number;
  box: boolean;
  legs: number[][];
  combos: Combo[];
  side?: SetSide;
  /** Slip identity (betKey) and ticket id, set when the bet goes on the slip. */
  key?: string;
  id?: string;
}

export interface Runner {
  no: number;
  name: string;
  form: number[];
  rating: number;
  win: number;
  place: number;
  silk: Colours;
}

export interface Field {
  sport: SportKey;
  horses: number[];
  runners: ByRunner<Runner>;
  win: ByRunner<number>;
  place: ByRunner<number>;
  places: number;
  favourite: number;
  byOdds: number[];
  /** The game the field was built for (set by the game flow). */
  game?: GameKey;
}

/** Silks (horses) or trap jacket (dogs) colours for one number. */
export interface Colours {
  body: string;
  alt?: string;
  sleeves?: string;
  cap?: string;
  ink?: string;
  pattern?: 'plain' | 'check' | 'stripe' | 'yoke' | 'hoops' | 'quarters';
}

export interface OrderEvent {
  f: number;
  order: number[];
}

/** One race video's telemetry (data/races.json), plus any virtual runners. */
export interface Race {
  id: string;
  sport: SportKey;
  venue: string;
  distance: number;
  runners: number;
  fps: number;
  src: string;
  poster: string;
  thumb?: string;
  gateEndFrame: number;
  finishFrame: number;
  replayStart: number | null;
  replayEnd: number | null;
  result: number[];
  distStep: number;
  dist: number[];
  orderEvents: OrderEvent[];
  virtual?: number[];
}

export interface Settings {
  odds: OddsFormat;
  currency: Currency;
  instant: boolean;
  saver: boolean;
  /** Shows the Auto button next to Place bet. */
  autoPlay: boolean;
}

export interface SettledBet extends Bet {
  ret: number;
}

export interface Outcome {
  raceNo: number;
  order: number[];
  bets: SettledBet[];
  staked: number;
  returned: number;
}

/** A settled bet in the session history: enough to describe it without the race's field. */
export interface HistoryBet {
  id: string;
  type: BetType;
  box: boolean;
  side?: SetSide;
  legs: number[][];
  names: ByRunner<string>;
  stake: number;
  ret: number;
}

export interface HistoryEntry {
  raceNo: number;
  sport: SportKey;
  venue: string;
  at: number;
  podium: number[];
  staked: number;
  returned: number;
  bets: HistoryBet[];
}

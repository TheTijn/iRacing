// Static game config. Per-sport data (runner profiles, silks/traps, wording) lives in sports.ts;
// race telemetry (results, running order, venue) in public/data/races.json.

export const CONFIG = {
  startBalance: 1000,
  stakeChips: [1, 2, 5, 10, 25, 50],
  defaultStake: 5,
  minStake: 0.1,
  maxStake: 1000,
  maxBets: 20,
  finishBeatMs: 1200,    // finish-line footage shown before the result screen
  historyLimit: 50,
} as const;

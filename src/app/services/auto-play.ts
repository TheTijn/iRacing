import { Injectable, computed, signal } from '@angular/core';
import { round2 } from '../core/pricing';
import type { Bet } from '../core/models';
import { slipCost } from './betslip-store';

export const AUTO_ROUNDS = [10, 25, 40, 50] as const;
/** A single return of this many times the race's stake stops auto play (when the win limit is on). */
export const AUTO_WIN_MULTIPLE = 10;

/** What the player picks in the Auto play sheet. */
export interface AutoOptions {
  rounds: number;
  /** Stop before a race that could take the session's net loss past this. */
  lossLimit: number;
  /** Stop after a single return of AUTO_WIN_MULTIPLE × the race's stake. */
  winLimit: boolean;
  /** Go straight to each result (no race video). */
  skip: boolean;
}

/** An auto play session: the same bets on every race, until a limit or the player stops it. */
export interface AutoRun extends AutoOptions {
  bets: Bet[];
  /** Cost of one race's bets. */
  cost: number;
  played: number;
  /** Returned minus staked over the races played so far. */
  net: number;
}

/** Auto play state and its stop rules. GameFlow runs the races. */
@Injectable({ providedIn: 'root' })
export class AutoPlay {
  readonly run = signal<AutoRun | null>(null);
  readonly active = computed(() => this.run() !== null);
  /** Seconds until the next race starts (counted down on the result screen), or null. */
  readonly nextIn = signal<number | null>(null);
  /** The sheet's last choices, kept for the next session. */
  readonly options = signal<Omit<AutoOptions, 'lossLimit'>>({ rounds: AUTO_ROUNDS[0], winLimit: false, skip: false });

  begin(bets: Bet[], opts: AutoOptions): void {
    this.options.set({ rounds: opts.rounds, winLimit: opts.winLimit, skip: opts.skip });
    this.run.set({ ...opts, bets, cost: slipCost(bets), played: 0, net: 0 });
  }

  /** Counts a settled race. Returns why auto play stops, or null to carry on. */
  record(staked: number, returned: number, balance: number): string | null {
    const r = this.run();
    if (!r) return null;
    const played = r.played + 1, net = round2(r.net + returned - staked);
    this.run.set({ ...r, played, net });
    if (r.winLimit && returned >= AUTO_WIN_MULTIPLE * staked - 1e-9) return 'Auto play stopped: win limit reached';
    if (played >= r.rounds) return `Auto play finished: ${played} races`;
    if (r.cost - net > r.lossLimit + 1e-9) return 'Auto play stopped: loss limit reached';
    if (r.cost > balance + 1e-9) return 'Auto play stopped: not enough balance';
    return null;
  }

  end(): void {
    this.run.set(null);
    this.nextIn.set(null);
  }
}

import { Injectable, computed, signal } from '@angular/core';
import { CONFIG } from '../core/config';
import { GAMES, SPORTS } from '../core/sports';
import type { Bet, BetType, Field, GameKey, Market, Outcome, Phase, Race, Settings } from '../core/models';

/**
 * The game's state as signals. Services mutate it (GameFlow, BetslipStore, RaceEngine) and every view
 * derives from it, so there is no render/emit plumbing: change a signal and the templates follow.
 */
@Injectable({ providedIn: 'root' })
export class GameState {
  readonly phase = signal<Phase>('loading');
  /** Lobby game (GAMES in sports.ts): a venue of a sport, with its field size. Not persisted. */
  readonly game = signal<GameKey>('summerset');
  /** Telemetry from data/races.json (all sports). */
  readonly races = signal<Race[]>([]);
  /** Current race telemetry (the video, plus any virtual runners). */
  readonly race = signal<Race | null>(null);
  readonly raceNo = signal(1177);
  readonly field = signal<Field | null>(null);
  readonly market = signal<Market>('wp');
  readonly exoticType = signal<BetType>('EXACTA');
  /** Exotic picks by position (legs[0] only for any-order markets). */
  readonly legs = signal<number[][]>([[], [], []]);
  /** Default stake per bet / per combination. */
  readonly stake = signal<number>(CONFIG.defaultStake);
  /** Bets riding on the current race. */
  readonly placed = signal<Bet[]>([]);
  /** The last race's bets, for Rebet. */
  readonly lastPlaced = signal<Bet[]>([]);
  readonly outcome = signal<Outcome | null>(null);
  readonly balance = signal(0);
  readonly settings = signal<Settings>({ odds: 'decimal', currency: 'USD', instant: false, saver: false, autoPlay: true });

  /** The game being played (venue + field size). */
  readonly gameInfo = computed(() => GAMES[this.game()]);
  /** The game's sport: dogs | horses. */
  readonly sportKey = computed(() => this.gameInfo().sport);
  /** Config + wording for the current sport. */
  readonly sport = computed(() => SPORTS[this.sportKey()]);
}

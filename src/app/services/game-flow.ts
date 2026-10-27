import { Injectable, Injector, afterNextRender, inject, signal } from '@angular/core';
import { CONFIG } from '../core/config';
import { BET_TYPES, buildBet, settle } from '../core/pricing';
import { GAMES, GAME_ORDER, gameRaces, isGameKey } from '../core/sports';
import { buildField } from '../core/field';
import { withVirtualRunners } from '../core/virtual';
import type { Bet, ByRunner, Field, GameKey, Outcome, Race, Settings, SportKey } from '../core/models';
import { BetslipStore, newId, slipCost } from './betslip-store';
import { Formatter } from './formatter';
import { GameState } from './game-state';
import { Motion, gsap } from './motion';
import { Persistence } from './persistence';
import { RaceEngine } from './race-engine';
import { UiShell } from './ui-shell';

/** What the result screen shows: kept apart from the live state, which moves on to the next race while it fades out. */
export interface ResultView {
  outcome: Outcome;
  field: Field;
  race: Race;
  mine: Set<number>;
  canRebet: boolean;
}

export type ResultAction = 'next' | 'rebet';

const cloneBet = (b: Bet, fresh = false): Bet => ({
  ...b,
  id: fresh ? newId() : b.id,
  legs: b.legs.map(l => l.slice()),
  combos: b.combos.map(c => ({ ...c, sel: c.sel.slice() })),
});

/**
 * The game's phase machine: boot, BETTING → RACING → RESULT → (Rebet | Next race), plus the lobby between
 * races. Picks each race's video (shuffle bag per game), places and settles bets, switches games.
 */
@Injectable({ providedIn: 'root' })
export class GameFlow {
  private readonly state = inject(GameState);
  private readonly slip = inject(BetslipStore);
  private readonly engine = inject(RaceEngine);
  private readonly ui = inject(UiShell);
  private readonly motion = inject(Motion);
  private readonly persistence = inject(Persistence);
  private readonly fmt = inject(Formatter);
  private readonly injector = inject(Injector);

  private readonly params = new URLSearchParams(location.search);
  private readonly forcedRace = this.params.get('race');    // debug: ?race=190 / ?race=d01 plays that video every time (and opens its game)
  private readonly forcedGame = this.params.get('game');    // debug: ?game=summerset opens that game
  private readonly forcedSport = this.params.get('sport');  // debug: ?sport=horses opens that sport's first game
  private readonly bags: Partial<Record<GameKey, Race[]>> = {};   // shuffle bag per game
  private readonly lastRaceId: Partial<Record<GameKey, string>> = {};

  /** Bumped when a new race card should animate in (after a result, and at boot). */
  readonly cardIntro = signal(0);
  /** What the result screen shows. */
  readonly result = signal<ResultView | null>(null);
  private resultShownAt = 0;
  private lobbyFrom: 'betting' | 'result' = 'betting';

  /** Result actions only accept taps once the screen has settled (guards a double tap on Skip landing on Next race). */
  resultReady(): boolean { return performance.now() - this.resultShownAt > 450; }

  // ---------- Boot ----------
  async init(): Promise<void> {
    this.state.settings.set(this.persistence.loadSettings());
    this.state.balance.set(this.persistence.loadBalance());
    this.state.stake.set(CONFIG.defaultStake);
    try {
      const res = await fetch('data/races.json');
      this.state.races.set((await res.json()).races);
    } catch (e) {
      this.ui.toast('Could not load races — please refresh', true);
      throw e;
    }
    const races = this.state.races();
    const playable = (k: string | null | undefined): k is GameKey => isGameKey(k) && gameRaces(GAMES[k], races).length > 0;
    const forced = this.forcedRace ? races.find(r => r.id === this.forcedRace) : undefined;
    const want = [
      forced && GAME_ORDER.find(k => gameRaces(GAMES[k], [forced]).length),
      this.forcedGame,
      this.forcedSport && GAME_ORDER.find(k => GAMES[k].sport === this.forcedSport),
      ...GAME_ORDER,
    ].find(playable);
    if (!want) { this.ui.toast('No races available', true); return; }
    this.state.game.set(want);

    this.newRace();
    this.ui.showView('betting', { instant: true });
    if (!this.motion.reducedMotion()) {
      afterNextRender(() => {
        gsap.from(['.topbar', '.race-head', '.markets'], { y: 16, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07, clearProps: 'transform,opacity' });
      }, { injector: this.injector });
    }
    this.exposeDebugHandle();
  }

  // ---------- Races ----------
  private pickRace(): Race {
    const key = this.state.game();
    const races = gameRaces(this.state.gameInfo(), this.state.races());
    const forced = this.forcedRace && races.find(x => x.id === this.forcedRace);
    if (forced) return forced;
    const bag = (this.bags[key] ||= []);
    if (!bag.length) {
      bag.push(...races.slice().sort(() => Math.random() - 0.5));
      if (bag.length > 1 && bag[bag.length - 1].id === this.lastRaceId[key]) bag.unshift(bag.pop()!);
    }
    const r = bag.pop()!;
    this.lastRaceId[key] = r.id;
    return r;
  }

  /** A new race: picks the video (during betting, so it can preload) and, unless kept, a new field. */
  private newRace({ keepField = false } = {}): void {
    const s = this.state;
    this.engine.stop();
    const video = this.pickRace();
    const runners = Math.max(video.runners, s.gameInfo().runners || 0);   // more than the video shows → virtual runners
    s.raceNo.update(n => n + 1);
    let field = s.field();
    if (!keepField || !field || field.game !== s.game() || field.horses.length !== runners) {
      field = { ...buildField(runners, Math.random, s.sportKey()), game: s.game() };
      s.field.set(field);
    }
    const race = withVirtualRunners(video, field);
    s.race.set(race);
    s.legs.set([[], [], []]);
    s.placed.set([]);
    s.outcome.set(null);
    if (s.phase() === 'result' || s.phase() === 'loading') this.cardIntro.update(n => n + 1);
    this.ui.renderBalance();
    this.engine.prepare(race);
  }

  /** The slip's Place bet button. */
  placeSlip(): void {
    const bets = this.slip.bets();
    if (!bets.length) return;
    const cost = slipCost(bets);
    if (cost > this.state.balance() + 1e-9) {
      this.ui.toast(`Not enough balance — lower your stake (need ${this.fmt.money(cost)})`, true);
      this.motion.haptic([20, 40, 20]);
      return;
    }
    this.slip.close();
    this.placeBets(bets);
  }

  private placeBets(bets: Bet[]): boolean {
    const s = this.state;
    const cost = slipCost(bets);
    if (!bets.length) return false;
    if (cost > s.balance() + 1e-9) { this.ui.toast(`Not enough balance (need ${this.fmt.money(cost)})`, true); return false; }
    s.balance.set(Math.round((s.balance() - cost) * 100) / 100);
    this.persistence.saveBalance(s.balance());
    this.ui.renderBalance({ animate: true });
    s.placed.set(bets.map(b => cloneBet(b)));
    s.lastPlaced.set(bets.map(b => cloneBet(b)));
    this.slip.clear();
    this.slip.close();
    const instant = s.settings().instant;
    if (!instant) this.ui.showView('racing');
    this.engine.start({ instant, onFinish: (order, info) => this.onRaceFinish(order, info) });
    return true;
  }

  private onRaceFinish(order: number[], { natural = false } = {}): void {
    const s = this.state;
    const field = s.field()!;
    const placed = s.placed();
    const bets = placed.map(b => ({ ...b, ret: settle(b, order, field.places) }));
    const staked = slipCost(placed);
    const returned = Math.round(bets.reduce((sum, b) => sum + b.ret, 0) * 100) / 100;
    const outcome: Outcome = { raceNo: s.raceNo(), order, bets, staked, returned };
    s.outcome.set(outcome);

    // Credit immediately in state (the pill animates on the result screen)
    s.balance.set(Math.round((s.balance() + returned) * 100) / 100);
    this.persistence.saveBalance(s.balance());

    const names = (b: Bet): ByRunner<string> =>
      Object.fromEntries([...new Set(b.legs.flat())].map(h => [h, field.runners[h].name]));
    this.persistence.pushHistory({
      raceNo: s.raceNo(), sport: s.sportKey(), venue: s.race()!.venue, at: Date.now(), podium: order.slice(0, 3), staked, returned,
      bets: bets.map(b => ({
        id: b.id!, type: b.type, box: b.box, side: b.side, legs: b.legs, names: names(b),
        stake: b.stake * b.combos.length, ret: b.ret,
      })),
    });

    this.engine.afterFinish(natural ? CONFIG.finishBeatMs : 0, () => {
      this.engine.pauseVideo();
      this.ui.showView('result');
      this.resultShownAt = performance.now();
      this.result.set({
        outcome, field, race: s.race()!, mine: this.engine.mine(),
        canRebet: s.lastPlaced().length > 0,   // affordability is checked at Place bet
      });
    });
  }

  /** Rebet: next race on the same field with last race's bets back on the slip. Nothing is placed (or deducted)
   *  until the player presses Place bet, so they can add or change bets first. */
  private rebet(): void {
    const bets = this.state.lastPlaced().map(b => cloneBet(b, true));
    const oldField = this.state.field();
    this.newRace({ keepField: true });
    this.ui.showView('betting');
    if (this.state.field() !== oldField) {   // field changed: the old picks don't exist in it
      this.slip.clear();
      this.ui.toast('New field — pick your runners');
      return;
    }
    this.slip.set(bets);
    const cost = slipCost(bets);
    if (cost > this.state.balance() + 1e-9) this.ui.toast(`Not enough balance for these bets (${this.fmt.money(cost)}) — lower a stake`, true);
    else this.ui.toast(`${bets.length} ${bets.length === 1 ? 'bet' : 'bets'} back on your slip — add more or place`);
  }

  private nextRace(): void {
    this.newRace();
    this.ui.showView('betting');
    if (this.state.balance() < CONFIG.minStake) this.ui.toast('Out of demo funds — reset your balance in Settings', true);
  }

  resultAction(act: ResultAction): void {
    // Ignore taps while the result view is still fading in/out (prevents double rebet / double deduction)
    if (this.state.phase() !== 'result' || !this.resultReady()) return;
    this.motion.cancelCelebration();
    if (act === 'rebet') this.rebet();
    else this.nextRace();
  }

  /** The race card's refresh button: a new race with fresh names and odds. Slip prices belong to the old field. */
  refreshField(): void {
    if (this.state.phase() !== 'betting') return;
    const hadBets = this.slip.bets().length > 0;
    this.slip.clear();
    this.newRace();
    this.cardIntro.update(n => n + 1);
    if (hadBets) this.ui.toast('Betslip cleared for the new field');
  }

  // ---------- Game ----------
  /** Re-fit the card to the sport: keep the exotic type if the sport offers it. */
  private resetForSport(): void {
    const s = this.state;
    if (!s.sport().exotics.includes(s.exoticType())) { s.exoticType.set(s.sport().exotics[0]); s.box.set(false); }
    s.legs.set([[], [], []]);
  }

  /** Switch game between races: new field from that game's videos. Same wallet and history. */
  setGame(key: GameKey): void {
    const s = this.state;
    if (key === s.game() || !GAMES[key] || !['lobby', 'betting', 'result'].includes(s.phase())) return;
    if (!gameRaces(GAMES[key], s.races()).length) { this.ui.toast(`No ${GAMES[key].venue} races available`, true); return; }
    const hadBets = this.slip.bets().length > 0;
    this.motion.cancelCelebration();
    this.slip.close();
    s.game.set(key);
    this.slip.clear();
    s.lastPlaced.set([]);    // picks belong to the other game's field
    this.resetForSport();
    this.newRace();
    this.ui.showView('betting');
    if (hadBets) this.ui.toast('Betslip cleared for the new field');
  }

  // ---------- Lobby ----------
  // Reachable between races only. Picking the game being played goes back to it: the race card as it was
  // (slip intact), or a fresh race when the lobby was opened from the result screen.
  openLobby(): void {
    const phase = this.state.phase();
    if (phase === 'lobby') { this.pickGame(this.state.game()); return; }
    if (phase !== 'betting' && phase !== 'result') { this.ui.toast('The lobby opens after this race'); return; }
    if (phase === 'result' && !this.resultReady()) return;
    this.lobbyFrom = phase;
    this.motion.cancelCelebration();
    this.slip.close();
    this.ui.closeSheet();
    this.ui.showView('lobby');
  }

  pickGame(key: GameKey): void {
    if (this.state.phase() !== 'lobby') return;
    if (key !== this.state.game()) this.setGame(key);
    else if (this.lobbyFrom === 'result') this.nextRace();
    else this.ui.showView('betting');
  }

  /** Escape (when no sheet is open): leave the lobby, or skip the race. */
  escape(): void {
    if (this.state.phase() === 'lobby') this.pickGame(this.state.game());
    else if (this.state.phase() === 'racing') this.engine.skip();
  }

  // ---------- Settings ----------
  updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    const s = this.state;
    s.settings.update(cur => ({ ...cur, [key]: value }));
    this.persistence.saveSettings(s.settings());
    this.ui.renderBalance();
    if (s.phase() === 'betting') this.engine.prepare(s.race()!);
    if (s.phase() === 'racing') this.engine.setSaver(!!s.settings().saver);
  }

  resetBalance(): void {
    this.state.balance.set(CONFIG.startBalance);
    this.persistence.saveBalance(CONFIG.startBalance);
    this.ui.renderBalance({ animate: true });
    this.ui.toast(`Demo balance reset to ${this.fmt.money(CONFIG.startBalance)}`);
  }

  // Debug handle for QA in the console: __ir.state.balance(), __ir.setGame('crawford'), __ir.setSport('horses')…
  private exposeDebugHandle(): void {
    const setSport = (key: SportKey) => { const g = GAME_ORDER.find(k => GAMES[k].sport === key); if (g) this.setGame(g); };
    Object.assign(window, {
      __ir: {
        state: this.state, slip: this.slip, settle, buildBet, BET_TYPES,
        addBet: (b: Bet) => this.slip.addBet(b), odds: (d: number) => this.fmt.odds(d),
        setGame: (k: GameKey) => this.setGame(k), setSport,
      },
    });
  }
}

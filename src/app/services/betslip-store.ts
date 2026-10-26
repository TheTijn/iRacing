import { Injectable, computed, inject, signal } from '@angular/core';
import { CONFIG } from '../core/config';
import { BET_TYPES, betCost, maxReturn, round2 } from '../core/pricing';
import { betLabel } from '../core/sports';
import type { Bet, BetType } from '../core/models';
import { GameState } from './game-state';
import { Motion } from './motion';
import { UiShell } from './ui-shell';
import { Viewport } from './viewport';

export const newId = () => 'IR' + Math.random().toString(36).slice(2, 8).toUpperCase();
const simpleKey = (type: BetType, h: number) => `${type}:${h}`;

/** Identity of a bet on the slip (the same selection can't be added twice). */
export function betKey(bet: Bet): string {
  const t = BET_TYPES[bet.type];
  if (t.set) return `${bet.type}:${bet.side}`;
  if (t.size === 1) return simpleKey(bet.type, bet.legs[0][0]);
  return `${bet.type}:${bet.box ? 'box' : ''}:${bet.legs.map(l => l.slice().sort((a, b) => a - b).join('.')).join('|')}`;
}

/** Total cost of a list of bets. */
export const slipCost = (bets: Bet[]) => round2(bets.reduce((s, b) => s + betCost(b), 0));

/** A typed stake, clamped to the allowed range (null when it isn't a number). */
export function parseStake(v: string | number): number | null {
  const n = round2(parseFloat(String(v).replace(',', '.')));
  if (!Number.isFinite(n)) return null;
  return Math.min(CONFIG.maxStake, Math.max(CONFIG.minStake, n));
}

/** The betslip: bets not yet placed, their stakes, and whether the bottom sheet is open. */
@Injectable({ providedIn: 'root' })
export class BetslipStore {
  private readonly state = inject(GameState);
  private readonly ui = inject(UiShell);
  private readonly motion = inject(Motion);
  private readonly viewport = inject(Viewport);

  readonly bets = signal<Bet[]>([]);
  /** Bottom sheet open (phones / tablet shell; the docked desktop slip never opens). */
  readonly open = signal(false);
  /** Bumped when a bet is added (the count and max return pop). */
  readonly added = signal(0);

  readonly cost = computed(() => slipCost(this.bets()));
  readonly maxReturn = computed(() => {
    const f = this.state.field();
    return f ? maxReturn(this.bets(), f.horses, f.places) : 0;
  });
  /** On screen: while betting, when it holds bets or is docked. */
  readonly visible = computed(() => this.state.phase() === 'betting' && (this.bets().length > 0 || this.viewport.docked()));
  private readonly keys = computed(() => new Set(this.bets().map(b => b.key)));

  hasKey(key: string): boolean { return this.keys().has(key); }
  hasSimple(type: BetType, h: number): boolean { return this.hasKey(simpleKey(type, h)); }

  /** Bet title for the current sport, e.g. 'Reverse Forecast'. */
  title(bet: Pick<Bet, 'type' | 'box'>): string { return betLabel(this.state.sportKey(), bet.type, bet.box); }

  addBet(bet: Bet): boolean {
    const bets = this.bets();
    if (bets.length >= CONFIG.maxBets) { this.ui.toast(`Max ${CONFIG.maxBets} bets per slip`, true); return false; }
    const key = bet.key || betKey(bet);
    if (bets.some(b => b.key === key)) { this.ui.toast('Already on your slip'); return false; }
    this.bets.set([...bets, { ...bet, key, id: bet.id || newId() }]);
    this.motion.haptic(8);
    this.added.update(n => n + 1);
    return true;
  }

  toggleSimple(type: 'WIN' | 'PLACE', h: number): void {
    const key = simpleKey(type, h);
    if (this.hasKey(key)) { this.bets.update(bets => bets.filter(b => b.key !== key)); return; }
    const f = this.state.field()!;
    const price = (type === 'WIN' ? f.win : f.place)[h];
    this.addBet({ type, stake: this.state.stake(), box: false, legs: [[h]], combos: [{ sel: [h], price }] });
  }

  /** Add a bet, or take it off the slip if it's already there (price buttons that toggle). */
  toggleBet(bet: Bet): void {
    const key = betKey(bet);
    if (this.hasKey(key)) { this.bets.update(bets => bets.filter(b => b.key !== key)); return; }
    this.addBet(bet);
  }

  removeBet(id: string): void { this.bets.update(bets => bets.filter(b => b.id !== id)); }
  clear(): void { this.bets.set([]); }
  /** Replace the slip (Rebet puts last race's bets back). */
  set(bets: Bet[]): void { this.bets.set(bets); }

  setAllStakes(v: number): void {
    this.state.stake.set(v);
    this.bets.update(bets => bets.map(b => ({ ...b, stake: v })));
  }
  setStake(id: string, v: number): void {
    this.bets.update(bets => bets.map(b => (b.id === id ? { ...b, stake: v } : b)));
  }

  setOpen(v: boolean): void {
    if (v === this.open() || (v && this.viewport.docked())) return;
    this.open.set(v);
  }
  close(): void { this.setOpen(false); }
}

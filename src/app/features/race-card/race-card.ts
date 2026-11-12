import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, linkedSignal,
  signal, untracked, viewChild,
} from '@angular/core';
import { BET_TYPES, SET_SIDES, betCost, betMaxReturn, buildBet, pickError } from '../../core/pricing';
import { betHint, betLabel } from '../../core/sports';
import type { Bet, BetType, Market, SetSide } from '../../core/models';
import { BetslipStore, betKey } from '../../services/betslip-store';
import { Formatter } from '../../services/formatter';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';
import { Motion, gsap } from '../../services/motion';
import { RunnerIcon } from '../../shared/runner-icon';

const POS = ['1st', '2nd', '3rd'];
const STARS = [1, 2, 3, 4, 5];

interface BuilderView {
  title: string;
  hint: string;
  err: string | null;
  combos: number;
  cost: number;
  pays: number;
}

/**
 * Race card: race header, market tabs (Win & Place, Exotics, Odd/Even), the runner list with Win/Place
 * prices or exotic pick toggles, the exotic builder bar, and the Odd/Even panel.
 */
@Component({
  selector: 'section[app-race-card]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RunnerIcon],
  host: {
    class: 'view view--card',
    'aria-label': 'Race card',
    '[class.is-compact]': 'compact()',
    '[style.--builder-h]': "builderOn() ? '76px' : '0px'",
  },
  templateUrl: './race-card.html',
})
export class RaceCard {
  protected readonly state = inject(GameState);
  protected readonly slip = inject(BetslipStore);
  protected readonly fmt = inject(Formatter);
  private readonly flow = inject(GameFlow);
  private readonly motion = inject(Motion);
  private readonly injector = inject(Injector);

  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly oddEvenPanel = viewChild.required<ElementRef<HTMLElement>>('oddEven');

  protected readonly markets: { key: Market; label: string }[] = [
    { key: 'wp', label: 'Win & Place' },
    { key: 'exotic', label: 'Exotics' },
    { key: 'oddeven', label: 'Odd/Even' },
  ];
  protected readonly stars = STARS;

  /** Race header compacts once the runner list scrolls. */
  protected readonly compact = signal(false);

  // ---------- Header ----------
  protected readonly venue = computed(() => this.state.race()?.venue || ' ');
  protected readonly meta = computed(() => {
    const r = this.state.race();
    return r ? `${r.distance}m · ${this.state.sport().surface} · ${r.runners} runners` : '';
  });
  protected readonly headBg = computed(() => {
    const r = this.state.race();
    return r ? `url(${r.thumb || r.poster})` : null;
  });
  /** Horses wear a saddle-cloth number; trap jackets already carry it. */
  protected readonly saddles = computed(() => this.state.sport().icon === 'silk');

  // ---------- Exotics ----------
  protected readonly orderedGrid = computed(() => BET_TYPES[this.state.exoticType()].ordered);
  protected readonly positions = computed(() => POS.slice(0, BET_TYPES[this.state.exoticType()].size));

  protected label(type: BetType): string { return betLabel(this.state.sportKey(), type); }
  protected hint(type: BetType): string {
    return betHint(this.state.sportKey(), type, { places: this.state.field()?.places });
  }

  private readonly currentLegs = computed(() => {
    const legs = this.state.legs();
    return this.orderedGrid() ? legs.slice(0, BET_TYPES[this.state.exoticType()].size) : [legs[0]];
  });

  private readonly builder = computed<BuilderView | null>(() => {
    const s = this.state;
    const active = s.market() === 'exotic' && s.phase() === 'betting';
    if (!active || !s.legs().some(l => l.length)) return null;
    const type = s.exoticType(), legs = this.currentLegs(), field = s.field()!;
    const base = { title: this.label(type), hint: this.hint(type), combos: 0, cost: 0, pays: 0 };
    const err = pickError(type, legs, false, s.sport().noun);
    if (err) return { ...base, err };
    const bet = buildBet(type, legs, { stake: s.stake(), box: false, field });
    return { ...base, err: null, combos: bet.combos.length, cost: betCost(bet), pays: betMaxReturn(bet, field.horses, field.places) };
  });
  protected readonly builderOn = computed(() => this.builder() !== null);
  /** What the builder bar shows: kept while it fades out. */
  protected readonly builderView = linkedSignal<BuilderView | null, BuilderView | null>({
    source: this.builder,
    computation: (b, prev) => b ?? prev?.value ?? null,
  });

  // ---------- Odd/Even ----------
  // Two winner markets on the winning number: Odd / Even and High / Low. Each price button toggles one bet on the slip.
  protected readonly setMarkets = computed(() => {
    const f = this.state.field();
    if (!f) return [];
    const stake = this.state.stake();
    return (Object.entries(SET_SIDES) as [BetType, [SetSide, SetSide]][]).map(([type, sides]) => ({
      type,
      sides: sides.map(side => {
        const bet = buildBet(type, [], { stake, field: f, side });
        return { side, bet, key: betKey(bet), nos: bet.legs[0], price: bet.combos[0].price };
      }),
    }));
  });

  constructor() {
    // A new race card (after a result, and at boot): back to the top, rows stagger in.
    effect(() => {
      if (!this.flow.cardIntro()) return;
      untracked(() => afterNextRender(() => this.intro(), { injector: this.injector }));
    });
  }

  private intro(): void {
    const list = this.list().nativeElement, oddEven = this.oddEvenPanel().nativeElement;
    list.scrollTop = oddEven.scrollTop = 0;
    this.compact.set(false);
    if (this.motion.reducedMotion()) return;
    const rows = this.state.market() === 'oddeven' ? oddEven.querySelectorAll('.oddeven__set') : list.children;
    gsap.fromTo(rows, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out', stagger: 0.035, clearProps: 'transform,opacity' });
  }

  // Compact the race header once the runner list scrolls (hysteresis avoids flicker at the edge)
  protected onScroll(el: HTMLElement): void {
    const y = el.scrollTop;
    if (y > 36) this.compact.set(true);
    else if (y < 6) this.compact.set(false);
  }

  protected setMarket(market: Market): void { this.state.market.set(market); }

  protected refreshField(): void { this.flow.refreshField(); }

  protected setExoticType(type: BetType): void {
    const s = this.state;
    if (type === s.exoticType()) return;
    const wasGrid = this.orderedGrid();
    s.exoticType.set(type);
    // Keep picks where they still make sense; collapse positional picks when switching layouts.
    let legs = s.legs().map(l => l.slice());
    if (wasGrid !== this.orderedGrid()) legs = [[...new Set(legs.flat())], [], []];
    if (this.orderedGrid()) for (let i = BET_TYPES[type].size; i < 3; i++) legs[i] = [];
    s.legs.set(legs);
  }

  protected isPicked(leg: number, h: number): boolean { return this.state.legs()[leg].includes(h); }

  protected togglePick(leg: number, h: number): void {
    this.state.legs.update(legs => legs.map((l, i) => (i !== leg ? l : l.includes(h) ? l.filter(x => x !== h) : [...l, h])));
  }

  protected clearPicks(): void { this.state.legs.set([[], [], []]); }

  protected addExotic(): void {
    const s = this.state;
    const legs = this.currentLegs();
    if (pickError(s.exoticType(), legs, false, s.sport().noun)) return;
    const bet = buildBet(s.exoticType(), legs, { stake: s.stake(), box: false, field: s.field()! });
    if (this.slip.addBet(bet)) this.clearPicks();
  }

  protected toggleBet(bet: Bet): void { this.slip.toggleBet(bet); }
}

import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import type { Bet, Outcome } from '../../core/models';
import { betLabel } from '../../core/sports';
import { AutoPlay } from '../../services/auto-play';
import { slipCost } from '../../services/betslip-store';
import { Formatter, PLACE_SUFFIX } from '../../services/formatter';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';
import { Motion, gsap } from '../../services/motion';
import { UiShell } from '../../services/ui-shell';
import { AutoStatus } from '../../shared/auto-status';
import { BetSelection } from '../../shared/bet-selection';
import { RunnerIcon } from '../../shared/runner-icon';

/** 'win' (profit), 'partial' (some return, net loss) or 'loss'. */
export type OutcomeKind = 'win' | 'partial' | 'loss';

export function outcomeKind(o: Outcome): OutcomeKind {
  if (o.returned <= 0) return 'loss';
  return o.returned > o.staked ? 'win' : 'partial';
}

/**
 * Result screen: hero (win / partial return / loss), podium, settled bets, Next race / Rebet.
 * Celebrations (count-up, confetti, coins into the balance) only when the return beats the stake.
 */
@Component({
  selector: 'section[app-result]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BetSelection, RunnerIcon, AutoStatus],
  host: { class: 'view view--result', 'aria-label': 'Result', '[class.is-win]': "kind() === 'win'" },
  templateUrl: './result.html',
})
export class Result {
  protected readonly flow = inject(GameFlow);
  protected readonly auto = inject(AutoPlay);
  protected readonly state = inject(GameState);
  protected readonly fmt = inject(Formatter);
  private readonly motion = inject(Motion);
  private readonly ui = inject(UiShell);
  private readonly injector = inject(Injector);

  private readonly scroll = viewChild.required<ElementRef<HTMLElement>>('scroll');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');
  private readonly podiumEl = viewChild.required<ElementRef<HTMLElement>>('podiumBox');
  private readonly betsEl = viewChild.required<ElementRef<HTMLElement>>('bets');
  private readonly actions = viewChild.required<ElementRef<HTMLElement>>('actions');
  private readonly amountEl = viewChild<ElementRef<HTMLElement>>('heroAmount');

  protected readonly suffix = PLACE_SUFFIX;
  private readonly view = this.flow.result;
  protected readonly outcome = computed(() => this.view()?.outcome ?? null);
  protected readonly sport = computed(() => this.view()?.field.sport);
  protected readonly kind = computed<OutcomeKind>(() => { const o = this.outcome(); return o ? outcomeKind(o) : 'loss'; });
  /** The hero's counted-up amount. */
  protected readonly amount = signal(0);
  protected readonly saddles = computed(() => this.sport() === 'horses');
  protected readonly names = computed(() =>
    Object.fromEntries(Object.values(this.view()?.field.runners ?? {}).map(r => [r.no, r.name])));
  protected readonly podium = computed(() => {
    const v = this.view();
    if (!v) return [];
    const f = v.field;
    return v.outcome.order.slice(0, 3).map((h, i) => ({ h, i, name: f.runners[h].name, mine: v.mine.has(h) }));
  });
  protected readonly winner = computed(() => {
    const v = this.view();
    if (!v) return null;
    const no = v.outcome.order[0];
    return { no, name: v.field.runners[no].name, win: v.field.win[no] };
  });
  protected readonly rebetCost = computed(() => slipCost(this.state.lastPlaced()));

  protected title(b: Bet): string { return betLabel(this.sport() ?? this.state.sportKey(), b.type, b.box); }

  constructor() {
    effect(() => {
      const view = this.flow.result();
      if (!view) return;
      untracked(() => {
        this.amount.set(0);
        afterNextRender(() => this.animateIn(view.outcome), { injector: this.injector });
      });
    });
  }

  private animateIn(o: Outcome): void {
    this.motion.cancelCelebration();
    this.scroll().nativeElement.scrollTop = 0;
    this.list().nativeElement.scrollTop = 0;   // its own scroller in the desktop layout
    const kind = outcomeKind(o);
    const credit = () => this.ui.renderBalance({ animate: true });

    if (this.motion.reducedMotion()) {
      this.amount.set(o.returned);
      credit();
      return;
    }
    const tl = gsap.timeline();
    tl.fromTo(this.hero().nativeElement.children, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.08 })
      .fromTo(this.podiumEl().nativeElement.querySelectorAll('.podium__step'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'expo.out', stagger: 0.07 }, 0.25)
      .fromTo(this.betsEl().nativeElement.children, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'expo.out', stagger: 0.05 }, 0.4)
      .fromTo(this.actions().nativeElement, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out' }, 0.3);
    this.motion.trackCelebration(tl);

    if (kind === 'loss') { credit(); return; }

    tl.add(() => {
      const tween = this.motion.countUp(0, o.returned, {
        duration: kind === 'win' ? 1.6 : 0.9,
        onUpdate: v => this.amount.set(v),
        onComplete: () => {
          if (this.state.phase() !== 'result') return;
          if (kind !== 'win') { credit(); return; }
          const el = this.amountEl()?.nativeElement;
          if (!el) { credit(); return; }
          const r = el.getBoundingClientRect();
          this.motion.burst(r.left + r.width / 2, r.top + r.height / 2, { power: o.returned / o.staked > 5 ? 1.2 : 1 });
          this.motion.haptic([18, 40, 30]);
          gsap.fromTo(el, { scale: 1.08 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
          this.motion.flyCoins(el, this.ui.balanceEl, { onFirstArrive: credit });
        },
      });
      this.motion.trackCelebration(tween);
    }, 0.2);
  }
}

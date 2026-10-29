import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, untracked, viewChild,
} from '@angular/core';
import { CONFIG } from '../../core/config';
import { maxReturn } from '../../core/pricing';
import type { Bet } from '../../core/models';
import { BetslipStore, parseStake, stepStake } from '../../services/betslip-store';
import { Formatter } from '../../services/formatter';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';
import { Motion, gsap } from '../../services/motion';
import { UiShell } from '../../services/ui-shell';
import { Viewport } from '../../services/viewport';
import { BetSelection } from '../../shared/bet-selection';

/**
 * Betslip: stakes, tickets, max return and Place bet. A bottom sheet on phones (bar + foot, the panel
 * slides open); a docked column at ≥1024px, always open while betting.
 */
@Component({
  selector: 'aside[app-betslip]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BetSelection],
  host: {
    class: 'slip col-lg-auto',
    'aria-label': 'Betslip',
    '[class.is-visible]': 'store.visible()',
    '[class.is-empty]': '!store.bets().length',
    '[class.is-open]': 'store.open()',
    '(window:resize)': 'requestMeasure()',
  },
  templateUrl: './betslip.html',
})
export class Betslip {
  protected readonly store = inject(BetslipStore);
  protected readonly fmt = inject(Formatter);
  protected readonly state = inject(GameState);
  private readonly flow = inject(GameFlow);
  protected readonly ui = inject(UiShell);
  private readonly motion = inject(Motion);
  private readonly viewport = inject(Viewport);
  private readonly injector = inject(Injector);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly foot = viewChild.required<ElementRef<HTMLElement>>('foot');
  private readonly count = viewChild.required<ElementRef<HTMLElement>>('count');
  private readonly ret = viewChild.required<ElementRef<HTMLElement>>('ret');

  protected readonly chips = CONFIG.stakeChips;
  /** A chip is lit when every bet on the slip uses its stake. */
  protected readonly allSame = computed(() => {
    const bets = this.store.bets();
    return bets.length > 0 && bets.every(b => b.stake === this.state.stake());
  });
  protected readonly names = computed(() =>
    Object.fromEntries(Object.values(this.state.field()?.runners ?? {}).map(r => [r.no, r.name])));
  protected readonly ticketMax = computed(() => {
    const f = this.state.field();
    return new Map(this.store.bets().map(b => [b.id, f ? maxReturn([b], f.horses, f.places) : 0]));
  });

  constructor() {
    // Off screen (race started, or emptied on a phone): close the sheet. Switching layout closes it too.
    effect(() => { if (!this.store.visible() && this.store.open()) this.store.setOpen(false); });
    effect(() => { this.viewport.docked(); untracked(() => this.store.setOpen(false)); });

    let wasOpen = false;
    effect(() => {
      const open = this.store.open();
      if (open === wasOpen) return;
      wasOpen = open;
      untracked(() => afterNextRender(() => this.animateOpen(open), { injector: this.injector }));
    });

    // The count and max return pop when a bet is added.
    effect(() => {
      if (!this.store.added()) return;
      untracked(() => afterNextRender(() => {
        if (this.motion.reducedMotion()) return;
        gsap.fromTo(this.count().nativeElement, { scale: 1.5 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
        gsap.fromTo(this.ret().nativeElement, { y: -6, opacity: 0.4 }, { y: 0, opacity: 1, duration: 0.35, ease: 'expo.out' });
      }, { injector: this.injector }));
    });

    // The views pad their scrollers by the visible slip's height (--slip-h).
    effect(() => {
      this.store.visible();
      this.store.bets();
      this.viewport.docked();
      untracked(() => this.requestMeasure());
    });
  }

  protected requestMeasure(): void {
    afterNextRender(() => {
      const visible = this.store.visible() && !this.viewport.docked();
      this.ui.slipHeight.set(visible ? this.bar().nativeElement.offsetHeight + this.foot().nativeElement.offsetHeight : 0);
    }, { injector: this.injector });
  }

  private panelTarget(): number {
    const panel = this.panel().nativeElement;
    const app = this.host.nativeElement.closest('.app') as HTMLElement;
    return Math.min(panel.scrollHeight, Math.round(app.clientHeight * 0.62));
  }

  private animateOpen(open: boolean): void {
    const panel = this.panel().nativeElement;
    const reduced = this.motion.reducedMotion();
    if (open) {
      panel.style.height = 'auto';
      const target = this.panelTarget();
      panel.style.height = '0px';
      gsap.to(panel, { height: target, duration: reduced ? 0 : 0.42, ease: 'expo.out' });
    } else {
      gsap.to(panel, { height: 0, duration: reduced ? 0 : 0.3, ease: 'power3.out' });
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  private resizeOpen(): void {
    if (!this.store.open()) return;
    const panel = this.panel().nativeElement;
    const cur = panel.offsetHeight;
    panel.style.height = 'auto';
    const target = this.panelTarget();
    panel.style.height = cur + 'px';
    gsap.to(panel, { height: target, duration: 0.25, ease: 'power2.out' });
  }

  protected toggle(): void { this.store.setOpen(!this.store.open()); }

  protected remove(event: Event, id: string): void {
    const li = (event.currentTarget as HTMLElement).closest('.ticket');
    const done = () => {
      this.store.removeBet(id);
      if (!this.store.bets().length) this.store.setOpen(false);
      else afterNextRender(() => this.resizeOpen(), { injector: this.injector });
    };
    if (this.motion.reducedMotion() || !li) done();
    else gsap.to(li, { x: 40, opacity: 0, duration: 0.2, ease: 'power2.in', onComplete: done });
  }

  protected setAllStakes(v: number): void { this.store.setAllStakes(v); }

  protected customStake(input: HTMLInputElement): void {
    const v = parseStake(input.value);
    input.value = '';
    if (v != null) this.store.setAllStakes(v);
  }

  protected ticketStake(input: HTMLInputElement, bet: Bet): void {
    const v = parseStake(input.value);
    if (v != null) this.store.setStake(bet.id!, v);
    input.value = (v ?? bet.stake).toFixed(2);
  }

  protected step(bet: Bet, dir: 1 | -1): number | null { return stepStake(bet.stake, dir); }

  /** The ticket's − / + : the next stake chip down or up. */
  protected stepTicket(bet: Bet, dir: 1 | -1): void {
    const v = stepStake(bet.stake, dir);
    if (v != null) this.store.setStake(bet.id!, v);
  }

  protected clearAll(): void {
    this.store.clear();
    this.store.setOpen(false);
  }

  protected place(): void { this.flow.placeSlip(); }

}

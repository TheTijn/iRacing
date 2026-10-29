import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { round2 } from '../../core/pricing';
import { AUTO_ROUNDS, AUTO_WIN_MULTIPLE, AutoPlay } from '../../services/auto-play';
import { BetslipStore } from '../../services/betslip-store';
import { Formatter } from '../../services/formatter';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';
import { UiShell } from '../../services/ui-shell';

/** Auto play sheet: number of races, loss limit, single win limit and skip to results for the slip's bets. */
@Component({
  selector: 'div[app-auto-sheet]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sheet sheet--auto',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'autoTitle',
    '[class.is-open]': 'open()',
  },
  templateUrl: './auto-sheet.html',
})
export class AutoSheet {
  protected readonly fmt = inject(Formatter);
  protected readonly ui = inject(UiShell);
  protected readonly slip = inject(BetslipStore);
  private readonly state = inject(GameState);
  private readonly flow = inject(GameFlow);
  private readonly auto = inject(AutoPlay);
  private readonly injector = inject(Injector);
  private readonly closeBtn = viewChild.required<ElementRef<HTMLElement>>('close');

  protected readonly open = computed(() => this.ui.sheet() === 'auto');
  protected readonly roundOptions = AUTO_ROUNDS;
  protected readonly winMultiple = AUTO_WIN_MULTIPLE;

  protected readonly rounds = signal(this.auto.options().rounds);
  protected readonly winLimit = signal(this.auto.options().winLimit);
  protected readonly skip = signal(this.auto.options().skip);
  /** Cost of one race: the slip's bets at their stakes. */
  protected readonly cost = this.slip.cost;
  protected readonly totalRisk = computed(() => round2(this.cost() * this.rounds()));
  /** Defaults to the total risk; reset whenever the races or the slip change. */
  protected readonly lossLimit = linkedSignal(() => this.totalRisk());
  protected readonly affordable = computed(() => this.cost() > 0 && this.cost() <= this.state.balance() + 1e-9);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        const o = this.auto.options();
        this.rounds.set(o.rounds);
        this.winLimit.set(o.winLimit);
        this.skip.set(o.skip);
        this.lossLimit.set(this.totalRisk());
      });
      afterNextRender(() => this.closeBtn().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    });
  }

  /** The loss limit moves in steps of one race's cost, between one race and the total risk. */
  private clampLimit(v: number): number { return round2(Math.min(this.totalRisk(), Math.max(this.cost(), v))); }

  protected stepLimit(dir: 1 | -1): void { this.lossLimit.set(this.clampLimit(this.lossLimit() + dir * this.cost())); }

  protected typeLimit(input: HTMLInputElement): void {
    const v = parseFloat(input.value.replace(',', '.'));
    if (Number.isFinite(v)) this.lossLimit.set(this.clampLimit(v));
    input.value = this.lossLimit().toFixed(2);
  }

  protected start(): void {
    this.flow.startAuto({ rounds: this.rounds(), lossLimit: this.lossLimit(), winLimit: this.winLimit(), skip: this.skip() });
  }
}

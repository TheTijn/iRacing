import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AutoPlay } from '../services/auto-play';
import { Formatter } from '../services/formatter';
import { GameFlow } from '../services/game-flow';
import { GameState } from '../services/game-state';

/** Auto play progress (race n of N, net so far, next race countdown) and Stop. Shown while auto play runs. */
@Component({
  selector: 'div[app-auto-status]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'autobar d-flex align-items-center gap-3', role: 'status' },
  template: `
    @if (auto.run(); as r) {
      <svg class="autobar__icon flex-shrink-0" aria-hidden="true"><use href="#i-timer"/></svg>
      <div class="autobar__text flex-grow-1 min-w-0">
        <b>Auto play · {{ race() }} of {{ r.rounds }}</b>
        <small>
          @if (auto.nextIn() !== null) { Next race in {{ auto.nextIn() }}s · }
          Net <span [class.is-up]="r.net > 0">{{ r.net > 0 ? '+' : '' }}{{ fmt.money(r.net) }}</span>
        </small>
      </div>
      <button class="btn btn--ghost btn--sm flex-shrink-0" (click)="flow.stopAuto()">Stop</button>
    }
  `,
})
export class AutoStatus {
  protected readonly auto = inject(AutoPlay);
  protected readonly flow = inject(GameFlow);
  protected readonly fmt = inject(Formatter);
  private readonly state = inject(GameState);

  /** The race being run, or on the result screen the one just finished. */
  protected readonly race = computed(() => {
    const r = this.auto.run()!;
    return this.state.phase() === 'racing' ? r.played + 1 : Math.max(1, r.played);
  });
}

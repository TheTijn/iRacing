import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { Formatter } from '../../services/formatter';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';
import { UiShell } from '../../services/ui-shell';

/** Wordmark (its two stripes open the lobby), balance pill, history and settings buttons. */
@Component({
  selector: 'header[app-topbar]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'topbar d-flex align-items-center justify-content-between gap-3' },
  templateUrl: './topbar.html',
})
export class Topbar {
  protected readonly state = inject(GameState);
  protected readonly flow = inject(GameFlow);
  protected readonly ui = inject(UiShell);
  protected readonly fmt = inject(Formatter);

  private readonly balance = viewChild.required<ElementRef<HTMLElement>>('balance');

  /** Wordmark second line: 'Games' in the lobby, else the sport being played. */
  protected readonly brand = computed(() => (this.state.phase() === 'lobby' ? 'Games' : this.state.sport().brand));

  constructor() {
    effect(() => { this.ui.balanceEl = this.balance().nativeElement; });
    // Replay the pill's highlight whenever the balance animates.
    effect(() => {
      if (!this.ui.balanceBump()) return;
      const pill = this.balance().nativeElement;
      pill.classList.remove('is-bump');
      void pill.offsetWidth;
      pill.classList.add('is-bump');
    });
  }
}

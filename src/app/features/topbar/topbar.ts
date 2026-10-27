import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Formatter } from '../../services/formatter';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';
import { Persistence } from '../../services/persistence';
import { UiShell } from '../../services/ui-shell';

/** Session timer (top-right corner), wordmark (its two stripes open the lobby), balance pill, help, history and settings buttons. */
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

  /** Time played this session, hh:mm:ss (responsible-gambling reality check). */
  private readonly start = inject(Persistence).sessionStart();
  private readonly now = signal(Date.now());
  protected readonly sessionTime = computed(() => {
    const s = Math.max(0, Math.floor((this.now() - this.start) / 1000));
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':');
  });

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
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

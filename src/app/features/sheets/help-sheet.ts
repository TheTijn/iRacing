import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, viewChild } from '@angular/core';
import { placesFor } from '../../core/pricing';
import { betHint, betLabel } from '../../core/sports';
import { GameState } from '../../services/game-state';
import { UiShell } from '../../services/ui-shell';

/** How to play: the round, the markets (worded for the current game), returns, the live race and settings. */
@Component({
  selector: 'div[app-help-sheet]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sheet sheet--tall',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'helpTitle',
    '[class.is-open]': 'open()',
  },
  templateUrl: './help-sheet.html',
})
export class HelpSheet {
  protected readonly state = inject(GameState);
  protected readonly ui = inject(UiShell);
  private readonly injector = inject(Injector);
  private readonly closeBtn = viewChild.required<ElementRef<HTMLElement>>('close');

  protected readonly open = computed(() => this.ui.sheet() === 'help');
  protected readonly runners = computed(() => this.state.field()?.horses.length ?? this.state.gameInfo().runners ?? 8);
  protected readonly places = computed(() => this.state.field()?.places ?? placesFor(this.runners()));
  /** The Exotics tab for this sport, e.g. Forecast / Tricast for dogs. */
  protected readonly exotics = computed(() => {
    const sport = this.state.sportKey();
    return this.state.sport().exotics.map(t => ({ label: betLabel(sport, t), hint: betHint(sport, t) }));
  });

  constructor() {
    effect(() => {
      if (this.open()) afterNextRender(() => this.closeBtn().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    });
  }
}

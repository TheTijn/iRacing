import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, viewChild } from '@angular/core';
import type { OddsFormat, Settings } from '../../core/models';
import { GameFlow } from '../../services/game-flow';
import { GameState } from '../../services/game-state';
import { UiShell } from '../../services/ui-shell';

/** Settings sheet: odds format, instant results, data saver, auto play, demo balance reset. */
@Component({
  selector: 'div[app-settings-sheet]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'settingsTitle',
    '[class.is-open]': 'open()',
  },
  templateUrl: './settings-sheet.html',
})
export class SettingsSheet {
  protected readonly state = inject(GameState);
  protected readonly flow = inject(GameFlow);
  protected readonly ui = inject(UiShell);
  private readonly injector = inject(Injector);
  private readonly closeBtn = viewChild.required<ElementRef<HTMLElement>>('close');

  protected readonly open = computed(() => this.ui.sheet() === 'settings');
  protected readonly oddsFormats: { value: OddsFormat; label: string; sample: string }[] = [
    { value: 'decimal', label: 'Decimal', sample: '3.75' },
    { value: 'fractional', label: 'Fractional', sample: '11/4' },
    { value: 'american', label: 'American', sample: '+275' },
  ];

  constructor() {
    effect(() => {
      if (this.open()) afterNextRender(() => this.closeBtn().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    });
  }

  protected set<K extends keyof Settings>(key: K, value: Settings[K]): void { this.flow.updateSetting(key, value); }
}

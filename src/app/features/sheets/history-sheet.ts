import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { SPORTS, betLabel } from '../../core/sports';
import type { HistoryBet, HistoryEntry, SportKey } from '../../core/models';
import { Formatter } from '../../services/formatter';
import { Persistence } from '../../services/persistence';
import { UiShell } from '../../services/ui-shell';
import { BetSelection } from '../../shared/bet-selection';

/** My bets: this session's settled races and bets (sessionStorage), newest first. */
@Component({
  selector: 'div[app-history-sheet]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BetSelection],
  host: {
    class: 'sheet sheet--tall',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'historyTitle',
    '[class.is-open]': 'open()',
  },
  templateUrl: './history-sheet.html',
})
export class HistorySheet {
  protected readonly ui = inject(UiShell);
  protected readonly fmt = inject(Formatter);
  private readonly persistence = inject(Persistence);
  private readonly injector = inject(Injector);
  private readonly closeBtn = viewChild.required<ElementRef<HTMLElement>>('close');

  protected readonly open = computed(() => this.ui.sheet() === 'history');
  protected readonly entries = signal<HistoryEntry[]>([]);

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => this.entries.set(this.persistence.loadHistory()));
      afterNextRender(() => this.closeBtn().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    });
  }

  protected heading(h: HistoryEntry): string {
    const where = h.venue ? ` · ${h.venue}` : h.sport ? ` · ${SPORTS[h.sport]?.name || ''}` : '';
    const at = new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Race ${h.raceNo}${where} · ${at}`;
  }

  protected title(b: HistoryBet, sport: SportKey): string { return betLabel(sport, b.type, b.box); }
}

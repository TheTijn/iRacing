import {
  ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, afterNextRender, computed, effect, inject, viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Betslip } from './features/betslip/betslip';
import { LiveRace } from './features/live-race/live-race';
import { Lobby } from './features/lobby/lobby';
import { RaceCard } from './features/race-card/race-card';
import { Result } from './features/result/result';
import { AutoSheet } from './features/sheets/auto-sheet';
import { HelpSheet } from './features/sheets/help-sheet';
import { HistorySheet } from './features/sheets/history-sheet';
import { SettingsSheet } from './features/sheets/settings-sheet';
import { Topbar } from './features/topbar/topbar';
import { BetslipStore } from './services/betslip-store';
import { GameFlow } from './services/game-flow';
import { GameState } from './services/game-state';
import { Motion } from './services/motion';
import { UiShell } from './services/ui-shell';

/**
 * App shell. Layout is Bootstrap (layout only, see src/styles/_bootstrap.scss): a column of top bar and a
 * row of [views | betslip]. Responsive classes use lg (≥1024, widescreen desktop) and xl (≥1280) only:
 * 768–1023 is the phone-like tablet shell. Each view is a component on its own <section>.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Topbar, Lobby, RaceCard, LiveRace, Result, Betslip, SettingsSheet, HistorySheet, HelpSheet, AutoSheet],
  host: {
    id: 'app',
    class: 'app d-flex flex-column',
    '[attr.data-phase]': 'state.phase()',
    '[attr.data-sport]': 'state.sportKey()',
    '[style.--slip-h]': "ui.slipHeight() + 'px'",
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './app.html',
})
export class App {
  protected readonly state = inject(GameState);
  protected readonly ui = inject(UiShell);
  private readonly slip = inject(BetslipStore);
  private readonly flow = inject(GameFlow);
  private readonly motion = inject(Motion);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);

  private readonly lobby = viewChild.required(Lobby, { read: ElementRef });
  private readonly card = viewChild.required(RaceCard, { read: ElementRef });
  private readonly live = viewChild.required(LiveRace, { read: ElementRef });
  private readonly result = viewChild.required(Result, { read: ElementRef });
  private readonly fx = viewChild.required<ElementRef<HTMLCanvasElement>>('fx');

  protected readonly scrimOn = computed(() => this.ui.sheet() !== null || this.slip.open());

  constructor() {
    // Page title: 'Instant Games' in the lobby, else the sport being played.
    effect(() => {
      const brand = this.state.phase() === 'lobby' ? 'Games' : this.state.sport().brand;
      this.title.setTitle(`Instant ${brand}`);
    });
    // The current race's still, blurred behind the app on tablets and desktops.
    effect(() => {
      const r = this.state.race();
      if (r) this.document.body.style.setProperty('--poster', `url(${new URL(r.thumb || r.poster, location.href).href})`);
    });

    afterNextRender(() => {
      this.ui.registerViews({
        lobby: this.lobby().nativeElement,
        betting: this.card().nativeElement,
        racing: this.live().nativeElement,
        result: this.result().nativeElement,
      });
      this.motion.attachCanvas(this.fx().nativeElement);
      this.flow.init();
    });
  }

  protected closeOverlays(): void {
    this.ui.closeSheet();
    this.slip.close();
  }

  protected onEscape(): void {
    if (this.ui.sheet()) this.ui.closeSheet();
    else this.flow.escape();
  }
}

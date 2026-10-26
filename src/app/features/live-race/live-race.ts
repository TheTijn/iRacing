import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { Formatter, PLACE_SUFFIX } from '../../services/formatter';
import { GameState } from '../../services/game-state';
import { RaceEngine } from '../../services/race-engine';
import { RunnerIcon } from '../../shared/runner-icon';

/**
 * Live race: the video stage (with callouts and the data saver toggle), distance rail, running order strip,
 * the player's live bets and Skip. RaceEngine drives it all; this view renders its signals.
 */
@Component({
  selector: 'section[app-live-race]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RunnerIcon],
  host: { class: 'view view--race', 'aria-label': 'Live race' },
  templateUrl: './live-race.html',
})
export class LiveRace {
  protected readonly state = inject(GameState);
  protected readonly engine = inject(RaceEngine);
  protected readonly fmt = inject(Formatter);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly suffix = PLACE_SUFFIX;
  protected readonly saddles = computed(() => this.state.sport().icon === 'silk');
  protected readonly horses = computed(() => this.state.field()?.horses ?? []);
  /** Chips are keyed per race, so a new race starts from trap order instead of sliding over from the last one. */
  protected readonly chips = computed(() => {
    const run = this.engine.runId();
    return this.horses().map(h => ({ h, key: `${run}:${h}` }));
  });

  constructor() {
    effect(() => this.engine.attachVideo(this.video().nativeElement));
  }

  protected name(no: number): string { return this.state.field()?.runners[no]?.name ?? ''; }
  protected pos(no: number): number { return this.engine.positions().get(no) ?? 0; }
}

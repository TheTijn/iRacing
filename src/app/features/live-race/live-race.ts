import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, effect, inject, viewChild } from '@angular/core';
import { Formatter, PLACE_SUFFIX } from '../../services/formatter';
import { GameState } from '../../services/game-state';
import { Motion, gsap } from '../../services/motion';
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
  private readonly motion = inject(Motion);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly suffix = PLACE_SUFFIX;
  protected readonly saddles = computed(() => this.state.sport().icon === 'silk');
  protected readonly horses = computed(() => this.state.field()?.horses ?? []);
  /** Chips are keyed per race, so a new race starts from trap order instead of sliding over from the last one. */
  protected readonly chips = computed(() => {
    const run = this.engine.runId();
    return this.horses().map(h => ({ h, key: `${run}:${h}` }));
  });

  private readonly betList = viewChild.required<ElementRef<HTMLUListElement>>('betList');
  /** Each live bet row's last laid-out offsetTop, by bet id. */
  private readonly rowTops = new Map<string, number>();

  constructor() {
    effect(() => this.engine.attachVideo(this.video().nativeElement));
    // FLIP: when the live bets re-sort (winning → in reach → behind), slide each row from where it was.
    afterRenderEffect(() => {
      this.engine.liveBets();
      const rows = [...this.betList().nativeElement.children] as HTMLElement[];
      const animate = !this.motion.reducedMotion();
      const tops = new Map<string, number>();
      for (const el of rows) {
        const id = el.dataset['id']!;
        const top = el.offsetTop;   // layout position: ignores an in-flight transform
        tops.set(id, top);
        const prev = this.rowTops.get(id);
        if (prev === undefined || !animate) continue;
        const dy = prev + Number(gsap.getProperty(el, 'y')) - top;
        if (Math.abs(dy) < 1) continue;
        gsap.fromTo(el, { y: dy }, { y: 0, duration: 0.45, ease: 'power3.out', overwrite: true, clearProps: 'transform' });
      }
      this.rowTops.clear();
      tops.forEach((v, k) => this.rowTops.set(k, v));
    });
  }

  protected name(no: number): string { return this.state.field()?.runners[no]?.name ?? ''; }
  protected pos(no: number): number { return this.engine.positions().get(no) ?? 0; }
}

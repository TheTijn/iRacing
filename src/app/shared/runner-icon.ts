import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SPORTS } from '../core/sports';
import type { Colours, SportKey } from '../core/models';
import { GameState } from '../services/game-state';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

// Check pattern squares (silk body), and the three hoops of trap 6's jacket.
const CHECK_SIZE = 3.4;
const CHECKS: { x: string; y: string }[] = [];
for (let y = 12, row = 0; y < 38; y += CHECK_SIZE, row++) {
  for (let x = 10, col = 0; x < 30; x += CHECK_SIZE, col++) {
    if ((row + col) % 2) CHECKS.push({ x: x.toFixed(1), y: y.toFixed(1) });
  }
}
const HOOP_H = (30 / 7).toFixed(2);
const HOOPS = [0, 1, 2].map(i => (5 + 30 / 7 + i * 60 / 7).toFixed(2));

const FALLBACK: Colours = { body: '#777', sleeves: '#777', cap: '#777', ink: '#fff', pattern: 'plain' };

/**
 * A runner's icon as inline SVG: racing silks (horses, matching the jockeys in the videos) or a trap jacket
 * (greyhounds, matching the Kiron trap chips). Used on an <svg> element: `<svg appRunnerIcon [no]="3"></svg>`.
 * The silk clip path and shading gradient are the shared defs in index.html.
 */
@Component({
  selector: 'svg[appRunnerIcon]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'silk',
    '[class.silk--trap]': 'trap()',
    viewBox: '0 0 40 40',
    'aria-hidden': 'true',
  },
  template: `
    @if (trap()) {
      <svg:rect x="5" y="5" width="30" height="30" rx="6.5" [attr.fill]="c().body" />
      @if (c().pattern === 'hoops') {
        <svg:g clip-path="url(#trapRug)" [attr.fill]="c().alt">
          @for (y of hoops; track $index) { <svg:rect x="5" [attr.y]="y" width="30" [attr.height]="hoopH" /> }
        </svg:g>
      } @else if (c().pattern === 'quarters') {
        <!-- alt in the top-right and bottom-left quarters -->
        <svg:g clip-path="url(#trapRug)" [attr.fill]="c().alt">
          <svg:rect x="20" y="5" width="15" height="15" /><svg:rect x="5" y="20" width="15" height="15" />
        </svg:g>
      }
      <svg:rect x="5" y="5" width="30" height="30" rx="6.5" fill="url(#silkShade)" [attr.stroke]="edge()" stroke-width=".8" />
      <svg:text x="20" y="21.5" text-anchor="middle" dominant-baseline="central" [attr.fill]="c().ink"
        [attr.stroke]="c().pattern === 'hoops' ? '#fff' : null" [attr.stroke-width]="c().pattern === 'hoops' ? 2.4 : null"
        [attr.paint-order]="c().pattern === 'hoops' ? 'stroke' : null" [attr.stroke-linejoin]="c().pattern === 'hoops' ? 'round' : null">{{ no() }}</svg:text>
    } @else {
      <svg:path d="M12.9 15.5 Q7.6 16.9 5.5 24.6 L4.5 30.3 Q6.6 31.7 8.7 31 L10.5 25 Q11.4 22.4 12.5 21.5 Z" [attr.fill]="c().sleeves" [attr.stroke]="edge()" stroke-width=".7" />
      <svg:path d="M12.9 15.5 Q7.6 16.9 5.5 24.6 L4.5 30.3 Q6.6 31.7 8.7 31 L10.5 25 Q11.4 22.4 12.5 21.5 Z" [attr.fill]="c().sleeves" [attr.stroke]="edge()" stroke-width=".7" transform="translate(40 0) scale(-1 1)" />
      <svg:path d="M12.4 15.2 Q20 12.6 27.6 15.2 L29 35.2 Q20 37.6 11 35.2 Z" [attr.fill]="c().body" />
      @switch (c().pattern) {
        @case ('check') {
          <svg:g clip-path="url(#silkBody)" [attr.fill]="c().alt">
            @for (r of checks; track $index) { <svg:rect [attr.x]="r.x" [attr.y]="r.y" [attr.width]="checkSize" [attr.height]="checkSize" /> }
          </svg:g>
        }
        @case ('stripe') { <svg:g clip-path="url(#silkBody)" [attr.fill]="c().alt"><svg:rect x="17.4" y="10" width="5.2" height="30" /></svg:g> }
        @case ('yoke') { <svg:g clip-path="url(#silkBody)" [attr.fill]="c().alt"><svg:path d="M8 10 H32 V19.4 Q20 22.6 8 19.4 Z" /></svg:g> }
      }
      <svg:path d="M12.4 15.2 Q20 12.6 27.6 15.2 L29 35.2 Q20 37.6 11 35.2 Z" fill="url(#silkShade)" [attr.stroke]="edge()" stroke-width=".7" />
      <svg:path d="M17 14.2 L20 17.6 L23 14.2" fill="none" stroke="rgba(0,0,0,.28)" stroke-width=".9" stroke-linecap="round" />
      <svg:path d="M13.6 10.8 Q13.8 3.2 20 3 Q26.2 3.2 26.4 10.8 Z" [attr.fill]="c().cap" [attr.stroke]="capEdge()" stroke-width=".7" />
      <svg:path d="M13.6 10.8 Q13.8 3.2 20 3 Q26.2 3.2 26.4 10.8 Z" fill="url(#silkShade)" />
      <svg:path d="M12.8 10.6 H27.6 Q27.8 12.4 26 12.4 H14.2 Q12.8 12.4 12.8 10.6 Z" [attr.fill]="c().cap" />
      <svg:path d="M12.8 10.6 H27.6 Q27.8 12.4 26 12.4 H14.2 Q12.8 12.4 12.8 10.6 Z" fill="rgba(0,0,0,.3)" />
    }
  `,
})
export class RunnerIcon {
  private readonly state = inject(GameState);

  /** Saddle / trap number. */
  readonly no = input.required<number>();
  /** Sport whose colours to use (defaults to the sport being played; history entries pass their own). */
  readonly sport = input<SportKey>();

  protected readonly checks = CHECKS;
  protected readonly checkSize = CHECK_SIZE;
  protected readonly hoops = HOOPS;
  protected readonly hoopH = HOOP_H;

  private readonly sportInfo = computed(() => SPORTS[this.sport() ?? this.state.sportKey()]);
  protected readonly trap = computed(() => this.sportInfo().icon === 'trap');
  protected readonly c = computed(() => this.sportInfo().colours[this.no()] ?? FALLBACK);
  protected readonly edge = computed(() =>
    lum(this.c().body) < 0.25 ? (this.trap() ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.32)') : 'rgba(0,0,0,.28)');
  protected readonly capEdge = computed(() => (lum(this.c().cap ?? '#777') < 0.25 ? 'rgba(255,255,255,.32)' : 'rgba(0,0,0,.25)'));
}

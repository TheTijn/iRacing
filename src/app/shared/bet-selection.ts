import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { BET_TYPES } from '../core/pricing';
import type { Bet, ByRunner, SportKey } from '../core/models';
import { RunnerIcon } from './runner-icon';

type Selection = Pick<Bet, 'type' | 'box' | 'side' | 'legs'>;

/**
 * A bet's selection as runner chips: '#3 Name', '#1 ahead of #2', '#1 → #4', 'Odd' + chips, …
 * Shared by the betslip, result screen and history. Goes on the (flex) container element:
 * `<div class="ticket__sel" appBetSelection [bet]="b" [names]="names"></div>`.
 */
@Component({
  selector: '[appBetSelection]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RunnerIcon],
  template: `
    <ng-template #tag let-h let-showName="showName">
      <span class="mini-silk"><svg appRunnerIcon [no]="h" [sport]="sport()"></svg><b>#{{ h }}</b></span>
      @if (showName) { <span class="ticket__name">{{ names()[h] }}</span> }
    </ng-template>

    @let b = bet();
    @switch (kind()) {
      @case ('set') {
        <span class="sel-side">{{ b.side }}</span>
        @for (h of b.legs[0]; track h) { <span class="mini-silk"><svg appRunnerIcon [no]="h" [sport]="sport()"></svg></span> }
      }
      @case ('pair') {
        <ng-container *ngTemplateOutlet="tag; context: { $implicit: b.legs[0][0], showName: true }" />
        <span class="sep">ahead of</span>
        <ng-container *ngTemplateOutlet="tag; context: { $implicit: b.legs[1][0], showName: false }" />
      }
      @case ('single') {
        <ng-container *ngTemplateOutlet="tag; context: { $implicit: b.legs[0][0], showName: true }" />
      }
      @case ('ordered') {
        @for (leg of b.legs; track $index; let first = $first) {
          @if (!first) { <span class="sep">→</span> }
          @for (h of leg; track h; let firstH = $first) {
            @if (!firstH) { <span class="sep">/</span> }
            <ng-container *ngTemplateOutlet="tag; context: { $implicit: h, showName: namedLegs() }" />
          }
        }
      }
      @default {
        @for (h of anyOrder(); track h; let first = $first) {
          @if (!first) { <span class="sep">·</span> }
          <ng-container *ngTemplateOutlet="tag; context: { $implicit: h, showName: false }" />
        }
      }
    }
  `,
})
export class BetSelection {
  readonly bet = input.required<Selection>();
  /** Runner number → name, for the runners the bet names. */
  readonly names = input.required<ByRunner<string>>();
  /** Sport of the bet's race (for the runner icons). */
  readonly sport = input<SportKey>();

  protected readonly kind = computed(() => {
    const { type, box } = this.bet();
    const t = BET_TYPES[type];
    if (t.set) return 'set';
    if (t.pair) return 'pair';
    if (t.size === 1) return 'single';
    return t.ordered && !box ? 'ordered' : 'any';
  });
  /** Ordered picks show names only for a single straight Exacta / Forecast. */
  protected readonly namedLegs = computed(() => {
    const legs = this.bet().legs;
    return legs.every(l => l.length === 1) && legs.length === 2;
  });
  protected readonly anyOrder = computed(() => this.bet().legs[0].slice().sort((a, b) => a - b));
}

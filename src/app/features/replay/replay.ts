import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { GameState } from '../../services/game-state';
import { ReplayPlayer } from '../../services/replay-player';

/** Finish replay overlay (slow-motion replay from the race video). Tap outside the frame to close. */
@Component({
  selector: 'div[app-replay]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'replay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Finish replay',
    '[class.is-open]': 'player.isOpen()',
    '(click)': 'backdrop($event)',
  },
  template: `
    <div class="replay__frame">
      <video #video muted playsinline webkit-playsinline preload="none" disablepictureinpicture></video>
      <span class="replay__tag">{{ state.sport().replayTag }}</span>
      <button class="icon-btn icon-btn--glass replay__close" aria-label="Close replay" (click)="player.close()"><svg><use href="#i-close"/></svg></button>
    </div>
  `,
})
export class Replay {
  protected readonly state = inject(GameState);
  protected readonly player = inject(ReplayPlayer);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  constructor() {
    effect(() => this.player.attachVideo(this.video().nativeElement));
  }

  protected backdrop(event: Event): void {
    if (event.target === this.host.nativeElement) this.player.close();
  }
}

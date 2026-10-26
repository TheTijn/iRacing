import { Injectable, signal } from '@angular/core';

/**
 * Widescreen desktop layout (docked betslip, multi-column views). Matches `wide` (Bootstrap lg) in
 * src/styles/_tokens.scss: keep the two in sync.
 */
@Injectable({ providedIn: 'root' })
export class Viewport {
  private readonly dockMq = matchMedia('(min-width: 1024px)');
  /** True when the betslip is a docked column instead of a bottom sheet. */
  readonly docked = signal(this.dockMq.matches);

  constructor() {
    this.dockMq.addEventListener('change', () => this.docked.set(this.dockMq.matches));
  }
}
